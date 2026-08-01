"""Hierarchical (empirical-Bayes) rate estimation, team strength, and minutes.

Raw per-90 rates are unusable for squad players: one goal in 180 minutes implies
0.5 goals per 90, which no model should believe. Each rate is therefore shrunk
towards a position-level prior whose parameters are estimated from the league
itself (empirical Bayes), so the amount of shrinkage is learned rather than
tuned by hand.

Conjugate pairs used:
  counts per 90 (goals, assists, saves, bonus, cards)  -> Gamma / Poisson
  start rate (starts out of team matches)               -> Beta / Binomial

The only quantities not estimated from the data are the home/away split and the
minutes-per-appearance constants, which are stated as module constants and
surfaced to the UI as model assumptions.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

# Stated assumptions -----------------------------------------------------------
# Premier League home advantage, expressed as multiplicative factors on expected
# goals and normalised so the average of the two is 1.0.
HOME_ATTACK_FACTOR = 1.09
AWAY_ATTACK_FACTOR = 0.91
# A starter who is not withdrawn plays close to the full match; a substitute who
# comes on plays roughly a third of one.
MINUTES_IF_START = 82.0
MINUTES_IF_SUB = 22.0
# Probability a starter is still on the pitch at the 60th minute.
P_SIXTY_GIVEN_START = 0.93
# Shrinkage guardrails: the prior may be worth between half a match and thirty
# matches of evidence, no more.
BETA_BOUNDS = (0.5, 30.0)
PHI_BOUNDS = (1.0, 60.0)


@dataclass(slots=True)
class GammaPrior:
    alpha: float
    beta: float
    pooled_mean: float

    def posterior(self, counts: np.ndarray, exposure: np.ndarray) -> np.ndarray:
        return (self.alpha + counts) / (self.beta + exposure)

    def as_dict(self) -> dict[str, float]:
        return {
            "alpha": round(self.alpha, 5),
            "beta": round(self.beta, 5),
            "pooled_mean": round(self.pooled_mean, 5),
            "prior_weight_in_90s": round(self.beta, 3),
        }


@dataclass(slots=True)
class BetaPrior:
    a: float
    b: float
    pooled_mean: float

    def posterior(self, successes: np.ndarray, trials: np.ndarray) -> np.ndarray:
        return (self.a + successes) / (self.a + self.b + trials)

    def as_dict(self) -> dict[str, float]:
        return {
            "a": round(self.a, 4),
            "b": round(self.b, 4),
            "pooled_mean": round(self.pooled_mean, 5),
            "prior_weight_in_matches": round(self.a + self.b, 3),
        }


def fit_gamma_prior(counts: np.ndarray, exposure: np.ndarray) -> GammaPrior:
    """Method-of-moments empirical Bayes for a Gamma-Poisson hierarchy."""
    counts = np.asarray(counts, dtype=float)
    exposure = np.asarray(exposure, dtype=float)
    mask = exposure > 0
    if mask.sum() < 5 or counts[mask].sum() <= 0:
        # Not enough evidence to learn a prior: fall back to a weak one centred
        # on the pooled mean so the posterior is essentially the pooled rate.
        pooled = float(counts[mask].sum() / exposure[mask].sum()) if mask.sum() else 0.0
        return GammaPrior(alpha=pooled * 5.0, beta=5.0, pooled_mean=pooled)

    c, e = counts[mask], exposure[mask]
    pooled = float(c.sum() / e.sum())
    rates = c / e
    var_total = float(np.average((rates - pooled) ** 2, weights=e))
    var_sampling = pooled * float(np.average(1.0 / e, weights=e))
    var_between = var_total - var_sampling
    if not np.isfinite(var_between) or var_between <= 1e-9:
        beta = BETA_BOUNDS[1]
    else:
        beta = pooled / var_between
    beta = float(np.clip(beta, *BETA_BOUNDS))
    return GammaPrior(alpha=pooled * beta, beta=beta, pooled_mean=pooled)


def fit_beta_prior(successes: np.ndarray, trials: np.ndarray) -> BetaPrior:
    """Method-of-moments empirical Bayes for a Beta-Binomial hierarchy."""
    successes = np.asarray(successes, dtype=float)
    trials = np.asarray(trials, dtype=float)
    mask = trials > 0
    if mask.sum() < 5:
        return BetaPrior(a=1.0, b=1.0, pooled_mean=0.5)
    s, n = successes[mask], trials[mask]
    pooled = float(np.clip(s.sum() / n.sum(), 1e-4, 1 - 1e-4))
    p = s / n
    var_total = float(np.average((p - pooled) ** 2, weights=n))
    var_binom = pooled * (1 - pooled) * float(np.average(1.0 / n, weights=n))
    var_between = var_total - var_binom
    if not np.isfinite(var_between) or var_between <= 1e-9:
        phi = PHI_BOUNDS[1]
    else:
        phi = pooled * (1 - pooled) / var_between - 1.0
    phi = float(np.clip(phi, *PHI_BOUNDS))
    return BetaPrior(a=pooled * phi, b=(1 - pooled) * phi, pooled_mean=pooled)


# -----------------------------------------------------------------------------
# Team-level attack / defence
# -----------------------------------------------------------------------------
@dataclass(slots=True)
class TeamModel:
    """League-relative attack and defence indices, plus the goals baseline."""

    league_goals_per_match: float
    attack_index: dict[int, float] = field(default_factory=dict)   # 1.0 = average
    defence_index: dict[int, float] = field(default_factory=dict)  # 1.0 = average, lower is better
    xg_per_match: dict[int, float] = field(default_factory=dict)
    xgc_per_match: dict[int, float] = field(default_factory=dict)
    derived_from: str = ""
    fallback_teams: list[int] = field(default_factory=list)

    def expected_goals(self, team_id: int, opponent_id: int, is_home: bool) -> float:
        att = self.attack_index.get(team_id, 1.0)
        dfn = self.defence_index.get(opponent_id, 1.0)
        venue = HOME_ATTACK_FACTOR if is_home else AWAY_ATTACK_FACTOR
        return max(0.05, self.league_goals_per_match * att * dfn * venue)

    def fixture_attack_multiplier(self, opponent_id: int, is_home: bool) -> float:
        """How much easier/harder than average it is to attack this fixture."""
        dfn = self.defence_index.get(opponent_id, 1.0)
        venue = HOME_ATTACK_FACTOR if is_home else AWAY_ATTACK_FACTOR
        return max(0.2, dfn * venue)

    def opponent_attack_multiplier(self, opponent_id: int, is_home: bool) -> float:
        """Pressure the player's own goal will be under (drives saves)."""
        att = self.attack_index.get(opponent_id, 1.0)
        venue = AWAY_ATTACK_FACTOR if is_home else HOME_ATTACK_FACTOR
        return max(0.2, att * venue)


