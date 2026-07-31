"""Dataset assembly.

Loads the projected tables into dataframes once per model run so the rest of the
engine works on in-memory numpy/pandas rather than round-tripping SQLite.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from .scoring import POSITIONS, ScoringRules


@dataclass(slots=True)
class Dataset:
    players: pd.DataFrame
    teams: pd.DataFrame
    fixtures: pd.DataFrame
    events: pd.DataFrame
    season: pd.DataFrame          # player_season_stats for `season_label`
    history: pd.DataFrame         # element_gameweeks (may be empty)
    overrides: pd.DataFrame       # availability_overrides (may be empty)
    fbref: pd.DataFrame           # fbref_player_stats (may be empty)
    odds: pd.DataFrame            # odds_markets (may be empty)
    rules: ScoringRules
    season_label: str
    snapshot_id: int | None
    snapshot_captured_at: str | None
    team_matches: dict[int, int]

    @property
    def has_history(self) -> bool:
        return not self.history.empty

    @property
    def has_defcon(self) -> bool:
        """The API zeroes defensive-contribution counts outside a live season."""
        if self.season.empty:
            return False
        return bool(self.season["defensive_contribution"].sum() > 0)


def _read(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> pd.DataFrame:
    return pd.read_sql_query(sql, conn, params=params)


def load(conn: sqlite3.Connection, season_label: str | None = None) -> Dataset:
    players = _read(
        conn,
        """SELECT p.*, t.short_name AS team, t.name AS team_name,
                  t.primary_hex, t.secondary_hex, t.code AS team_code_ref
           FROM players p JOIN teams t ON t.id = p.team_id""",
    )
    players["position"] = players["element_type"].map(POSITIONS)
    players["price"] = players["now_cost"] / 10.0

    teams = _read(conn, "SELECT * FROM teams ORDER BY id")
    fixtures = _read(conn, "SELECT * FROM fixtures ORDER BY event, kickoff_time")
    events = _read(conn, "SELECT * FROM events ORDER BY id")

    if season_label is None:
        row = conn.execute(
            "SELECT season, SUM(minutes) AS m FROM player_season_stats GROUP BY season ORDER BY m DESC LIMIT 1"
        ).fetchone()
        season_label = row["season"] if row else ""
    season = _read(conn, "SELECT * FROM player_season_stats WHERE season = ?", (season_label,))

    history = _read(conn, "SELECT * FROM element_gameweeks")
    overrides = _read(conn, "SELECT * FROM availability_overrides")
    fbref = _read(conn, "SELECT * FROM fbref_player_stats")
    odds = _read(conn, "SELECT * FROM odds_markets")

    snap = conn.execute(
        "SELECT id, captured_at FROM raw_snapshots WHERE endpoint='bootstrap-static' "
        "ORDER BY captured_at DESC, id DESC LIMIT 1"
    ).fetchone()

    # Matches each team is known to have played in the observed season. Aggregate
    # pitch time (eleven players for ninety minutes = one team-match) under-counts
    # because the snapshot only lists the *current* squad, so any player who left
    # the club takes their minutes with them. The highest individual start count
    # in the squad is a hard lower bound, so take the greater of the two and cap
    # at a full campaign.
    tm: dict[int, int] = {}
    if not season.empty:
        merged = season.merge(players[["id", "team_id"]], left_on="player_id", right_on="id", how="left")
        for team_id, grp in merged.groupby("team_id"):
            from_minutes = int(round(grp["minutes"].sum() / (11 * 90.0)))
            from_starts = int(grp["starts"].max() or 0)
            tm[int(team_id)] = max(1, min(38, max(from_minutes, from_starts)))

    return Dataset(
        players=players,
        teams=teams,
        fixtures=fixtures,
        events=events,
        season=season,
        history=history,
        overrides=overrides,
        fbref=fbref,
        odds=odds,
        rules=ScoringRules.load(conn),
        season_label=season_label or "",
        snapshot_id=snap["id"] if snap else None,
        snapshot_captured_at=snap["captured_at"] if snap else None,
        team_matches=tm,
    )


def target_event(events: pd.DataFrame) -> int:
    """The gameweek predictions are for: the live one, else the next one."""
    if events.empty:
        return 1
    cur = events[events["is_current"] == 1]
    if not cur.empty and not bool(cur.iloc[0]["finished"]):
        return int(cur.iloc[0]["id"])
    nxt = events[events["is_next"] == 1]
    if not nxt.empty:
        return int(nxt.iloc[0]["id"])
    unfinished = events[events["finished"] == 0]
    if not unfinished.empty:
        return int(unfinished.iloc[0]["id"])
    return int(events["id"].max())


def team_fixture_map(fixtures: pd.DataFrame) -> dict[tuple[int, int], list[dict[str, Any]]]:
    """(team_id, event) -> list of fixtures. Empty list means a blank gameweek."""
    out: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for f in fixtures.itertuples():
        if f.event is None or (isinstance(f.event, float) and np.isnan(f.event)):
            continue
        ev = int(f.event)
        out.setdefault((int(f.team_h), ev), []).append(
            {
                "fixture_id": int(f.id),
                "opponent_id": int(f.team_a),
                "is_home": True,
                "difficulty": int(f.team_h_difficulty) if f.team_h_difficulty is not None else None,
                "kickoff": f.kickoff_time,
                "finished": bool(f.finished),
            }
        )
        out.setdefault((int(f.team_a), ev), []).append(
            {
                "fixture_id": int(f.id),
                "opponent_id": int(f.team_h),
                "is_home": False,
                "difficulty": int(f.team_a_difficulty) if f.team_a_difficulty is not None else None,
                "kickoff": f.kickoff_time,
                "finished": bool(f.finished),
            }
        )
    return out


def load_json_column(value: Any) -> Any:
    if value in (None, ""):
        return None
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return None
