"""FBref underlying metrics via the `soccerdata` library.

Why this source exists at all: the FPL API publishes xG and xA, but nothing
about *how* a player generates them. Two midfielders on identical xA can have
very different persistence — one is the designated corner taker with a high key
pass and shot-creating-action rate, the other converted two speculative crosses.
The columns projected here are the ones that carry signal *forward* rather than
describing what already happened:

  * volume-of-involvement rates — shots, shots on target, key passes, SCA, GCA,
    touches in the attacking penalty area, progressive carries and progressive
    passes received. These are the least noisy per-90 quantities available and
    are what the rate model regresses goals and assists onto.
  * non-penalty xG (`npxg`) rather than raw xG, because penalties belong to a
    separate, near-deterministic process (the taker is known from
    `players.penalties_order`) and mixing them inflates a striker's open-play
    finishing rate.
  * defensive actions — tackles, interceptions, blocks, clearances — which map
    directly onto the FPL defensive-contribution scoring rule and are otherwise
    only available as a single pre-summed integer.

Two deliberate modelling choices:

1. **Every rate is recomputed from totals and 90s played here.** FBref mixes
   conventions across tables (some columns are already per-90, some are totals,
   and which is which changes between seasons and between the "standard" and
   "shooting" tables). Trusting the published per-90 column would silently mix
   units. `per90 = total * 1.0 / minutes_90s` applied uniformly means every rate
   in the database comes from one formula — the same rule `fpl.per90` uses.
2. **A name match is stored, never assumed.** `match_confidence` is written next
   to each row so a consumer can require a threshold. Rows whose player could
   not be resolved are still stored with `player_id = NULL`: the FBref-side
   aggregate is real data and belongs in the audit trail even when the join
   fails.

The library is imported lazily so this module imports on a machine that has
never installed it; the run then reports `unconfigured` with an install hint.
"""
from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

from ..app import config
from ..app import db as dbm
from . import matching
from .fpl import log_finish, log_start, store_snapshot

SOURCE = "fbref"
INSTALL_HINT = "pip install soccerdata  (optional extra; see requirements.txt)"

# stat_type -> soccerdata table name for FBref.read_player_season_stats
STAT_TYPES: tuple[str, ...] = (
    "standard",
    "shooting",
    "passing",
    "goal_shot_creation",
    "defense",
)

# Target column -> ordered list of (top-level group or None, sub-column) probes.
# soccerdata returns a MultiIndex; FBref renames groups between seasons, so each
# metric lists every spelling we have seen rather than one canonical pair.
COLUMN_PROBES: dict[str, tuple[tuple[str | None, str], ...]] = {
    "minutes_90s": ((None, "90s"), ("Playing Time", "90s")),
    "minutes": ((None, "Min"), ("Playing Time", "Min")),
    "npxg": (("Expected", "npxG"), (None, "npxG")),
    "xa": (("Expected", "xAG"), (None, "xAG"), ("Expected", "xA"), (None, "xA")),
    "sca": (("SCA", "SCA"), (None, "SCA")),
    "gca": (("GCA", "GCA"), (None, "GCA")),
    "key_passes": ((None, "KP"), ("Pass Types", "KP")),
    "shots": (("Standard", "Sh"), (None, "Sh"), (None, "Shots")),
    "shots_on_target": (("Standard", "SoT"), (None, "SoT")),
    "touches_att_pen": (("Touches", "Att Pen"), (None, "Att Pen")),
    "prog_carries": (("Carries", "PrgC"), (None, "PrgC"), ("Progression", "PrgC")),
    "prog_passes_rec": (("Receiving", "PrgR"), (None, "PrgR"), ("Progression", "PrgR")),
    "tackles": (("Tackles", "Tkl"), (None, "Tkl")),
    "interceptions": ((None, "Int"), ("Int", "Int")),
    "blocks": (("Blocks", "Blocks"), (None, "Blocks")),
    "clearances": ((None, "Clr"), ("Clr", "Clr")),
    "position": ((None, "Pos"), ("Unnamed: 3_level_0", "Pos")),
}

