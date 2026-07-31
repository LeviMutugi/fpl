"""Official FPL API ingestion.

Live fetch is attempted first. When the host is unreachable (offline laptop,
locked-down network) the most recent stored snapshot is projected instead, and
the run is logged as `unreachable` so the UI can show exactly how stale the
data is. The projection itself is identical either way, so nothing downstream
has to care which path was taken.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable

from ..app import config
from ..app import db as dbm
from .http import Fetched, SourceError, SourceUnreachable, fetch_json, sha256_of

# Official club colours, used for shirt/badge tinting in the UI. Reference data,
# keyed by the FPL team code so it survives id reshuffles between seasons.
TEAM_COLOURS: dict[int, tuple[str, str]] = {
    3: ("#EF0107", "#FFFFFF"),    # Arsenal
    7: ("#95BFE5", "#670E36"),    # Aston Villa
    91: ("#DA291C", "#000000"),   # Bournemouth
    94: ("#E30613", "#FFFFFF"),   # Brentford
    36: ("#0057B8", "#FFCD00"),   # Brighton
    8: ("#034694", "#FFFFFF"),    # Chelsea
    31: ("#1B458F", "#C4122E"),   # Crystal Palace
    11: ("#003399", "#FFFFFF"),   # Everton
    54: ("#FFFFFF", "#000000"),   # Fulham
    2: ("#003090", "#FFFFFF"),    # Leeds
    13: ("#003090", "#FDBE11"),   # Leicester
    14: ("#C8102E", "#00B2A9"),   # Liverpool
    43: ("#6CABDD", "#1C2C5B"),   # Man City
    1: ("#DA291C", "#FBE122"),    # Man Utd
    4: ("#241F20", "#FFFFFF"),    # Newcastle
    17: ("#DD0000", "#FFFFFF"),   # Nott'm Forest
    56: ("#D71920", "#FFFFFF"),   # Sunderland
    6: ("#132257", "#FFFFFF"),    # Tottenham
    21: ("#7A263A", "#1BB1E7"),   # West Ham
    39: ("#FDB913", "#231F20"),   # Wolves
    90: ("#0000FF", "#FFFFFF"),   # Burnley
    49: ("#0057B8", "#FFFFFF"),   # Sheffield Utd
    102: ("#0000FF", "#FFFFFF"),  # Ipswich
    35: ("#122F67", "#FFFFFF"),   # West Brom
    57: ("#0053A0", "#FFFFFF"),   # Birmingham
}
DEFAULT_COLOURS = ("#1F6F4A", "#FFFFFF")


def _f(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def per90(total: float, minutes: float) -> float:
    if not minutes:
        return 0.0
    return round(total * 90.0 / minutes, 4)


# -----------------------------------------------------------------------------
# run logging
# -----------------------------------------------------------------------------
def log_start(conn: sqlite3.Connection, source: str) -> int:
    cur = conn.execute(
        "INSERT INTO ingest_runs (source, status, started_at) VALUES (?, 'running', ?)",
        (source, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return int(cur.lastrowid)


def log_finish(conn: sqlite3.Connection, run_id: int, status: str, rows: int, message: str = "") -> None:
    conn.execute(
        "UPDATE ingest_runs SET status=?, rows_written=?, message=?, finished_at=? WHERE id=?",
        (status, rows, message[:2000], datetime.now(timezone.utc).isoformat(), run_id),
    )
    conn.commit()


def store_snapshot(conn: sqlite3.Connection, endpoint: str, payload: Any, source: str = "fpl", sha: str | None = None) -> int:
    cur = conn.execute(
        "INSERT INTO raw_snapshots (source, endpoint, payload, sha256, captured_at) VALUES (?,?,?,?,?)",
        (source, endpoint, json.dumps(payload), sha or sha256_of(payload), datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return int(cur.lastrowid)


def _acquire(conn: sqlite3.Connection, endpoint: str, url: str) -> tuple[Any, str, str, str]:
    """Return (payload, mode, detail, captured_at) for an endpoint.

    mode is 'live' when the fetch succeeded, 'snapshot' when we fell back.
    """
    try:
        fetched: Fetched = fetch_json(url)
    except (SourceUnreachable, SourceError) as exc:
        stored = dbm.latest_snapshot(conn, endpoint)
        if stored is None:
            raise
        _, payload, captured_at = stored
        return payload, "snapshot", f"{type(exc).__name__}: {exc}", captured_at
    store_snapshot(conn, endpoint, fetched.payload, sha=fetched.sha256)
    return fetched.payload, "live", "", datetime.now(timezone.utc).isoformat()


# -----------------------------------------------------------------------------
# projections
# -----------------------------------------------------------------------------
def project_teams(conn: sqlite3.Connection, teams: list[dict]) -> int:
    rows = []
    for t in teams:
        code = t["code"]
        primary, secondary = TEAM_COLOURS.get(code, DEFAULT_COLOURS)
        rows.append(
            {
                "id": t["id"],
                "code": code,
                "name": t["name"],
                "short_name": t["short_name"],
                "pulse_id": t.get("pulse_id"),
                "strength": t.get("strength"),
                "strength_overall_home": t.get("strength_overall_home"),
                "strength_overall_away": t.get("strength_overall_away"),
                "strength_attack_home": t.get("strength_attack_home"),
                "strength_attack_away": t.get("strength_attack_away"),
                "strength_defence_home": t.get("strength_defence_home"),
                "strength_defence_away": t.get("strength_defence_away"),
                "badge_url": f"https://resources.premierleague.com/premierleague/badges/70/t{code}.png",
                "shirt_url": f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{code}-110.webp",
                "primary_hex": primary,
                "secondary_hex": secondary,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return dbm.upsert(conn, "teams", rows, ["id"])


def project_element_types(conn: sqlite3.Connection, types: list[dict]) -> int:
    rows = [
        {
            "id": t["id"],
            "singular_name": t["singular_name"],
            "singular_name_short": t["singular_name_short"],
            "plural_name": t["plural_name"],
            "squad_select": t.get("squad_select"),
            "squad_min_play": t.get("squad_min_play"),
            "squad_max_play": t.get("squad_max_play"),
            "element_count": t.get("element_count"),
        }
        for t in types
    ]
    return dbm.upsert(conn, "element_types", rows, ["id"])


def project_events(conn: sqlite3.Connection, events: list[dict]) -> int:
    rows = [
        {
            "id": e["id"],
            "name": e["name"],
            "deadline_time": e.get("deadline_time"),
            "deadline_epoch": e.get("deadline_time_epoch"),
            "finished": int(bool(e.get("finished"))),
            "data_checked": int(bool(e.get("data_checked"))),
            "is_previous": int(bool(e.get("is_previous"))),
            "is_current": int(bool(e.get("is_current"))),
            "is_next": int(bool(e.get("is_next"))),
            "average_entry_score": e.get("average_entry_score"),
            "highest_score": e.get("highest_score"),
            "most_selected": e.get("most_selected"),
            "most_captained": e.get("most_captained"),
            "top_element": e.get("top_element"),
            "transfers_made": e.get("transfers_made"),
            "chip_plays_json": json.dumps(e.get("chip_plays") or []),
        }
        for e in events
    ]
    return dbm.upsert(conn, "events", rows, ["id"])


def project_game_config(conn: sqlite3.Connection, payload: dict) -> int:
    cfg = payload.get("game_config") or {}
    rows = [
        {"key": "scoring", "value_json": json.dumps(cfg.get("scoring") or {}), "updated_at": datetime.now(timezone.utc).isoformat()},
        {"key": "rules", "value_json": json.dumps(cfg.get("rules") or payload.get("game_settings") or {}), "updated_at": datetime.now(timezone.utc).isoformat()},
        {"key": "settings", "value_json": json.dumps(cfg.get("settings") or {}), "updated_at": datetime.now(timezone.utc).isoformat()},
    ]
    return dbm.upsert(conn, "game_config", rows, ["key"])


def project_chips(conn: sqlite3.Connection, chips: list[dict]) -> int:
    rows = [
        {
            "id": c["id"],
            "name": c["name"],
            "number": c.get("number"),
            "chip_type": c.get("chip_type"),
            "start_event": c.get("start_event"),
            "stop_event": c.get("stop_event"),
        }
        for c in chips
    ]
    return dbm.upsert(conn, "chips", rows, ["id"])


def photo_urls(code: int, photo: str | None) -> tuple[str, str]:
    """Best-guess CDN URLs stored for convenience.

    The browser component and `/api/photo` resolver both try several schemes, so
    these are a starting point rather than the single source of truth.
    """
    stem = (photo or f"{code}.jpg").rsplit(".", 1)[0]
    return (
        f"https://resources.premierleague.com/premierleague25/photos/players/110x140/{stem}.png",
        f"https://resources.premierleague.com/premierleague25/photos/players/250x250/{stem}.png",
    )


def project_players(conn: sqlite3.Connection, elements: list[dict]) -> int:
    rows = []
    now = datetime.now(timezone.utc).isoformat()
    for e in elements:
        small, hd = photo_urls(e["code"], e.get("photo"))
        rows.append(
            {
                "id": e["id"],
                "code": e["code"],
                "first_name": e["first_name"],
                "second_name": e["second_name"],
                "web_name": e["web_name"],
                "known_name": e.get("known_name") or None,
                "team_id": e["team"],
                "team_code": e["team_code"],
                "element_type": e["element_type"],
                "now_cost": e["now_cost"],
                "cost_change_start": e.get("cost_change_start", 0),
                "cost_change_event": e.get("cost_change_event", 0),
                "status": e.get("status"),
                "chance_of_playing_this_round": e.get("chance_of_playing_this_round"),
                "chance_of_playing_next_round": e.get("chance_of_playing_next_round"),
                "news": e.get("news") or "",
                "news_added": e.get("news_added"),
                "selected_by_percent": _f(e.get("selected_by_percent")),
                "form": _f(e.get("form")),
                "points_per_game": _f(e.get("points_per_game")),
                "ep_next": _f(e.get("ep_next")),
                "ep_this": _f(e.get("ep_this")),
                "transfers_in_event": e.get("transfers_in_event", 0),
                "transfers_out_event": e.get("transfers_out_event", 0),
                "dreamteam_count": e.get("dreamteam_count", 0),
                "birth_date": e.get("birth_date"),
                "region": e.get("region"),
                "squad_number": e.get("squad_number"),
                "opta_code": e.get("opta_code"),
                "photo": e.get("photo"),
                "photo_url": small,
                "photo_hd_url": hd,
                "penalties_order": e.get("penalties_order"),
                "corners_order": e.get("corners_and_indirect_freekicks_order"),
                "direct_fk_order": e.get("direct_freekicks_order"),
                "can_select": int(bool(e.get("can_select", True))),
                "updated_at": now,
            }
        )
    return dbm.upsert(conn, "players", rows, ["id"])


def project_season_stats(conn: sqlite3.Connection, elements: list[dict], season: str) -> int:
    """Project the season aggregates carried on each element.

    During pre-season these are the completed previous campaign; mid-season they
    are the running totals for the current one. The caller passes the label.
    """
    rows = []
    for e in elements:
        minutes = _f(e.get("minutes"))
        starts = _f(e.get("starts"))
        rows.append(
            {
                "player_id": e["id"],
                "season": season,
                "minutes": _i(e.get("minutes"), 0),
                "starts": _i(e.get("starts"), 0),
                "total_points": _i(e.get("total_points"), 0),
                "goals_scored": _i(e.get("goals_scored"), 0),
                "assists": _i(e.get("assists"), 0),
                "clean_sheets": _i(e.get("clean_sheets"), 0),
                "goals_conceded": _i(e.get("goals_conceded"), 0),
                "own_goals": _i(e.get("own_goals"), 0),
                "penalties_saved": _i(e.get("penalties_saved"), 0),
                "penalties_missed": _i(e.get("penalties_missed"), 0),
                "yellow_cards": _i(e.get("yellow_cards"), 0),
                "red_cards": _i(e.get("red_cards"), 0),
                "saves": _i(e.get("saves"), 0),
                "bonus": _i(e.get("bonus"), 0),
                "bps": _i(e.get("bps"), 0),
                "influence": _f(e.get("influence")),
                "creativity": _f(e.get("creativity")),
                "threat": _f(e.get("threat")),
                "ict_index": _f(e.get("ict_index")),
                "defensive_contribution": _i(e.get("defensive_contribution"), 0),
                "clearances_blocks_interceptions": _i(e.get("clearances_blocks_interceptions"), 0),
                "recoveries": _i(e.get("recoveries"), 0),
                "tackles": _i(e.get("tackles"), 0),
                "expected_goals": _f(e.get("expected_goals")),
                "expected_assists": _f(e.get("expected_assists")),
                "expected_goal_involvements": _f(e.get("expected_goal_involvements")),
                "expected_goals_conceded": _f(e.get("expected_goals_conceded")),
                # The API ships some per-90s already; recompute from totals so
                # every rate in the database comes from one consistent formula.
                "xg90": per90(_f(e.get("expected_goals")), minutes),
                "xa90": per90(_f(e.get("expected_assists")), minutes),
                "xgi90": per90(_f(e.get("expected_goal_involvements")), minutes),
                "xgc90": per90(_f(e.get("expected_goals_conceded")), minutes),
                "saves90": per90(_f(e.get("saves")), minutes),
                "cs90": per90(_f(e.get("clean_sheets")), minutes),
                "defcon90": per90(_f(e.get("defensive_contribution")), minutes),
                "bps90": per90(_f(e.get("bps")), minutes),
                "pts90": per90(_f(e.get("total_points")), minutes),
                "starts_per_90": per90(starts, minutes),
            }
        )
    return dbm.upsert(conn, "player_season_stats", rows, ["player_id", "season"])


def project_fixtures(conn: sqlite3.Connection, fixtures: list[dict]) -> int:
    rows = [
        {
            "id": f["id"],
            "code": f.get("code"),
            "event": f.get("event"),
            "team_h": f["team_h"],
            "team_a": f["team_a"],
            "team_h_difficulty": f.get("team_h_difficulty"),
            "team_a_difficulty": f.get("team_a_difficulty"),
            "kickoff_time": f.get("kickoff_time"),
            "started": int(bool(f.get("started"))),
            "finished": int(bool(f.get("finished"))),
            "minutes": f.get("minutes", 0),
            "team_h_score": f.get("team_h_score"),
            "team_a_score": f.get("team_a_score"),
            "stats_json": json.dumps(f.get("stats") or []),
        }
        for f in fixtures
    ]
    return dbm.upsert(conn, "fixtures", rows, ["id"])


def derive_team_strengths(conn: sqlite3.Connection) -> int:
    """Fill the attack/defence strengths the API leaves at 0 pre-season.

    Pre-season the FPL API publishes `strength_overall_home/away` but zeroes the
    attack and defence splits, which would leave the fixture-difficulty views
    with nothing to show. The same league-relative indices the model uses are
    computed here (one implementation, in `fplengine.rates`) and mapped onto the
    1-5 band the API itself uses so the columns stay comparable.
    """
    from ..fplengine.data import load as load_dataset
    from ..fplengine.rates import fit_team_model

    ds = load_dataset(conn)
    if ds.season.empty:
        return 0
    model = fit_team_model(ds.players, ds.season, ds.team_matches, ds.teams)

    def to_band(index: float, invert: bool) -> float:
        # index is league-relative with 1.0 = average; +/-40% spans the band.
        unit = (index - 0.6) / 0.8
        if invert:
            unit = 1.0 - unit
        return round(float(max(1.0, min(5.0, 1.0 + 4.0 * unit))), 3)

    updated = 0
    for t in ds.teams.itertuples():
        tid = int(t.id)
        att = model.attack_index.get(tid)
        dfn = model.defence_index.get(tid)
        if att is None or dfn is None:
            continue
        att_band = to_band(att, invert=False)
        def_band = to_band(dfn, invert=True)  # conceding less xG => stronger
        overall_h = t.strength_overall_home or 3
        overall_a = t.strength_overall_away or 3
        conn.execute(
            """UPDATE teams SET strength_attack_home=?, strength_attack_away=?,
                   strength_defence_home=?, strength_defence_away=?,
                   strength=COALESCE(NULLIF(strength,0), ?)
               WHERE id=?""",
            (
                min(5.0, att_band + 0.15), max(1.0, att_band - 0.15),
                min(5.0, def_band + 0.15), max(1.0, def_band - 0.15),
                int(round((overall_h + overall_a) / 2.0)),
                tid,
            ),
        )
        updated += 1
    conn.commit()
    return updated


# -----------------------------------------------------------------------------
# entry points
# -----------------------------------------------------------------------------
def ingest_bootstrap(conn: sqlite3.Connection, season: str | None = None) -> dict[str, Any]:
    run = log_start(conn, "fpl_bootstrap")
    try:
        payload, mode, detail, captured_at = _acquire(conn, "bootstrap-static", config.FPL_BOOTSTRAP_URL)
    except (SourceUnreachable, SourceError) as exc:
        log_finish(conn, run, "unreachable", 0, str(exc))
        raise

    # Season labelling: if any gameweek has finished, the aggregates on each
    # element belong to the current season; pre-season they are last season's.
    events = payload.get("events", [])
    any_finished = any(e.get("finished") for e in events)
    label = season or (config.CURRENT_SEASON if any_finished else config.PRIOR_SEASON)

    rows = 0
    rows += project_teams(conn, payload["teams"])
    rows += project_element_types(conn, payload.get("element_types", []))
    rows += project_events(conn, events)
    rows += project_chips(conn, payload.get("chips", []))
    rows += project_game_config(conn, payload)
    rows += project_players(conn, payload["elements"])
    rows += project_season_stats(conn, payload["elements"], label)
    conn.commit()
    derive_team_strengths(conn)

    status = "ok" if mode == "live" else "unreachable"
    msg = (
        f"live fetch ok; {len(payload['elements'])} elements"
        if mode == "live"
        else f"live fetch failed ({detail}); projected stored snapshot captured {captured_at}"
    )
    log_finish(conn, run, status, rows, msg)
    return {
        "source": "fpl_bootstrap",
        "mode": mode,
        "season_label": label,
        "rows": rows,
        "captured_at": captured_at,
        "message": msg,
        "total_players": payload.get("total_players"),
    }


def ingest_fixtures(conn: sqlite3.Connection) -> dict[str, Any]:
    run = log_start(conn, "fpl_fixtures")
    try:
        payload, mode, detail, captured_at = _acquire(conn, "fixtures", config.FPL_FIXTURES_URL)
    except (SourceUnreachable, SourceError) as exc:
        log_finish(conn, run, "unreachable", 0, str(exc))
        raise
    rows = project_fixtures(conn, payload)
    conn.commit()
    status = "ok" if mode == "live" else "unreachable"
    msg = (
        f"live fetch ok; {rows} fixtures"
        if mode == "live"
        else f"live fetch failed ({detail}); projected stored snapshot captured {captured_at}"
    )
    log_finish(conn, run, status, rows, msg)
    return {"source": "fpl_fixtures", "mode": mode, "rows": rows, "captured_at": captured_at, "message": msg}


def ingest_player_history(conn: sqlite3.Connection, player_ids: Iterable[int] | None = None, limit: int | None = None) -> dict[str, Any]:
    """Per-gameweek history from element-summary.

    Requires live access — there is no aggregate endpoint that carries it. When
    the host is unreachable the run is logged and the tables stay empty; the
    models then use season aggregates and say so in their metadata.
    """
    run = log_start(conn, "fpl_history")
    ids = list(player_ids) if player_ids is not None else [
        r["id"] for r in conn.execute("SELECT id FROM players ORDER BY now_cost DESC").fetchall()
    ]
    if limit:
        ids = ids[:limit]

    written = 0
    errors: list[str] = []
    for pid in ids:
        try:
            fetched = fetch_json(config.FPL_ELEMENT_SUMMARY_URL.format(player_id=pid))
        except (SourceUnreachable, SourceError) as exc:
            errors.append(f"{pid}: {exc}")
            if len(errors) >= 3:
                break
            continue
        rows = []
        for h in fetched.payload.get("history", []):
            rows.append(
                {
                    "player_id": pid,
                    "event_id": h["round"],
                    "fixture_id": h.get("fixture"),
                    "opponent_team": h.get("opponent_team"),
                    "was_home": int(bool(h.get("was_home"))),
                    "minutes": h.get("minutes", 0),
                    "starts": h.get("starts", 0),
                    "goals_scored": h.get("goals_scored", 0),
                    "assists": h.get("assists", 0),
                    "clean_sheets": h.get("clean_sheets", 0),
                    "goals_conceded": h.get("goals_conceded", 0),
                    "own_goals": h.get("own_goals", 0),
                    "penalties_saved": h.get("penalties_saved", 0),
                    "penalties_missed": h.get("penalties_missed", 0),
                    "yellow_cards": h.get("yellow_cards", 0),
                    "red_cards": h.get("red_cards", 0),
                    "saves": h.get("saves", 0),
                    "bonus": h.get("bonus", 0),
                    "bps": h.get("bps", 0),
                    "influence": _f(h.get("influence")),
                    "creativity": _f(h.get("creativity")),
                    "threat": _f(h.get("threat")),
                    "ict_index": _f(h.get("ict_index")),
                    "expected_goals": _f(h.get("expected_goals")),
                    "expected_assists": _f(h.get("expected_assists")),
                    "expected_goal_involvements": _f(h.get("expected_goal_involvements")),
                    "expected_goals_conceded": _f(h.get("expected_goals_conceded")),
                    "defensive_contribution": h.get("defensive_contribution", 0),
                    "value": h.get("value"),
                    "selected": h.get("selected"),
                    "total_points": h.get("total_points", 0),
                    "as_of": datetime.now(timezone.utc).isoformat(),
                }
            )
        written += dbm.upsert(conn, "element_gameweeks", rows, ["player_id", "event_id", "fixture_id"])
        conn.commit()

    if written == 0 and errors:
        log_finish(conn, run, "unreachable", 0, "; ".join(errors[:3]))
        return {"source": "fpl_history", "mode": "unreachable", "rows": 0, "message": errors[0]}
    log_finish(conn, run, "ok" if not errors else "partial", written, "; ".join(errors[:3]))
    return {"source": "fpl_history", "mode": "live", "rows": written, "message": f"{written} gameweek rows"}
