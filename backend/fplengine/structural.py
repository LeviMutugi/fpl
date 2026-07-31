"""Structural (decomposed) expected-points model.

Points are built up the way the game awards them rather than regressed in one
step:

    availability -> minutes scenario -> per-90 rates -> fixture adjustment
                 -> component distributions -> convolution -> full points pmf

Because the whole thing is a distribution, ceiling/floor/haul/blank fall out
exactly instead of being approximated, and a double gameweek is the convolution
of two match distributions rather than a doubled point estimate.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from . import distribution as dist
from .data import Dataset, team_fixture_map
from .rates import (
    MINUTES_IF_START,
    MINUTES_IF_SUB,
    MinutesModel,
    RateModel,
    TeamModel,
    availability,
    fit_beta_prior,
    fit_minutes_model,
    fit_rate_model,
    fit_team_model,
)
from .scoring import CONCEDED_PER_PENALTY, POSITIONS, SAVES_PER_POINT, ScoringRules

MODEL_ID = "structural"


@dataclass(slots=True)
class MatchPrediction:
    fixture_id: int | None
    opponent_id: int | None
    is_home: bool | None
    difficulty: int | None
    kickoff: str | None
    pmf: dist.Discrete
    components: dict[str, float]
    detail: dict[str, float]


@dataclass(slots=True)
class EventPrediction:
    player_id: int
    event: int
    pmf: dist.Discrete
    components: dict[str, float]
    detail: dict[str, float]
    fixtures: list[MatchPrediction] = field(default_factory=list)

    @property
    def xp(self) -> float:
        return self.pmf.mean()


class StructuralPredictor:
    def __init__(self, data: Dataset):
        self.data = data
        self.rules: ScoringRules = data.rules
        self.rate_model: RateModel = fit_rate_model(data.players, data.season)
        self.minutes_model: MinutesModel = fit_minutes_model(data.players, data.season, data.team_matches)
        self.team_model: TeamModel = fit_team_model(data.players, data.season, data.team_matches, data.teams)
        self.fixture_map = team_fixture_map(data.fixtures)
        self.defcon_available = data.has_defcon
        self._defcon_prior = self._fit_defcon_prior()
        self._season_by_player = data.season.set_index("player_id")
        self._override_by_player = (
            data.overrides.sort_values("created_at").groupby("player_id").last()
            if not data.overrides.empty
            else pd.DataFrame()
        )

    # ------------------------------------------------------------------ priors
    def _fit_defcon_prior(self) -> dict[int, Any]:
        """Defensive contributions are counted per qualifying match, like clean
        sheets, so the per-match probability is a Beta-Binomial quantity."""
        if not self.defcon_available:
            return {}
        merged = self.data.season.merge(
            self.data.players[["id", "team_id", "element_type"]],
            left_on="player_id",
            right_on="id",
            how="left",
        )
        merged["matches"] = merged["team_id"].map(
            lambda t: self.data.team_matches.get(int(t), 0) if pd.notna(t) else 0
        )
        return {
            int(et): fit_beta_prior(grp["defensive_contribution"].to_numpy(), grp["matches"].to_numpy())
            for et, grp in merged.groupby("element_type")
        }

    # ---------------------------------------------------------------- per player
    def player_inputs(self, player_id: int) -> dict[str, Any] | None:
        players = self.data.players
        row = players[players["id"] == player_id]
        if row.empty:
            return None
        p = row.iloc[0]
        element_type = int(p["element_type"])
        pos = POSITIONS[element_type]
        team_id = int(p["team_id"])

        override = None
        if not self._override_by_player.empty and player_id in self._override_by_player.index:
            override = float(self._override_by_player.loc[player_id]["start_probability"])
        p_available, avail_source = availability(
            p.get("status"), p.get("chance_of_playing_next_round"), override
        )

        season_row = (
            self._season_by_player.loc[player_id] if player_id in self._season_by_player.index else None
        )
        starts = float(season_row["starts"]) if season_row is not None else 0.0
        minutes = float(season_row["minutes"]) if season_row is not None else 0.0
        defcon_count = float(season_row["defensive_contribution"]) if season_row is not None else 0.0

        matches = self.data.team_matches.get(team_id, 0) or 38
        mins = self.minutes_model.estimate(
            element_type=element_type,
            starts=starts,
            minutes=minutes,
            team_matches=matches,
            p_available=p_available,
        )
        rates = self.rate_model.for_player(player_id)

        p_defcon_match = 0.0
        if self.defcon_available and element_type in self._defcon_prior:
            p_defcon_match = float(
                self._defcon_prior[element_type].posterior(
                    np.array([defcon_count]), np.array([max(1, matches)])
                )[0]
            )

        return {
            "player_id": player_id,
            "element_type": element_type,
            "position": pos,
            "team_id": team_id,
            "p_available": p_available,
            "availability_source": avail_source,
            "minutes": mins,
            "rates": rates,
            "p_defcon_match": p_defcon_match,
            "observed_minutes": minutes,
            "observed_starts": starts,
        }

    # -------------------------------------------------------------- one scenario
    def _scenario(
        self,
        *,
        inputs: dict[str, Any],
        share: float,
        appearance_pts: float,
        can_clean_sheet: bool,
        att_mult: float,
        opp_att_mult: float,
        lam_conceded: float,
    ) -> tuple[dist.Discrete, dict[str, float], dict[str, float]]:
        """Points distribution for one minutes scenario of one fixture.

        This is the single place the scoring rules are applied, so the neutral
        per-90 profile used for model evaluation cannot drift away from the
        fixture-specific prediction served to the UI.
        """
        rules = self.rules
        pos = inputs["position"]
        rates = inputs["rates"]

        goal_pts = rules.goal(pos)
        assist_pts = rules.assist(pos)
        cs_pts = rules.clean_sheet(pos)
        conceded_pts = rules.conceded(pos)
        defcon_pts = rules.defcon(pos) if self.defcon_available else 0.0

        exp_goals = rates.get("xg90", 0.0) * share * att_mult
        exp_assists = rates.get("xa90", 0.0) * share * att_mult
        exp_saves = rates.get("saves90", 0.0) * share * opp_att_mult
        exp_bonus = rates.get("bonus90", 0.0) * share
        exp_conceded = lam_conceded * share
        exp_pensave = rates.get("pensave90", 0.0) * share
        p_yellow = min(0.9, rates.get("yellow90", 0.0) * share)
        p_red = min(0.5, rates.get("red90", 0.0) * share)
        p_og = min(0.5, rates.get("og90", 0.0) * share)
        p_penmiss = min(0.5, rates.get("penmiss90", 0.0) * share)
        # A clean sheet needs sixty minutes played and nothing conceded.
        p_cs = math.exp(-lam_conceded) if can_clean_sheet else 0.0
        # Defensive contributions are only realistically reachable by a player
        # who is on the pitch for most of the match.
        p_defcon = inputs["p_defcon_match"] if can_clean_sheet else 0.0

        goals_counts = dist.truncated_poisson(exp_goals, max_k=5)
        assists_counts = dist.truncated_poisson(exp_assists, max_k=4)
        saves_counts = dist.truncated_poisson(exp_saves, max_k=12)
        conceded_counts = dist.truncated_poisson(exp_conceded, max_k=8)
        pensave_counts = dist.truncated_poisson(exp_pensave, max_k=2)

        pmf = dist.Discrete.point_mass(int(round(appearance_pts)))
        pmf = pmf.convolve(dist.scaled(goals_counts, goal_pts))
        pmf = pmf.convolve(dist.scaled(assists_counts, assist_pts))
        if cs_pts:
            pmf = pmf.convolve(dist.bernoulli(p_cs, cs_pts))
        if rules.save_unit() and exp_saves > 0:
            pmf = pmf.convolve(dist.stepped(saves_counts, SAVES_PER_POINT, rules.save_unit()))
        if conceded_pts:
            pmf = pmf.convolve(dist.stepped(conceded_counts, CONCEDED_PER_PENALTY, conceded_pts))
        if defcon_pts and p_defcon > 0:
            pmf = pmf.convolve(dist.bernoulli(p_defcon, defcon_pts))
        if exp_bonus > 0:
            pmf = pmf.convolve(dist.binomial(3, min(1.0, exp_bonus / 3.0), rules.bonus_unit))
        if p_yellow > 0:
            pmf = pmf.convolve(dist.bernoulli(p_yellow, rules.yellow))
        if p_red > 0:
            pmf = pmf.convolve(dist.bernoulli(p_red, rules.red))
        if p_og > 0:
            pmf = pmf.convolve(dist.bernoulli(p_og, rules.own_goal))
        if p_penmiss > 0:
            pmf = pmf.convolve(dist.bernoulli(p_penmiss, rules.pen_miss))
        if exp_pensave > 0 and rules.pen_save:
            pmf = pmf.convolve(dist.scaled(pensave_counts, rules.pen_save))

        components = {
            "appearance": appearance_pts,
            "goals": exp_goals * goal_pts,
            "assists": exp_assists * assist_pts,
            "clean_sheet": p_cs * cs_pts,
            "saves": _expected_stepped(saves_counts, SAVES_PER_POINT, rules.save_unit())
            + exp_pensave * rules.pen_save,
            "defcon": p_defcon * defcon_pts,
            "bonus": min(3.0, exp_bonus) * rules.bonus_unit,
            "negative": (
                _expected_stepped(conceded_counts, CONCEDED_PER_PENALTY, conceded_pts)
                + p_yellow * rules.yellow
                + p_red * rules.red
                + p_og * rules.own_goal
                + p_penmiss * rules.pen_miss
            ),
        }
        detail = {
            "exp_goals": exp_goals,
            "exp_assists": exp_assists,
            "exp_saves": exp_saves,
            "exp_bonus": min(3.0, exp_bonus),
            "exp_conceded": exp_conceded,
            "p_clean_sheet": p_cs,
            "p_goal": 1.0 - math.exp(-exp_goals),
            "p_assist": 1.0 - math.exp(-exp_assists),
            "exp_defcon": p_defcon,
        }
        return pmf, components, detail

    # ---------------------------------------------------------------- one match
    def predict_match(self, inputs: dict[str, Any], fixture: dict[str, Any]) -> MatchPrediction:
        rules = self.rules
        team_id = inputs["team_id"]
        opponent_id = int(fixture["opponent_id"])
        is_home = bool(fixture["is_home"])
        mins = inputs["minutes"]

        att_mult = self.team_model.fixture_attack_multiplier(opponent_id, is_home)
        opp_att_mult = self.team_model.opponent_attack_multiplier(opponent_id, is_home)
        # Goals the player's own team is expected to concede in this fixture.
        lam_conceded = self.team_model.expected_goals(opponent_id, team_id, not is_home)

        scenarios = (
            (1.0 - mins["p_appear"], 0.0, 0.0, False),
            (mins["p_short"], MINUTES_IF_SUB, rules.short_play, False),
            (mins["p_sixty"], MINUTES_IF_START, rules.long_play, True),
        )

        mixture = np.zeros(dist.MAX_POINTS - dist.MIN_POINTS + 1)
        components: dict[str, float] = {}
        detail: dict[str, float] = {}

        for weight, scen_minutes, appearance_pts, can_clean_sheet in scenarios:
            if weight <= 1e-9:
                continue
            pmf, comps, det = self._scenario(
                inputs=inputs,
                share=scen_minutes / 90.0,
                appearance_pts=appearance_pts,
                can_clean_sheet=can_clean_sheet,
                att_mult=att_mult,
                opp_att_mult=opp_att_mult,
                lam_conceded=lam_conceded,
            )
            mixture += weight * pmf.probs
            for k, v in comps.items():
                components[k] = components.get(k, 0.0) + weight * v
            for k, v in det.items():
                detail[k] = detail.get(k, 0.0) + weight * v

        for k in ("appearance", "goals", "assists", "clean_sheet", "saves", "defcon", "bonus", "negative"):
            components.setdefault(k, 0.0)
        for k in ("exp_goals", "exp_assists", "exp_saves", "exp_bonus", "exp_conceded",
                  "p_clean_sheet", "p_goal", "p_assist", "exp_defcon"):
            detail.setdefault(k, 0.0)

        total = mixture.sum()
        if total > 0:
            mixture = mixture / total
        return MatchPrediction(
            fixture_id=fixture.get("fixture_id"),
            opponent_id=opponent_id,
            is_home=is_home,
            difficulty=fixture.get("difficulty"),
            kickoff=fixture.get("kickoff"),
            pmf=dist.Discrete(probs=mixture),
            components=components,
            detail=detail,
        )

    # ------------------------------------------------------- neutral per-90 form
    def predict_neutral_90(self, inputs: dict[str, Any]) -> tuple[float, dict[str, float]]:
        """Points this player would be expected to score in a full 90 against an
        average opponent, at a neutral venue.

        This is the quantity the model leaderboard is scored on, because it is
        directly comparable to the observed points per 90 in the season data and
        strips out both fixture luck and rotation.
        """
        lam_conceded = self.team_model.league_goals_per_match * self.team_model.defence_index.get(
            inputs["team_id"], 1.0
        )
        pmf, components, _detail = self._scenario(
            inputs=inputs,
            share=1.0,
            appearance_pts=self.rules.long_play,
            can_clean_sheet=True,
            att_mult=1.0,
            opp_att_mult=1.0,
            lam_conceded=lam_conceded,
        )
        return pmf.mean(), components

    # ---------------------------------------------------------------- one event
    def predict_event(self, inputs: dict[str, Any], event: int) -> EventPrediction:
        fixtures = self.fixture_map.get((inputs["team_id"], event), [])
        if not fixtures:
            # Blank gameweek: no fixture, so exactly zero points.
            return EventPrediction(
                player_id=inputs["player_id"],
                event=event,
                pmf=dist.Discrete.point_mass(0),
                components={k: 0.0 for k in
                            ("appearance", "goals", "assists", "clean_sheet", "saves", "defcon", "bonus", "negative")},
                detail={"blank": 1.0, "fixture_count": 0.0},
                fixtures=[],
            )

        matches = [self.predict_match(inputs, f) for f in fixtures]
        pmf = matches[0].pmf
        for m in matches[1:]:
            pmf = pmf.convolve(m.pmf)

        components = {k: sum(m.components[k] for m in matches) for k in matches[0].components}
        detail = {k: sum(m.detail[k] for m in matches) for k in matches[0].detail}
        detail["fixture_count"] = float(len(matches))
        detail["blank"] = 0.0
        return EventPrediction(
            player_id=inputs["player_id"],
            event=event,
            pmf=pmf,
            components=components,
            detail=detail,
            fixtures=matches,
        )

    # ------------------------------------------------------------------- public
    def predict(self, target_event: int, horizon: int) -> dict[int, list[EventPrediction]]:
        out: dict[int, list[EventPrediction]] = {}
        for player_id in self.data.players["id"].astype(int):
            inputs = self.player_inputs(int(player_id))
            if inputs is None:
                continue
            out[int(player_id)] = [
                self.predict_event(inputs, target_event + h) for h in range(horizon)
            ]
        return out

    def assumptions(self) -> dict[str, Any]:
        return {
            "home_attack_factor": 1.09,
            "away_attack_factor": 0.91,
            "minutes_if_start": MINUTES_IF_START,
            "minutes_if_sub": MINUTES_IF_SUB,
            "p_sixty_given_start": 0.93,
            "saves_per_point": SAVES_PER_POINT,
            "conceded_per_penalty": CONCEDED_PER_PENALTY,
            "team_model": {
                "league_goals_per_match": round(self.team_model.league_goals_per_match, 4),
                "derived_from": self.team_model.derived_from,
                "fallback_teams": self.team_model.fallback_teams,
            },
            "defensive_contribution_available": self.defcon_available,
            "rate_priors": self.rate_model.prior_summary(),
            "start_priors": {
                POSITIONS.get(et, str(et)): prior.as_dict()
                for et, prior in self.minutes_model.start_prior.items()
            },
            "scoring_rules": self.rules.summary(),
        }


def _expected_stepped(counts: dict[int, float], per_step: int, points_per_step: float) -> float:
    return sum(p * (k // per_step) * points_per_step for k, p in counts.items())


def summarise(pred: EventPrediction) -> dict[str, Any]:
    """Everything the API stores for one (player, event) prediction."""
    pmf = pred.pmf
    detail = pred.detail
    p_goal = float(detail.get("p_goal", 0.0))
    p_assist = float(detail.get("p_assist", 0.0))
    return {
        "xp_mean": round(pmf.mean(), 4),
        "xp_p10": pmf.quantile(0.10),
        "xp_p25": pmf.quantile(0.25),
        "xp_p50": pmf.quantile(0.50),
        "xp_p75": pmf.quantile(0.75),
        "xp_p90": pmf.quantile(0.90),
        "xp_std": round(pmf.std(), 4),
        "p_goal": round(min(1.0, p_goal), 5),
        "p_assist": round(min(1.0, p_assist), 5),
        "p_return": round(min(1.0, 1.0 - (1.0 - min(1.0, p_goal)) * (1.0 - min(1.0, p_assist))), 5),
        "p_haul": round(pmf.prob_at_least(10), 5),
        "p_blank": round(pmf.prob_at_most(2), 5),
        "exp_goals": round(float(detail.get("exp_goals", 0.0)), 4),
        "exp_assists": round(float(detail.get("exp_assists", 0.0)), 4),
        "p_clean_sheet": round(float(detail.get("p_clean_sheet", 0.0)), 5),
        "exp_bonus": round(float(detail.get("exp_bonus", 0.0)), 4),
        "exp_saves": round(float(detail.get("exp_saves", 0.0)), 4),
        "exp_defcon": round(float(detail.get("exp_defcon", 0.0)), 5),
        "pts_appearance": round(pred.components["appearance"], 4),
        "pts_goals": round(pred.components["goals"], 4),
        "pts_assists": round(pred.components["assists"], 4),
        "pts_clean_sheet": round(pred.components["clean_sheet"], 4),
        "pts_saves": round(pred.components["saves"], 4),
        "pts_defcon": round(pred.components["defcon"], 4),
        "pts_bonus": round(pred.components["bonus"], 4),
        "pts_negative": round(pred.components["negative"], 4),
        "pmf": pmf.to_pmf(),
        "fixture_count": int(detail.get("fixture_count", 0)),
    }
