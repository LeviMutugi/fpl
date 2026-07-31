"""Discrete points distributions.

FPL points are integers, so a player's score is exactly the convolution of the
integer-valued distributions of its scoring components. Working with the full
distribution rather than a point estimate is what makes ceiling, floor, haul and
blank probabilities real quantities instead of heuristics.

Everything here is exact arithmetic on probability vectors — no sampling.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

MIN_POINTS = -8   # worst realistic: red card + own goal + conceded
MAX_POINTS = 40   # generous headroom for a GK hat-trick or a 3-goal haul + bonus


@dataclass(slots=True)
class Discrete:
    """A distribution over integer points, indexed from `offset`."""

    probs: np.ndarray
    offset: int = MIN_POINTS

    @classmethod
    def point_mass(cls, value: int = 0) -> "Discrete":
        probs = np.zeros(MAX_POINTS - MIN_POINTS + 1)
        probs[value - MIN_POINTS] = 1.0
        return cls(probs=probs)

    @classmethod
    def from_map(cls, mapping: dict[int, float]) -> "Discrete":
        probs = np.zeros(MAX_POINTS - MIN_POINTS + 1)
        for value, prob in mapping.items():
            idx = int(np.clip(value - MIN_POINTS, 0, len(probs) - 1))
            probs[idx] += prob
        total = probs.sum()
        if total > 0:
            probs /= total
        return cls(probs=probs)

    def convolve(self, other: "Discrete") -> "Discrete":
        full = np.convolve(self.probs, other.probs)
        # Both vectors are indexed from MIN_POINTS, so the convolution starts at
        # 2*MIN_POINTS; fold everything back onto the canonical grid.
        values = np.arange(len(full)) + 2 * MIN_POINTS
        probs = np.zeros(len(self.probs))
        idx = np.clip(values - MIN_POINTS, 0, len(probs) - 1)
        np.add.at(probs, idx, full)
        total = probs.sum()
        if total > 0:
            probs /= total
        return Discrete(probs=probs)

    # --- summaries ----------------------------------------------------------
    @property
    def values(self) -> np.ndarray:
        return np.arange(len(self.probs)) + self.offset

    def mean(self) -> float:
        return float(np.dot(self.values, self.probs))

    def std(self) -> float:
        m = self.mean()
        return float(math.sqrt(max(0.0, np.dot((self.values - m) ** 2, self.probs))))

    def cdf(self) -> np.ndarray:
        return np.cumsum(self.probs)

    def quantile(self, q: float) -> float:
        cdf = self.cdf()
        idx = int(np.searchsorted(cdf, q, side="left"))
        idx = min(idx, len(self.probs) - 1)
        return float(self.values[idx])

    def prob_at_least(self, threshold: int) -> float:
        mask = self.values >= threshold
        return float(self.probs[mask].sum())

    def prob_at_most(self, threshold: int) -> float:
        mask = self.values <= threshold
        return float(self.probs[mask].sum())

    def to_pmf(self, lo: int = -4, hi: int = 25) -> list[dict[str, float]]:
        out = []
        for value, prob in zip(self.values, self.probs):
            if lo <= value <= hi and prob > 1e-6:
                out.append({"points": int(value), "prob": round(float(prob), 6)})
        return out

    def crps(self, actual: float) -> float:
        """Continuous ranked probability score against a realised value.

        For a discrete forecast this is the integral of the squared difference
        between the forecast CDF and the step function at `actual`.
        """
        cdf = self.cdf()
        indicator = (self.values >= actual).astype(float)
        return float(np.sum((cdf - indicator) ** 2))


def truncated_poisson(lam: float, max_k: int = 8) -> dict[int, float]:
    """Poisson pmf over 0..max_k with the tail folded into max_k."""
    lam = max(0.0, float(lam))
    if lam == 0.0:
        return {0: 1.0}
    ks = np.arange(max_k + 1)
    logs = -lam + ks * math.log(lam) - np.array([math.lgamma(k + 1) for k in ks])
    pmf = np.exp(logs)
    pmf[-1] += max(0.0, 1.0 - pmf.sum())
    return {int(k): float(p) for k, p in zip(ks, pmf) if p > 1e-9}


def scaled(counts: dict[int, float], points_per_unit: float) -> Discrete:
    """Map a count distribution onto points."""
    mapping: dict[int, float] = {}
    for k, p in counts.items():
        mapping[int(round(k * points_per_unit))] = mapping.get(int(round(k * points_per_unit)), 0.0) + p
    return Discrete.from_map(mapping)


def stepped(counts: dict[int, float], per_step: int, points_per_step: float) -> Discrete:
    """Points awarded per whole block of `per_step` events (saves, goals conceded)."""
    mapping: dict[int, float] = {}
    for k, p in counts.items():
        pts = int(round((k // per_step) * points_per_step))
        mapping[pts] = mapping.get(pts, 0.0) + p
    return Discrete.from_map(mapping)


def bernoulli(p: float, points: float) -> Discrete:
    p = float(np.clip(p, 0.0, 1.0))
    return Discrete.from_map({0: 1.0 - p, int(round(points)): p})


def binomial(n: int, p: float, points_per_unit: float = 1.0) -> Discrete:
    """Used for bonus: a truncated binomial matched to the expected bonus."""
    p = float(np.clip(p, 0.0, 1.0))
    mapping: dict[int, float] = {}
    for k in range(n + 1):
        prob = math.comb(n, k) * (p ** k) * ((1 - p) ** (n - k))
        pts = int(round(k * points_per_unit))
        mapping[pts] = mapping.get(pts, 0.0) + prob
    return Discrete.from_map(mapping)