PER_90_FROM_TOTAL: dict[str, str] = {
    "npxg_per_90": "npxg",
    "xa_per_90": "xa",
    "sca_per_90": "sca",
    "gca_per_90": "gca",
    "key_passes_per_90": "key_passes",
    "shots_per_90": "shots",
    "shots_on_target_per_90": "shots_on_target",
    "touches_att_pen_per_90": "touches_att_pen",
    "prog_carries_per_90": "prog_carries",
    "prog_passes_rec_per_90": "prog_passes_rec",
    "tackles_per_90": "tackles",
    "interceptions_per_90": "interceptions",
    "blocks_per_90": "blocks",
    "clearances_per_90": "clearances",
}

TABLE_COLUMNS: tuple[str, ...] = (
    "player_id",
    "fbref_name",
    "fbref_id",
    "season",
    "league",
    "team",
    "position",
    "minutes_90s",
    "npxg",
    "npxg_per_90",
    "xa",
    "xa_per_90",
    "sca_per_90",
    "gca_per_90",
    "key_passes_per_90",
    "shots_per_90",
    "shots_on_target_per_90",
    "touches_att_pen_per_90",
    "prog_carries_per_90",
    "prog_passes_rec_per_90",
    "tackles_per_90",
    "interceptions_per_90",
    "blocks_per_90",
    "clearances_per_90",
    "match_confidence",
    "captured_at",
)

UNREACHABLE_MARKERS: tuple[str, ...] = (
    "proxy",
    "connection",
    "connect",
    "timed out",
    "timeout",
    "ssl",
    "certificate",
    "name resolution",
    "temporary failure",
    "403",
    "407",
    "max retries",
    "network is unreachable",
    "nodename nor servname",
    "getaddrinfo",
)


def seasons() -> list[str]:
    return [s.strip() for s in config.FBREF_SEASONS.split(",") if s.strip()]


def _classify(exc: BaseException) -> str:
    text = f"{type(exc).__name__}: {exc}".lower()
    return "unreachable" if any(m in text for m in UNREACHABLE_MARKERS) else "error"


HOST_PROBE_URL = "https://fbref.com/en/"


