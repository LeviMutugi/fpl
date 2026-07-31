"""Measured evaluation: metrics, calibration, and stacking weights.

Nothing in this module invents a number. Every value returned is computed from
arrays of predictions and realised outcomes that the caller supplies.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from scipy.optimize import nnls
from scipy.stats import spearmanr


def regression_metrics(
    actual: np.ndarray, pred: np.ndarray, weight: np.ndarray | None = None
) -> dict[str, float]:
    actual = np.asarray(actual, dtype=float)
    pred = np.asarray(pred, dtype=float)
    mask = np.isfinite(actual) & np.isfinite(pred)
    if mask.sum() < 3:
        return {}
    a, p = actual[mask], pred[mask]
    if float(np.std(p)) == 0.0:
        # A constant prediction (pre-season "form" is zero for every player)
        # carries no information; reporting no metrics is more honest than
        # reporting an undefined correlation.
        return {}
    w = np.ones_like(a) if weight is None else np.asarray(weight, dtype=float)[mask]
    w = np.where(np.isfinite(w) & (w > 0), w, 0.0)
    if w.sum() <= 0:
        w = np.ones_like(a)

    err = p - a
    mae = float(np.average(np.abs(err), weights=w))
    rmse = float(np.sqrt(np.average(err ** 2, weights=w)))
    mean_a = float(np.average(a, weights=w))
    ss_res = float(np.average(err ** 2, weights=w))
    ss_tot = float(np.average((a - mean_a) ** 2, weights=w))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    rho = spearmanr(a, p).statistic
    # Kendall-style top-decile hit rate: of the 10% the model ranks highest, what
    # share are genuinely in the top 10% of outcomes?
    k = max(1, int(0.1 * len(a)))
    top_pred = set(np.argsort(-p)[:k])
    top_actual = set(np.argsort(-a)[:k])
    precision_at_10pct = len(top_pred & top_actual) / k

    return {
        "spearman": round(float(rho), 5),
        "mae": round(mae, 5),
        "rmse": round(rmse, 5),
        "r2": round(float(r2), 5),
        "precision_top_decile": round(precision_at_10pct, 5),
        "n": int(mask.sum()),
    }


def calibration_bins(
    actual: np.ndarray, pred: np.ndarray, n_bins: int = 10, weight: np.ndarray | None = None
) -> list[dict[str, float]]:
    """Equal-count bins of the prediction, with the realised mean in each."""
    actual = np.asarray(actual, dtype=float)
    pred = np.asarray(pred, dtype=float)
    mask = np.isfinite(actual) & np.isfinite(pred)
    if mask.sum() < n_bins * 2:
        return []
    a, p = actual[mask], pred[mask]
    w = np.ones_like(a) if weight is None else np.asarray(weight, dtype=float)[mask]
    order = np.argsort(p)
    chunks = np.array_split(order, n_bins)
    out = []
    for i, idx in enumerate(chunks):
        if len(idx) == 0:
            continue
        ww = w[idx]
        if ww.sum() <= 0:
            ww = np.ones_like(ww)
        out.append(
            {
                "bin_index": i,
                "pred_lo": round(float(p[idx].min()), 4),
                "pred_hi": round(float(p[idx].max()), 4),
                "pred_mean": round(float(np.average(p[idx], weights=ww)), 4),
                "actual_mean": round(float(np.average(a[idx], weights=ww)), 4),
                "n": int(len(idx)),
            }
        )
    return out


def stack_weights(
    predictions: dict[str, np.ndarray], actual: np.ndarray, weight: np.ndarray | None = None
) -> dict[str, float]:
    """Non-negative least squares blend, normalised to sum to one.

    Constraining the weights to be non-negative and to sum to one keeps the blend
    interpretable (it is a weighted opinion pool) and stops one model being used
    to cancel out another, which never survives contact with a new season.
    """
    names = [n for n, v in predictions.items() if np.isfinite(v).any()]
    if not names:
        return {}
    actual = np.asarray(actual, dtype=float)
    cols = [np.asarray(predictions[n], dtype=float) for n in names]
    mask = np.isfinite(actual)
    for c in cols:
        mask &= np.isfinite(c)
    if mask.sum() < 20:
        return {n: 1.0 / len(names) for n in names}

    w = np.ones(int(mask.sum())) if weight is None else np.asarray(weight, dtype=float)[mask]
    w = np.where(np.isfinite(w) & (w > 0), w, 1e-6)
    sqrt_w = np.sqrt(w)
    A = np.column_stack([c[mask] * sqrt_w for c in cols])
    b = actual[mask] * sqrt_w
    coef, _ = nnls(A, b)
    total = coef.sum()
    if total <= 0:
        return {n: 1.0 / len(names) for n in names}
    return {n: round(float(c / total), 5) for n, c in zip(names, coef)}


def crps_from_pmfs(pmfs: list[Any], actuals: np.ndarray) -> float | None:
    """Mean CRPS of discrete forecasts against realised points.

    Requires per-match outcomes, so it is only available once per-gameweek
    history has been ingested. Returns None rather than a placeholder.
    """
    if not pmfs or len(pmfs) != len(actuals):
        return None
    scores = [pmf.crps(float(a)) for pmf, a in zip(pmfs, actuals) if np.isfinite(a)]
    if not scores:
        return None
    return round(float(np.mean(scores)), 5)


def disagreement(by_model: dict[str, dict[int, float]], top_n: int = 40) -> list[dict[str, Any]]:
    """Players the models rank most differently, by spread of their xP."""
    if len(by_model) < 2:
        return []
    player_ids = set.intersection(*(set(v.keys()) for v in by_model.values()))
    rows = []
    for pid in player_ids:
        values = [by_model[m][pid] for m in by_model]
        spread = float(max(values) - min(values))
        rows.append({"player_id": int(pid), "spread": round(spread, 4),
                     "by_model": {m: round(float(by_model[m][pid]), 4) for m in by_model}})
    rows.sort(key=lambda r: -r["spread"])
    return rows[:top_n]