# A team index is only computed when the squad has this many team-match
# equivalents of recorded pitch time. Below it the estimate is dominated by
# whoever happens to still be at the club, so the published strength is used.
MIN_TEAM_EVIDENCE = 20.0


def fit_team_model(players: pd.DataFrame, season: pd.DataFrame, team_matches: dict[int, int], teams: pd.DataFrame) -> TeamModel:
    """Attack from squad xG per team-match, defence from goalkeeper xGC per 90.

    Both quantities are normalised by *recorded pitch time* rather than by the
    number of matches the club played. A snapshot only lists the current squad,
    so a club that sold three starters would otherwise look weaker than it is:
    dividing by the squad's own minutes cancels the departures out.

    Goalkeeper expected-goals-conceded is the cleanest available proxy for team
    defensive quality — exactly one keeper is on the pitch, so their xGC per 90
    is the team's xGC per match.
    """
    merged = season.merge(
        players[["id", "team_id", "element_type"]], left_on="player_id", right_on="id", how="left"
    )
    att_raw: dict[int, float] = {}
    def_raw: dict[int, float] = {}
    for team_id, grp in merged.groupby("team_id"):
        team_id = int(team_id)
        team_match_equivalents = float(grp["minutes"].sum()) / (11 * 90.0)
        if team_match_equivalents >= MIN_TEAM_EVIDENCE:
            att_raw[team_id] = float(grp["expected_goals"].sum()) / team_match_equivalents
        gk = grp[grp["element_type"] == 1]
        gk_90s = float(gk["minutes"].sum()) / 90.0
        if gk_90s >= MIN_TEAM_EVIDENCE:
            def_raw[team_id] = float(gk["expected_goals_conceded"].sum()) / gk_90s

    if att_raw:
        league_goals = float(np.mean(list(att_raw.values())))
    else:
        league_goals = 1.45  # long-run Premier League goals per team per match

    mean_att = float(np.mean(list(att_raw.values()))) if att_raw else 1.0
    mean_def = float(np.mean(list(def_raw.values()))) if def_raw else 1.0

    attack_index = {t: v / mean_att for t, v in att_raw.items()} if mean_att else {}
    defence_index = {t: v / mean_def for t, v in def_raw.items()} if mean_def else {}

    # Teams with no recorded minutes (promoted sides) fall back to the published
    # overall strength, mapped onto the same league-relative scale.
    fallback: list[int] = []
    for t in teams.itertuples():
        tid = int(t.id)
        if tid in attack_index and tid in defence_index:
            continue
        fallback.append(tid)
        overall = t.strength_overall_home or 3
        # strength runs 1..5; a side one band below average attacks ~12% worse.
        rel = 1.0 + 0.12 * (float(overall) - 3.0)
        attack_index.setdefault(tid, max(0.55, rel))
        defence_index.setdefault(tid, max(0.55, 2.0 - rel))

    return TeamModel(
        league_goals_per_match=league_goals,
        attack_index={k: round(v, 4) for k, v in attack_index.items()},
        defence_index={k: round(v, 4) for k, v in defence_index.items()},
        xg_per_match={k: round(v, 4) for k, v in att_raw.items()},
        xgc_per_match={k: round(v, 4) for k, v in def_raw.items()},
        derived_from="squad xG per team-match; goalkeeper xGC per 90",
        fallback_teams=fallback,
    )


