"""FPL scoring rules, read from the game's own published config.

`bootstrap-static.game_config.scoring` is authoritative and changes between
seasons (goalkeeper goals were worth 10 in 2026/27, defensive contributions were
introduced in 2025/26). Reading it beats hardcoding a rulebook that silently
goes stale.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}

# Used only if the database has no game_config row yet (fresh clone, no ingest).
FALLBACK = {
    "long_play": 2,
    "short_play": 1,
    "goals_scored": {"GKP": 10, "DEF": 6, "MID": 5, "FWD": 4},
    "assists": 3,
    "clean_sheets": {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0},
    "goals_conceded": {"GKP": -1, "DEF": -1, "MID": 0, "FWD": 0},
    "saves": 1,
    "penalties_saved": 5,
    "penalties_missed": -2,
    "yellow_cards": -1,
    "red_cards": -3,
    "own_goals": -2,
    "bonus": 1,
    "defensive_contribution": {"GKP": 0, "DEF": 2, "MID": 2, "FWD": 2},
}

# Not published in game_config: how many saves/goals-conceded make a scoring
# unit, and the defensive-contribution thresholds. These come from the official
# rules page and are the only scoring constants stated here rather than read.
SAVES_PER_POINT = 3
CONCEDED_PER_PENALTY = 2
DEFCON_THRESHOLD = {"DEF": 10, "MID": 12, "FWD": 12, "GKP": None}


@dataclass(slots=True)
class ScoringRules:
    raw: dict = field(default_factory=dict)

    @classmethod
    def load(cls, conn: sqlite3.Connection) -> "ScoringRules":
        row = conn.execute("SELECT value_json FROM game_config WHERE key='scoring'").fetchone()
        if row and row[0]:
            data = json.loads(row[0])
            if data:
                return cls(raw=data)
        return cls(raw=dict(FALLBACK))

    def _pos_value(self, key: str, pos: str, default: float = 0.0) -> float:
        val = self.raw.get(key, FALLBACK.get(key, default))
        if isinstance(val, dict):
            return float(val.get(pos, 0.0))
        return float(val)

    def goal(self, pos: str) -> float:
        return self._pos_value("goals_scored", pos)

    def assist(self, pos: str) -> float:
        return self._pos_value("assists", pos, 3.0)

    def clean_sheet(self, pos: str) -> float:
        return self._pos_value("clean_sheets", pos)

    def conceded(self, pos: str) -> float:
        """Points per CONCEDED_PER_PENALTY goals shipped (negative)."""
        return self._pos_value("goals_conceded", pos)

    def save_unit(self) -> float:
        return self._pos_value("saves", "GKP", 1.0)

    def defcon(self, pos: str) -> float:
        return self._pos_value("defensive_contribution", pos)

    @property
    def long_play(self) -> float:
        return float(self.raw.get("long_play", 2))

    @property
    def short_play(self) -> float:
        return float(self.raw.get("short_play", 1))

    @property
    def yellow(self) -> float:
        return float(self.raw.get("yellow_cards", -1))

    @property
    def red(self) -> float:
        return float(self.raw.get("red_cards", -3))

    @property
    def own_goal(self) -> float:
        return float(self.raw.get("own_goals", -2))

    @property
    def pen_miss(self) -> float:
        return float(self.raw.get("penalties_missed", -2))

    @property
    def pen_save(self) -> float:
        return float(self.raw.get("penalties_saved", 5))

    @property
    def bonus_unit(self) -> float:
        return float(self.raw.get("bonus", 1))

    def defcon_threshold(self, pos: str) -> int | None:
        return DEFCON_THRESHOLD.get(pos)

    def summary(self) -> dict:
        """Human-readable rulebook for the UI, derived from the loaded config."""
        return {
            "appearance": {"under_60": self.short_play, "over_60": self.long_play},
            "goal": {p: self.goal(p) for p in ("GKP", "DEF", "MID", "FWD")},
            "assist": self.assist("MID"),
            "clean_sheet": {p: self.clean_sheet(p) for p in ("GKP", "DEF", "MID", "FWD")},
            "conceded": {
                "points": self.conceded("DEF"),
                "per_goals": CONCEDED_PER_PENALTY,
                "applies_to": [p for p in ("GKP", "DEF", "MID", "FWD") if self.conceded(p)],
            },
            "saves": {"points": self.save_unit(), "per_saves": SAVES_PER_POINT},
            "defensive_contribution": {
                "points": {p: self.defcon(p) for p in ("GKP", "DEF", "MID", "FWD")},
                "thresholds": DEFCON_THRESHOLD,
            },
            "cards": {"yellow": self.yellow, "red": self.red},
            "bonus": [3, 2, 1],
            "penalties": {"missed": self.pen_miss, "saved": self.pen_save},
            "own_goal": self.own_goal,
        }