def _host_unreachable() -> str | None:
    """Return why fbref.com cannot be reached, or None when it can.

    soccerdata drives a headless browser, so a network block surfaces as a
    browser error — "Chrome not found" reads like a missing local dependency
    when the real cause is that the host is refused. Probing first means the
    status the UI shows names the actual blocker.
    """
    import httpx  # noqa: PLC0415  (lazy: only needed on this path)

    try:
        response = httpx.get(HOST_PROBE_URL, timeout=12.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        return f"{type(exc).__name__}: {exc}"
    if response.status_code >= 400:
        return f"HTTP {response.status_code} from {HOST_PROBE_URL}"
    return None


def _f(value: Any) -> float | None:
    """Coerce a cell to float, mapping NaN/blank/non-numeric to None."""
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(out) or math.isinf(out):
        return None
    return out


def _s(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except TypeError:
        pass
    text = str(value).strip()
    return text or None


def per90(total: float | None, nineties: float | None) -> float | None:
    """Rate per 90 minutes, computed from the total and the 90s played."""
    if total is None or not nineties:
        return None
    return round(total / nineties, 4)


# -----------------------------------------------------------------------------
# soccerdata frame handling
# -----------------------------------------------------------------------------

def _flat_columns(frame: Any) -> dict[tuple[str | None, str], Any]:
    """Map (top, sub) and (None, sub) keys onto the frame's real column labels."""
    lookup: dict[tuple[str | None, str], Any] = {}
    for col in frame.columns:
        if isinstance(col, tuple):
            top = str(col[0]).strip()
            sub = str(col[-1]).strip()
        else:
            top, sub = "", str(col).strip()
        lookup.setdefault((top, sub), col)
        lookup.setdefault((None, sub), col)
    return lookup


def _resolve(frame: Any, target: str) -> Any | None:
    lookup = _flat_columns(frame)
    for probe in COLUMN_PROBES.get(target, ()):  # ordered by preference
        if probe in lookup:
            return lookup[probe]
    return None


def _records(frame: Any, wanted: Iterable[str]) -> dict[tuple[str, str, str, str], dict[str, Any]]:
    """Project one soccerdata frame into {(league, season, team, player): values}."""
    import pandas as pd  # bundled with the project; safe to import here

    flat = frame.reset_index()
    resolved: dict[str, Any] = {}
    for target in wanted:
        col = _resolve(frame, target)
        if col is None:
            col = _resolve(flat, target)
        if col is not None:
            resolved[target] = col

    def key_col(name: str) -> Any | None:
        for col in flat.columns:
            label = col[0] if isinstance(col, tuple) else col
            if str(label).strip().lower() == name:
                return col
        return None

    k_league, k_season, k_team, k_player = (
        key_col("league"),
        key_col("season"),
        key_col("team"),
        key_col("player"),
    )
    if k_player is None:
        return {}

    out: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for _, row in flat.iterrows():
        player = _s(row[k_player])
        if not player:
            continue
        key = (
            _s(row[k_league]) if k_league is not None else "",
            _s(row[k_season]) if k_season is not None else "",
            _s(row[k_team]) if k_team is not None else "",
            player,
        )
        key = tuple(part or "" for part in key)  # type: ignore[assignment]
        bucket = out.setdefault(key, {})  # type: ignore[arg-type]
        for target, col in resolved.items():
            try:
                value = row[col]
            except (KeyError, IndexError):
                continue
            if isinstance(value, pd.Series):
                value = value.iloc[0] if len(value) else None
            if target == "position":
                text = _s(value)
                if text:
                    bucket[target] = text
                continue
            num = _f(value)
            if num is not None:
                bucket[target] = num
    return out  # type: ignore[return-value]


def _jsonable(frame: Any) -> list[dict[str, Any]]:
    """Verbatim-as-possible JSON view of a soccerdata frame, for raw_snapshots."""
    flat = frame.reset_index()
    flat.columns = [
        " | ".join(str(p).strip() for p in col) if isinstance(col, tuple) else str(col)
        for col in flat.columns
    ]
    records: list[dict[str, Any]] = []
    for record in flat.to_dict(orient="records"):
        clean: dict[str, Any] = {}
        for k, v in record.items():
            if v is None:
                clean[k] = None
            elif isinstance(v, (int, str, bool)):
                clean[k] = v
            else:
                num = _f(v)
                clean[k] = num if num is not None else _s(v)
        records.append(clean)
    return records


# -----------------------------------------------------------------------------
# projection
# -----------------------------------------------------------------------------

def project(
    conn: sqlite3.Connection,
    merged: dict[tuple[str, str, str, str], dict[str, Any]],
    *,
    league: str,
) -> tuple[int, int, int]:
    """Write `fbref_player_stats` rows. Returns (written, matched, unmatched)."""
    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    matched = 0
    for (row_league, row_season, team, player), values in merged.items():
        nineties = _f(values.get("minutes_90s"))
        if nineties is None:
            minutes = _f(values.get("minutes"))
            nineties = round(minutes / 90.0, 4) if minutes else None
        player_id, confidence = matching.match_player(conn, player, team_hint=team)
        if player_id is not None:
            matched += 1
        row: dict[str, Any] = {
            "player_id": player_id,
            "fbref_name": player,
            "fbref_id": None,
            "season": row_season or "",
            "league": row_league or league,
            "team": team or None,
            "position": values.get("position"),
            "minutes_90s": nineties,
            "npxg": _f(values.get("npxg")),
            "xa": _f(values.get("xa")),
            "match_confidence": round(float(confidence), 4),
            "captured_at": now,
        }
        for target, total_key in PER_90_FROM_TOTAL.items():
            row[target] = per90(_f(values.get(total_key)), nineties)
        rows.append({col: row.get(col) for col in TABLE_COLUMNS})

    written = dbm.upsert(conn, "fbref_player_stats", rows, ["fbref_name", "season", "league"])
    conn.commit()
    return written, matched, len(rows) - matched


# -----------------------------------------------------------------------------
# entry point
# -----------------------------------------------------------------------------

def ingest(
    conn: sqlite3.Connection,
    *,
    league: str | None = None,
    season_list: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Pull the configured FBref tables and project them.

    Returns the standard ingest dict. Statuses used:
      `unconfigured` — soccerdata is not installed
      `unreachable`  — the library could not reach fbref.com
      `partial`      — some stat tables landed, others failed
      `ok`           — every requested table landed
    """
    run = log_start(conn, SOURCE)
    league = league or config.FBREF_LEAGUE
    season_values = list(season_list) if season_list else seasons()

    try:
        import soccerdata  # noqa: PLC0415  (lazy: optional extra)
    except Exception as exc:  # ImportError, or a broken transitive dep
        msg = f"soccerdata not installed ({type(exc).__name__}); {INSTALL_HINT}"
        log_finish(conn, run, "unconfigured", 0, msg)
        return {"source": SOURCE, "mode": "unconfigured", "rows": 0, "message": msg}

    if not season_values:
        msg = "FBREF_SEASONS is empty; set it to e.g. '2526'"
        log_finish(conn, run, "unconfigured", 0, msg)
        return {"source": SOURCE, "mode": "unconfigured", "rows": 0, "message": msg}

    blocked = _host_unreachable()
    if blocked:
        msg = f"fbref.com is not reachable from this host ({blocked}); nothing was stored"
        log_finish(conn, run, "unreachable", 0, msg)
        return {"source": SOURCE, "mode": "unreachable", "rows": 0, "message": msg}

    try:
        reader = soccerdata.FBref(leagues=league, seasons=season_values)
    except Exception as exc:
        status = _classify(exc)
        msg = f"FBref reader init failed: {type(exc).__name__}: {exc}"
        log_finish(conn, run, status, 0, msg)
        return {"source": SOURCE, "mode": status, "rows": 0, "message": msg}

    merged: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    fetched: list[str] = []
    failures: list[str] = []
    fatal_status = "error"

    for stat in STAT_TYPES:
        try:
            frame = reader.read_player_season_stats(stat_type=stat)
        except Exception as exc:
            fatal_status = _classify(exc)
            failures.append(f"{stat}: {type(exc).__name__}: {exc}")
            continue
        store_snapshot(
            conn,
            f"fbref/player_season_stats/{stat}/{league}/{','.join(season_values)}",
            _jsonable(frame),
            source=SOURCE,
        )
        for key, values in _records(frame, COLUMN_PROBES.keys()).items():
            merged.setdefault(key, {}).update(values)
        fetched.append(stat)

    if not merged:
        detail = "; ".join(failures[:3]) or "FBref returned no player rows"
        status = fatal_status if failures else "error"
        log_finish(conn, run, status, 0, detail)
        return {"source": SOURCE, "mode": status, "rows": 0, "message": detail}

    written, matched, unmatched = project(conn, merged, league=league)
    status = "ok" if not failures else "partial"
    msg = (
        f"{written} player-seasons from {len(fetched)}/{len(STAT_TYPES)} tables "
        f"({','.join(fetched)}); {matched} matched to FPL ids, {unmatched} unmatched"
    )
    if failures:
        msg += f"; failed: {'; '.join(failures[:3])}"
    log_finish(conn, run, status, written, msg)
    return {
        "source": SOURCE,
        "mode": "live",
        "rows": written,
        "message": msg,
        "matched": matched,
        "unmatched": unmatched,
        "tables": fetched,
    }


def latest(conn: sqlite3.Connection, player_id: int) -> dict[str, Any] | None:
    """Most recent FBref row for a player, or None when never ingested."""
    row = conn.execute(
        "SELECT * FROM fbref_player_stats WHERE player_id=? "
        "ORDER BY captured_at DESC, season DESC LIMIT 1",
        (player_id,),
    ).fetchone()
    return dict(row) if row is not None else None


__all__ = ["ingest", "latest", "project", "per90", "seasons", "SOURCE"]

# Kept importable for debugging a column-mapping change without a network round
# trip: `python -c "import json,sys; from backend.ingest import fbref; ..."`.
_ = json
