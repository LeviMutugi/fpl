"""Gradient-boosted points model.

Learns the mapping from a player's underlying per-90 profile to the FPL points
per 90 they actually scored. The structural model builds points from the rulebook
and can only be as good as its component assumptions; this one is free to find
whatever non-linear relationship the data actually contains (finishing above xG,
bonus propensity, position-specific effects), which is why the two are worth
blending rather than choosing between.

Honesty notes that the UI surfaces verbatim:
  * Evaluation is 5-fold cross-validation grouped by club, so no club appears in
    both the training and the evaluation half of a fold.
  * Features that are near-restatements of the target (bonus, BPS, influence,
    ownership, price movement) are deliberately excluded, otherwise the measured
    skill would flatter the model without helping a forecast.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.model_selection import GroupKFold

from .data import Dataset
from .rates import TeamModel

FEATURES = [
    "element_type",
    "price",
    "minutes",
    "starts",
    "start_rate",
    "xg90",
    "xa90",
    "xgi90",
    "xgc90",
    "saves90",
    "cs90",
    "threat90",
    "creativity90",
    "team_attack_index",
    "team_defence_index",
    "age_years",
    "is_penalty_taker",
    "is_corner_taker",
    "is_freekick_taker",
]
CATEGORICAL = ["element_type"]

# Excluded on purpose, with the reason shown in the Model Lab.
EXCLUDED_FEATURES = {
    "bonus90": "bonus is part of the target",
    "bps90": "BPS is the mechanism that awards the target's bonus points",
    "influence": "Opta influence is computed from the same events that score points",
    "selected_by_percent": "ownership reacts to points rather than predicting them",
    "cost_change_start": "price movement is a consequence of scoring",
    "ep_next": "a competing model's output, kept as a baseline instead of a feature",
}

QUANTILES = (0.1, 0.5, 0.9)
MIN_MINUTES_FOR_EVAL = 450  # five full matches: below this pts90 is mostly noise

PARAMS = {
    "objective": "regression",
    "metric": "l2",
    "learning_rate": 0.045,
    "num_leaves": 16,
    "min_data_in_leaf": 22,
    "feature_fraction": 0.85,
    "bagging_fraction": 0.85,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "num_boost_round": 420,
    "verbose": -1,
    "seed": 7,
    "deterministic": True,
    "force_row_wise": True,
}


def _age_years(birth_date: Any, as_of: date | None = None) -> float:
    if not birth_date or pd.isna(birth_date):
        return np.nan
    try:
        born = datetime.fromisoformat(str(birth_date)[:10]).date()
    except ValueError:
        return np.nan
    ref = as_of or date.today()
    return round((ref - born).days / 365.25, 2)


def build_frame(data: Dataset, team_model: TeamModel) -> pd.DataFrame:
    """One row per player: observed profile + target."""
    season = data.season.copy()
    players = data.players[
        [
            "id", "team_id", "element_type", "now_cost", "birth_date",
            "penalties_order", "corners_order", "direct_fk_order", "web_name",
        ]
    ].rename(columns={"id": "player_id"})
    df = season.merge(players, on="player_id", how="inner")

    df["price"] = df["now_cost"] / 10.0
    exposure = (df["minutes"] / 90.0).replace(0, np.nan)
    df["threat90"] = (df["threat"] / exposure).fillna(0.0)
    df["creativity90"] = (df["creativity"] / exposure).fillna(0.0)
    df["matches"] = df["team_id"].map(lambda t: data.team_matches.get(int(t), 38) if pd.notna(t) else 38)
    df["start_rate"] = (df["starts"] / df["matches"]).clip(0, 1).fillna(0.0)
    df["team_attack_index"] = df["team_id"].map(lambda t: team_model.attack_index.get(int(t), 1.0))
    df["team_defence_index"] = df["team_id"].map(lambda t: team_model.defence_index.get(int(t), 1.0))
    df["age_years"] = df["birth_date"].map(_age_years)
    df["is_penalty_taker"] = (df["penalties_order"].fillna(9) <= 1).astype(int)
    df["is_corner_taker"] = (df["corners_order"].fillna(9) <= 2).astype(int)
    df["is_freekick_taker"] = (df["direct_fk_order"].fillna(9) <= 2).astype(int)
    df["target_pts90"] = df["pts90"]
    df["weight"] = df["minutes"] / 90.0
    return df


@dataclass(slots=True)
class GBMResult:
    mean_model: lgb.Booster | None
    quantile_models: dict[float, lgb.Booster] = field(default_factory=dict)
    oof_mean: pd.Series = field(default_factory=pd.Series)
    oof_quantiles: dict[float, pd.Series] = field(default_factory=dict)
    train_frame: pd.DataFrame = field(default_factory=pd.DataFrame)
    n_train: int = 0
    n_folds: int = 0
    importance: list[dict[str, Any]] = field(default_factory=list)
    fitted: bool = False
    reason: str = ""

    def predict_pts90(self, frame: pd.DataFrame) -> np.ndarray:
        if not self.fitted or self.mean_model is None:
            return np.zeros(len(frame))
        return np.clip(self.mean_model.predict(frame[FEATURES]), 0.0, None)

    def predict_quantile(self, frame: pd.DataFrame, q: float) -> np.ndarray:
        model = self.quantile_models.get(q)
        if model is None:
            return np.zeros(len(frame))
        return np.clip(model.predict(frame[FEATURES]), 0.0, None)

    def contributions(self, frame: pd.DataFrame) -> np.ndarray:
        """Per-feature contributions to each prediction (exact, tree-additive)."""
        if not self.fitted or self.mean_model is None:
            return np.zeros((len(frame), len(FEATURES) + 1))
        return self.mean_model.predict(frame[FEATURES], pred_contrib=True)


def fit(frame: pd.DataFrame, n_splits: int = 5) -> GBMResult:
    """Fit mean and quantile boosters with club-grouped out-of-fold prediction."""
    train = frame[frame["minutes"] >= MIN_MINUTES_FOR_EVAL].copy()
    if len(train) < 60 or train["team_id"].nunique() < n_splits:
        return GBMResult(
            mean_model=None,
            reason=(
                f"only {len(train)} players clear the {MIN_MINUTES_FOR_EVAL}-minute "
                "threshold, which is too few to cross-validate"
            ),
        )

    X = train[FEATURES]
    y = train["target_pts90"].to_numpy()
    w = train["weight"].to_numpy()
    groups = train["team_id"].to_numpy()

    splitter = GroupKFold(n_splits=n_splits)
    oof = np.full(len(train), np.nan)
    oof_q = {q: np.full(len(train), np.nan) for q in QUANTILES}

    for tr_idx, te_idx in splitter.split(X, y, groups):
        dtrain = lgb.Dataset(
            X.iloc[tr_idx], label=y[tr_idx], weight=w[tr_idx],
            categorical_feature=CATEGORICAL, free_raw_data=False,
        )
        booster = lgb.train({k: v for k, v in PARAMS.items() if k != "num_boost_round"},
                            dtrain, num_boost_round=PARAMS["num_boost_round"])
        oof[te_idx] = booster.predict(X.iloc[te_idx])
        for q in QUANTILES:
            qparams = {k: v for k, v in PARAMS.items() if k != "num_boost_round"}
            qparams.update({"objective": "quantile", "alpha": q, "metric": "quantile"})
            qbooster = lgb.train(qparams, dtrain, num_boost_round=PARAMS["num_boost_round"])
            oof_q[q][te_idx] = qbooster.predict(X.iloc[te_idx])

    # Final models are refit on everything; the metrics reported come from the
    # out-of-fold predictions above, never from these.
    dfull = lgb.Dataset(X, label=y, weight=w, categorical_feature=CATEGORICAL, free_raw_data=False)
    mean_model = lgb.train({k: v for k, v in PARAMS.items() if k != "num_boost_round"},
                           dfull, num_boost_round=PARAMS["num_boost_round"])
    quantile_models: dict[float, lgb.Booster] = {}
    for q in QUANTILES:
        qparams = {k: v for k, v in PARAMS.items() if k != "num_boost_round"}
        qparams.update({"objective": "quantile", "alpha": q, "metric": "quantile"})
        quantile_models[q] = lgb.train(qparams, dfull, num_boost_round=PARAMS["num_boost_round"])

    gains = mean_model.feature_importance(importance_type="gain")
    splits = mean_model.feature_importance(importance_type="split")
    importance = sorted(
        (
            {"feature": f, "gain": float(g), "split": int(s)}
            for f, g, s in zip(FEATURES, gains, splits)
        ),
        key=lambda r: -r["gain"],
    )

    index = train["player_id"].astype(int)
    return GBMResult(
        mean_model=mean_model,
        quantile_models=quantile_models,
        oof_mean=pd.Series(oof, index=index),
        oof_quantiles={q: pd.Series(v, index=index) for q, v in oof_q.items()},
        train_frame=train,
        n_train=len(train),
        n_folds=n_splits,
        importance=importance,
        fitted=True,
    )


def pinball_loss(actual: np.ndarray, pred: np.ndarray, q: float, weight: np.ndarray | None = None) -> float:
    diff = actual - pred
    loss = np.maximum(q * diff, (q - 1) * diff)
    if weight is None:
        return float(np.mean(loss))
    return float(np.average(loss, weights=weight))


def spearman(actual: np.ndarray, pred: np.ndarray) -> float:
    mask = np.isfinite(actual) & np.isfinite(pred)
    if mask.sum() < 3:
        return float("nan")
    rho = spearmanr(actual[mask], pred[mask]).statistic
    return float(rho)
