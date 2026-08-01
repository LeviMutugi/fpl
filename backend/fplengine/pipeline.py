"""Model run orchestration.

A "run" is one reproducible pass over a snapshot: fit every model, measure every
model on held-out folds, blend them with weights learned from those folds, then
write predictions and metrics to the database under a single run id. The API only
ever reads runs, so what the UI shows is always a persisted, attributable
artefact rather than something recomputed on the fly.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from ..app import db as dbm
from . import evaluate, gbm
from .data import Dataset, load, target_event
from .structural import StructuralPredictor, summarise

# hue values are OKLCH hues, reused verbatim by the frontend so a model keeps its
# colour across every chart.
MODEL_DEFS: list[dict[str, Any]] = [
    {
        "model_id": "ensemble",
        "name": "Stacked ensemble",
        "family": "ensemble",
        "hue": 196,
        "description": (
            "Non-negative least-squares blend of the structural and gradient-boosted "
            "models, with weights fitted on out-of-fold predictions only. Adopts the "
            "structural model's distribution shape, rescaled to its blended mean."
        ),
    },
    {
        "model_id": "structural",
        "name": "Structural Poisson (empirical Bayes)",
        "family": "bayes",
        "hue": 146,
        "description": (
            "Builds points from the rulebook: availability, a minutes scenario mixture, "
            "empirical-Bayes shrunk per-90 rates, fixture adjustment by opponent "
            "strength, then exact convolution of the component distributions."
        ),
    },
    {
        "model_id": "lgbm",
        "name": "LightGBM rate-to-points",
        "family": "gbm",
        "hue": 62,
        "description": (
            "Gradient-boosted regression of points per 90 on a player's underlying "
            "per-90 profile. Cross-validated with folds grouped by club; features that "
            "restate the target (bonus, BPS, influence, ownership) are excluded."
        ),
    },
    {
        "model_id": "lgbm_quantile",
        "name": "LightGBM quantile",
        "family": "gbm",
        "hue": 28,
        "description": (
            "The same features fitted with a quantile objective at the 10th, 50th and "
            "90th percentile, scored by pinball loss out of fold."
        ),
    },
    {
        "model_id": "fpl_ep_next",
        "name": "FPL ep_next (baseline)",
        "family": "baseline",
        "hue": 0,
        "description": "The game's own published expected points for the next gameweek.",
    },
    {
        "model_id": "ppg_baseline",
        "name": "Points per game (baseline)",
        "family": "baseline",
        "hue": 300,
        "description": "Last season's points per appearance, carried forward unchanged.",
    },
    {
        "model_id": "form_baseline",
        "name": "Form (baseline)",
        "family": "baseline",
        "hue": 258,
        "description": "The game's rolling 30-day form figure.",
    },
]

# Models that produce a per-(player, event) forecast and are therefore persisted
# to the predictions table.
PREDICTIVE_MODELS = ("ensemble", "structural", "lgbm")


def _register_models(conn: sqlite3.Connection) -> None:
    dbm.upsert(
        conn,
        "model_registry",
        [
            {
                "model_id": m["model_id"],
                "name": m["name"],
                "family": m["family"],
                "description": m["description"],
                "hue": m["hue"],
            }
            for m in MODEL_DEFS
        ],
        ["model_id"],
    )


def run(
    conn: sqlite3.Connection,
    *,
    horizon: int = 5,
    event: int | None = None,
    n_splits: int = 5,
) -> dict[str, Any]:
    started = time.time()
    data: Dataset = load(conn)
    if data.players.empty or data.season.empty:
        raise RuntimeError("no player data ingested; run the FPL ingest first")

    te = int(event or target_event(data.events))
    horizon = max(1, min(horizon, 38 - te + 1))
    run_id = f"r-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-gw{te}-{uuid.uuid4().hex[:6]}"

    # ---------------------------------------------------------------- fit models
    structural = StructuralPredictor(data)
    frame = gbm.build_frame(data, structural.team_model)
    gbm_result = gbm.fit(frame, n_splits=n_splits)

    inputs_by_player: dict[int, dict[str, Any]] = {}
    neutral_pts90: dict[int, float] = {}
    for pid in data.players["id"].astype(int):
        inputs = structural.player_inputs(int(pid))
        if inputs is None:
            continue
        inputs_by_player[int(pid)] = inputs
        neutral_pts90[int(pid)] = structural.predict_neutral_90(inputs)[0]

    frame["structural_pts90"] = frame["player_id"].map(neutral_pts90).astype(float)
    frame["lgbm_pts90"] = gbm.GBMResult.predict_pts90(gbm_result, frame) if gbm_result.fitted else np.nan

    # ------------------------------------------------------------- evaluate them
    eval_frame = frame[frame["minutes"] >= gbm.MIN_MINUTES_FOR_EVAL].copy()
    actual = eval_frame["target_pts90"].to_numpy()
    weight = eval_frame["weight"].to_numpy()

    oof_lgbm = (
        eval_frame["player_id"].astype(int).map(gbm_result.oof_mean).to_numpy(dtype=float)
        if gbm_result.fitted
        else np.full(len(eval_frame), np.nan)
    )

    candidate_preds: dict[str, np.ndarray] = {
        "structural": eval_frame["structural_pts90"].to_numpy(dtype=float),
        "lgbm": oof_lgbm,
    }

    players_indexed = data.players.set_index("id")
    baseline_preds: dict[str, np.ndarray] = {
        "fpl_ep_next": eval_frame["player_id"]
        .map(lambda p: float(players_indexed.loc[p, "ep_next"] or 0.0))
        .to_numpy(dtype=float),
        "ppg_baseline": eval_frame["player_id"]
        .map(lambda p: float(players_indexed.loc[p, "points_per_game"] or 0.0))
        .to_numpy(dtype=float),
        "form_baseline": eval_frame["player_id"]
        .map(lambda p: float(players_indexed.loc[p, "form"] or 0.0))
        .to_numpy(dtype=float),
    }

    # Blend weights come only from out-of-fold predictions.
    weights = evaluate.stack_weights(
        {k: v for k, v in candidate_preds.items() if np.isfinite(v).any()}, actual, weight
    )
    ensemble_oof = np.zeros(len(eval_frame))
    for name, w in weights.items():
        col = np.nan_to_num(candidate_preds[name], nan=0.0)
        ensemble_oof += w * col

    metrics: dict[str, dict[str, float]] = {}
    calibrations: dict[str, list[dict[str, float]]] = {}
    for name, pred in {**candidate_preds, "ensemble": ensemble_oof, **baseline_preds}.items():
        m = evaluate.regression_metrics(actual, pred, weight)
        if m:
            metrics[name] = m
            calibrations[name] = evaluate.calibration_bins(actual, pred, n_bins=10, weight=weight)

    if gbm_result.fitted:
        q_metrics: dict[str, float] = {}
        for q, series in gbm_result.oof_quantiles.items():
            pred_q = eval_frame["player_id"].astype(int).map(series).to_numpy(dtype=float)
            mask = np.isfinite(pred_q)
            if mask.sum() > 10:
                q_metrics[f"pinball_p{int(q * 100)}"] = round(
                    gbm.pinball_loss(actual[mask], pred_q[mask], q, weight[mask]), 5
                )
                # Coverage: share of outcomes at or below the predicted quantile.
                q_metrics[f"coverage_p{int(q * 100)}"] = round(
                    float(np.average((actual[mask] <= pred_q[mask]).astype(float), weights=weight[mask])), 5
                )
        median = eval_frame["player_id"].astype(int).map(gbm_result.oof_quantiles.get(0.5, pd.Series(dtype=float)))
        median_arr = median.to_numpy(dtype=float)
        if np.isfinite(median_arr).any():
            q_metrics.update(evaluate.regression_metrics(actual, median_arr, weight))
        metrics["lgbm_quantile"] = q_metrics

    # ------------------------------------------------------------- predict events
    events = list(range(te, te + horizon))
    prediction_rows: list[dict[str, Any]] = []
    horizon_totals: dict[str, dict[int, float]] = {m: {} for m in PREDICTIVE_MODELS}
    event_xp: dict[str, dict[int, float]] = {m: {} for m in PREDICTIVE_MODELS}

    lgbm_pts90_by_player = (
        dict(zip(frame["player_id"].astype(int), frame["lgbm_pts90"].astype(float)))
        if gbm_result.fitted
        else {}
    )
    contribs = (
        gbm_result.contributions(frame) if gbm_result.fitted else np.zeros((len(frame), len(gbm.FEATURES) + 1))
    )
    contrib_index = {int(pid): i for i, pid in enumerate(frame["player_id"].astype(int))}

    fixtures_by_team_event = structural.fixture_map
    for pid, inputs in inputs_by_player.items():
        neutral = neutral_pts90.get(pid, 0.0)
        lgbm_p90 = lgbm_pts90_by_player.get(pid)
        for ev in events:
            pred = structural.predict_event(inputs, ev)
            base = summarise(pred)
            s_xp = base["xp_mean"]
            fixtures = fixtures_by_team_event.get((inputs["team_id"], ev), [])
            fx = fixtures[0] if fixtures else {}

            # Fixture-and-minutes factor implied by the structural model. Applying
            # it to the boosted per-90 forecast puts both models on the same
            # per-gameweek scale without the GBM needing fixture features it was
            # never trained on.
            factor = (s_xp / neutral) if neutral > 1e-6 else 0.0

            per_model: dict[str, float] = {"structural": s_xp}
            if lgbm_p90 is not None and np.isfinite(lgbm_p90):
                per_model["lgbm"] = round(float(lgbm_p90) * factor, 4)
            ens = 0.0
            for name, w in weights.items():
                ens += w * per_model.get(name, per_model["structural"])
            per_model["ensemble"] = round(ens, 4)

            for model_id, xp in per_model.items():
                if model_id not in PREDICTIVE_MODELS:
                    continue
                scale = (xp / s_xp) if s_xp > 1e-6 else 1.0
                row = {
                    "run_id": run_id,
                    "model_id": model_id,
                    "player_id": pid,
                    "event_id": ev,
                    "fixture_id": fx.get("fixture_id"),
                    "opponent_id": fx.get("opponent_id"),
                    "was_home": int(fx["is_home"]) if fx.get("is_home") is not None else None,
                    "difficulty": fx.get("difficulty"),
                    "xp_mean": round(xp, 4),
                    "xp_p10": round(base["xp_p10"] * scale, 3),
                    "xp_p25": round(base["xp_p25"] * scale, 3),
                    "xp_p50": round(base["xp_p50"] * scale, 3),
                    "xp_p75": round(base["xp_p75"] * scale, 3),
                    "xp_p90": round(base["xp_p90"] * scale, 3),
                    "xp_std": base["xp_std"],
                    "p_appear": inputs["minutes"]["p_appear"] if fixtures else 0.0,
                    "p_start": inputs["minutes"]["p_start"] if fixtures else 0.0,
                    "exp_minutes": inputs["minutes"]["exp_minutes"] if fixtures else 0.0,
                    "exp_goals": base["exp_goals"],
                    "exp_assists": base["exp_assists"],
                    "p_clean_sheet": base["p_clean_sheet"],
                    "p_goal": base["p_goal"],
                    "p_assist": base["p_assist"],
                    "p_return": base["p_return"],
                    "p_haul": base["p_haul"],
                    "p_blank": base["p_blank"],
                    "exp_bonus": base["exp_bonus"],
                    "exp_saves": base["exp_saves"],
                    "exp_defcon": base["exp_defcon"],
                    "pts_appearance": round(base["pts_appearance"] * scale, 4),
                    "pts_goals": round(base["pts_goals"] * scale, 4),
                    "pts_assists": round(base["pts_assists"] * scale, 4),
                    "pts_clean_sheet": round(base["pts_clean_sheet"] * scale, 4),
                    "pts_saves": round(base["pts_saves"] * scale, 4),
                    "pts_defcon": round(base["pts_defcon"] * scale, 4),
                    "pts_bonus": round(base["pts_bonus"] * scale, 4),
                    "pts_negative": round(base["pts_negative"] * scale, 4),
                    # The full distribution is only stored for the target
                    # gameweek; later weeks would multiply the database size for
                    # a view nothing reads.
                    "pmf_json": json.dumps(base["pmf"]) if ev == te else None,
                    "explain_json": None,
                }
                if ev == te and model_id == "lgbm" and gbm_result.fitted and pid in contrib_index:
                    contrib = contribs[contrib_index[pid]]
                    row["explain_json"] = json.dumps(
                        sorted(
                            (
                                {
                                    "feature": f,
                                    "contribution": round(float(c), 5),
                                    "value": _feature_value(frame, contrib_index[pid], f),
                                }
                                for f, c in zip(gbm.FEATURES, contrib[:-1])
                            ),
                            key=lambda r: -abs(r["contribution"]),
                        )[:12]
                    )
                prediction_rows.append(row)
                horizon_totals[model_id][pid] = horizon_totals[model_id].get(pid, 0.0) + xp
                if ev == te:
                    event_xp[model_id][pid] = xp

    # -------------------------------------------------------------------- persist
    _register_models(conn)
    # The run row must land first: every other table below references it.
    dbm.upsert(
        conn,
        "model_runs",
        [
            {
                "run_id": run_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "target_event": te,
                "horizon": horizon,
                "season": data.season_label,
                "snapshot_id": data.snapshot_id,
                "n_players": int(len(inputs_by_player)),
                "n_train_rows": int(gbm_result.n_train),
                "config_json": "{}",
                "status": "building",
                "duration_ms": 0,
            }
        ],
        ["run_id"],
    )
    conn.execute("DELETE FROM predictions WHERE run_id = ?", (run_id,))
    dbm.upsert(conn, "predictions", prediction_rows, ["run_id", "model_id", "player_id", "event_id"])

    metric_rows = []
    for model_id, ms in metrics.items():
        for metric, value in ms.items():
            if metric == "n" or value is None or not np.isfinite(value):
                continue
            metric_rows.append(
                {
                    "run_id": run_id,
                    "model_id": model_id,
                    "metric": metric,
                    "scope": "cv" if model_id in ("structural", "lgbm", "lgbm_quantile", "ensemble") else "holdout",
                    "value": float(value),
                    "n": int(ms.get("n", len(eval_frame))),
                }
            )
    dbm.upsert(conn, "model_metrics", metric_rows, ["run_id", "model_id", "metric", "scope"])

    calib_rows = []
    for model_id, bins in calibrations.items():
        for b in bins:
            calib_rows.append({"run_id": run_id, "model_id": model_id, **b})
    dbm.upsert(conn, "calibration_bins", calib_rows, ["run_id", "model_id", "bin_index"])

    if gbm_result.importance:
        dbm.upsert(
            conn,
            "feature_importance",
            [
                {"run_id": run_id, "model_id": "lgbm", "feature": r["feature"], "gain": r["gain"], "split": r["split"]}
                for r in gbm_result.importance
            ],
            ["run_id", "model_id", "feature"],
        )

    config = {
        "stack_weights": weights,
        "gbm": {
            "fitted": gbm_result.fitted,
            "reason": gbm_result.reason,
            "n_train": gbm_result.n_train,
            "n_folds": gbm_result.n_folds,
            "features": gbm.FEATURES,
            "excluded_features": gbm.EXCLUDED_FEATURES,
            "params": {k: v for k, v in gbm.PARAMS.items() if k != "verbose"},
            "min_minutes_for_eval": gbm.MIN_MINUTES_FOR_EVAL,
        },
        "structural": structural.assumptions(),
        "evaluation": {
            "target": "observed points per 90 in the {} season".format(data.season_label),
            "scheme": "5-fold cross-validation, folds grouped by club",
            "n": int(len(eval_frame)),
            "weight": "minutes played, in 90s",
            "note": (
                "Both engine models are scored against the same season their features "
                "come from, so these figures measure how well the rate-to-points "
                "mapping is recovered, not out-of-season forecasting skill. A true "
                "forward backtest needs per-gameweek history: ingest it with "
                "`python -m backend.ingest.runner history` and the run will add "
                "CRPS and per-gameweek calibration."
            ),
            "estimand_note": (
                "The structural model is evaluated on its neutral full-90 estimate, "
                "while the observed target averages in short substitute appearances. "
                "Its level therefore sits above the target — which is why its "
                "rank correlation is strong but its R-squared is negative — and the "
                "stack weights correct the level using the boosted model."
            ),
            "history_rows": int(len(data.history)),
        },
        "season_source": f"{data.season_label} season aggregates",
        "defensive_contribution_available": data.has_defcon,
    }

    conn.execute(
        "UPDATE model_runs SET config_json=?, status='ok', duration_ms=? WHERE run_id=?",
        (json.dumps(config), int((time.time() - started) * 1000), run_id),
    )
    conn.commit()

    return {
        "run_id": run_id,
        "target_event": te,
        "horizon": horizon,
        "n_players": len(inputs_by_player),
        "n_predictions": len(prediction_rows),
        "stack_weights": weights,
        "metrics": metrics,
        "duration_ms": int((time.time() - started) * 1000),
        "gbm_fitted": gbm_result.fitted,
        "gbm_reason": gbm_result.reason,
    }


def _feature_value(frame: pd.DataFrame, row_index: int, feature: str) -> float | None:
    try:
        value = frame.iloc[row_index][feature]
    except (KeyError, IndexError):
        return None
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return None
    return round(float(value), 4)


def latest_run(conn: sqlite3.Connection) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM model_runs WHERE status='ok' ORDER BY created_at DESC, rowid DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None