# -----------------------------------------------------------------------------
# Availability and minutes
# -----------------------------------------------------------------------------
STATUS_AVAILABILITY = {
    "a": 1.0,   # available
    "d": 0.5,   # doubtful and no percentage published
    "i": 0.0,   # injured
    "s": 0.0,   # suspended
    "u": 0.0,   # unavailable
    "n": 0.0,   # not in squad
}


def availability(status: str | None, chance_next: float | None, override: float | None) -> tuple[float, str]:
    """Probability the player is available, and where that number came from."""
    if override is not None and not pd.isna(override):
        return float(np.clip(override, 0.0, 1.0)), "news_agent"
    if chance_next is not None and not pd.isna(chance_next):
        return float(np.clip(float(chance_next) / 100.0, 0.0, 1.0)), "fpl"
    if status:
        return STATUS_AVAILABILITY.get(str(status), 1.0), "fpl"
    return 1.0, "none"


@dataclass(slots=True)
class MinutesModel:
    start_prior: dict[int, BetaPrior]

    def estimate(
        self,
        *,
        element_type: int,
        starts: float,
        minutes: float,
        team_matches: int,
        p_available: float,
    ) -> dict[str, float]:
        matches = max(1, int(team_matches))
        prior = self.start_prior.get(element_type)
        if prior is None:
            p_start_raw = starts / matches if matches else 0.0
        else:
            p_start_raw = float(prior.posterior(np.array([starts]), np.array([matches]))[0])
        p_start_raw = float(np.clip(p_start_raw, 0.0, 1.0))

        # Minutes not explained by starts are attributed to substitute
        # appearances, which gives a substitute rate for the remaining matches.
        residual = max(0.0, minutes - starts * MINUTES_IF_START)
        sub_apps = residual / MINUTES_IF_SUB
        remaining = max(1.0, matches - starts)
        p_sub_raw = float(np.clip(sub_apps / remaining, 0.0, 1.0))

        p_start = p_start_raw * p_available
        p_sub = p_sub_raw * p_available
        p_appear = float(np.clip(p_start + (1.0 - p_start) * p_sub, 0.0, 1.0))
        p_sixty = p_start * P_SIXTY_GIVEN_START
        p_short = max(0.0, p_appear - p_sixty)
        # Expected minutes is defined by the same two scenarios the points
        # distribution is built from, so the two can never disagree.
        exp_minutes = p_sixty * MINUTES_IF_START + p_short * MINUTES_IF_SUB

        return {
            "p_start": round(p_start, 5),
            "p_appear": round(p_appear, 5),
            "p_sixty": round(p_sixty, 5),
            "p_short": round(p_short, 5),
            "exp_minutes": round(exp_minutes, 3),
            "p_start_unconditional": round(p_start_raw, 5),
        }


def fit_minutes_model(players: pd.DataFrame, season: pd.DataFrame, team_matches: dict[int, int]) -> MinutesModel:
    merged = season.merge(
        players[["id", "team_id", "element_type"]], left_on="player_id", right_on="id", how="left"
    )
    merged["matches"] = merged["team_id"].map(lambda t: team_matches.get(int(t), 0) if pd.notna(t) else 0)
    priors: dict[int, BetaPrior] = {}
    for et, grp in merged.groupby("element_type"):
        priors[int(et)] = fit_beta_prior(grp["starts"].to_numpy(), grp["matches"].to_numpy())
    return MinutesModel(start_prior=priors)


# -----------------------------------------------------------------------------
# Player rate bundle
# -----------------------------------------------------------------------------
RATE_SPECS = (
    # (name, count column, description)
    ("xg90", "expected_goals", "expected goals per 90"),
    ("xa90", "expected_assists", "expected assists per 90"),
    ("saves90", "saves", "saves per 90"),
    ("bonus90", "bonus", "bonus points per 90"),
    ("yellow90", "yellow_cards", "yellow cards per 90"),
    ("bps90", "bps", "bonus-point-system score per 90"),
    ("defcon90", "defensive_contribution", "defensive contributions per 90"),
    ("goals90", "goals_scored", "goals per 90"),
    ("assists90", "assists", "assists per 90"),
    ("red90", "red_cards", "red cards per 90"),
    ("og90", "own_goals", "own goals per 90"),
    ("penmiss90", "penalties_missed", "penalties missed per 90"),
    ("pensave90", "penalties_saved", "penalties saved per 90"),
)


@dataclass(slots=True)
class RateModel:
    """Shrunk per-90 rates, one column per RATE_SPECS entry, keyed by player id."""

    rates: pd.DataFrame
    priors: dict[str, dict[int, GammaPrior]]

    def for_player(self, player_id: int) -> dict[str, float]:
        if player_id not in self.rates.index:
            return {name: 0.0 for name, _, _ in RATE_SPECS}
        return self.rates.loc[player_id].to_dict()

    def prior_summary(self) -> dict[str, dict[str, dict[str, float]]]:
        from .scoring import POSITIONS

        return {
            name: {POSITIONS.get(et, str(et)): prior.as_dict() for et, prior in by_pos.items()}
            for name, by_pos in self.priors.items()
        }


def fit_rate_model(players: pd.DataFrame, season: pd.DataFrame) -> RateModel:
    merged = season.merge(
        players[["id", "element_type"]], left_on="player_id", right_on="id", how="left", suffixes=("", "_p")
    )
    merged["exposure"] = merged["minutes"] / 90.0
    out = pd.DataFrame(index=merged["player_id"].astype(int))
    priors: dict[str, dict[int, GammaPrior]] = {}

    for name, column, _desc in RATE_SPECS:
        values = np.zeros(len(merged))
        priors[name] = {}
        for et, grp in merged.groupby("element_type"):
            prior = fit_gamma_prior(grp[column].to_numpy(), grp["exposure"].to_numpy())
            priors[name][int(et)] = prior
            posterior = prior.posterior(grp[column].to_numpy(), grp["exposure"].to_numpy())
            values[merged["element_type"].to_numpy() == et] = posterior
        out[name] = values

    # Goalkeeper xGC per 90 is the team's conceding rate while that keeper plays;
    # shrink it the same way so a keeper with 200 minutes is not taken at face
    # value.
    xgc = np.zeros(len(merged))
    for et, grp in merged.groupby("element_type"):
        prior = fit_gamma_prior(grp["expected_goals_conceded"].to_numpy(), grp["exposure"].to_numpy())
        priors.setdefault("xgc90", {})[int(et)] = prior
        xgc[merged["element_type"].to_numpy() == et] = prior.posterior(
            grp["expected_goals_conceded"].to_numpy(), grp["exposure"].to_numpy()
        )
    out["xgc90"] = xgc
    out["minutes"] = merged["minutes"].to_numpy()
    out["starts"] = merged["starts"].to_numpy()
    out = out[~out.index.duplicated(keep="first")]
    return RateModel(rates=out, priors=priors)
