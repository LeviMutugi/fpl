"""Read model for the API.

All shaping of database rows into the response objects described in
docs/API_CONTRACT.md happens here, so the routers stay thin and the same
serialisation is reused by every endpoint. Absent data is passed through as
`None` rather than coerced to zero — the frontend renders those as explicit
"no data" states.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Iterable, Sequence

from . import config

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}


# -----------------------------------------------------------------------------
# imagery
# -----------------------------------------------------------------------------
def photo_candidates(code: int, size: str = "md") -> list[str]:
    dimension = config.PHOTO_SIZES.get(size, "250x250")
    return [tpl.format(size=dimension, code=code) for tpl in config.PHOTO_CANDIDATES]


def photo_block(code: int) -> dict[str, Any]:
    return {
        "sm": photo_candidates(code, "sm")[0],
        "md": photo_candidates(code, "md")[0],
        "candidates": photo_candidates(code, "md") + [f"/api/photo/{code}?size=md"],
    }


def badge_candidates(code: int, size: int = 70) -> list[str]:
    return [tpl.format(size=size, code=code) for tpl in config.BADGE_CANDIDATES]


# -----------------------------------------------------------------------------
# runs
# -----------------------------------------------------------------------------
def active_run(conn: sqlite3.Connection) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM model_runs WHERE status='ok' ORDER BY created_at DESC, rowid DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    run = dict(row)
    config_json = _load_json(run.get("config_json")) or {}
    snapshot_captured = None
    if run.get("snapshot_id"):
        snap = conn.execute(
            "SELECT captured_at FROM raw_snapshots WHERE id=?", (run["snapshot_id"],)
        ).fetchone()
        snapshot_captured = snap["captured_at"] if snap else None
    models = [
        r["model_id"]
        for r in conn.execute(
            "SELECT DISTINCT model_id FROM predictions WHERE run_id=? ORDER BY model_id",
            (run["run_id"],),
        )
    ]
    return {
        "run_id": run["run_id"],
        "created_at": run["created_at"],
        "target_event": run["target_event"],
        "horizon": run["horizon"],
        "snapshot_captured_at": snapshot_captured,
        "n_players": run["n_players"],
        "n_train_rows": run["n_train_rows"],
        "models": models,
        "season": run.get("season"),
        "season_source": config_json.get("season_source"),
        "history_rows": (config_json.get("evaluation") or {}).get("history_rows", 0),
        "duration_ms": run.get("duration_ms"),
        "stack_weights": config_json.get("stack_weights") or {},
        "assumptions": config_json.get("structural") or {},
        "gbm": config_json.get("gbm") or {},
        "evaluation": config_json.get("evaluation") or {},
        "defensive_contribution_available": config_json.get("defensive_contribution_available"),
    }


def require_run(conn: sqlite3.Connection) -> dict[str, Any]:
    run = active_run(conn)
    if run is None:
        raise NoRunError()
    return run


class NoRunError(RuntimeError):
    """Raised when the engine has never completed a model run."""


# -----------------------------------------------------------------------------
# meta
# -----------------------------------------------------------------------------
def meta(conn: sqlite3.Connection) -> dict[str, Any]:
    events = [
        {
            "id": r["id"],
            "name": r["name"],
            "deadline_time": r["deadline_time"],
            "finished": bool(r["finished"]),
            "is_current": bool(r["is_current"]),
            "is_next": bool(r["is_next"]),
            "average_entry_score": r["average_entry_score"],
        }
        for r in conn.execute("SELECT * FROM events ORDER BY id")
    ]
    current = next((e["id"] for e in events if e["is_current"] and not e["finished"]), None)
    nxt = next((e["id"] for e in events if e["is_next"]), None)
    deadline = next((e["deadline_time"] for e in events if e["id"] == (nxt or current)), None)

    counts = {
        "players": _count(conn, "players"),
        "teams": _count(conn, "teams"),
        "fixtures": _count(conn, "fixtures"),
        "gameweek_rows": _count(conn, "element_gameweeks"),
        "predictions": _count(conn, "predictions"),
        "news_items": _count(conn, "news_items"),
        "odds_rows": _count(conn, "odds_markets"),
        "fbref_rows": _count(conn, "fbref_player_stats"),
    }

    total_players = None
    snap = conn.execute(
        "SELECT payload FROM raw_snapshots WHERE endpoint='bootstrap-static' "
        "ORDER BY captured_at DESC, id DESC LIMIT 1"
    ).fetchone()
    if snap:
        try:
            total_players = json.loads(snap["payload"]).get("total_players")
        except (json.JSONDecodeError, AttributeError):
            total_players = None

    return {
        "season": config.CURRENT_SEASON,
        "prior_season": config.PRIOR_SEASON,
        "current_event": current,
        "next_event": nxt,
        "next_deadline": deadline,
        "events": events,
        "counts": counts,
        "data_freshness": freshness(conn),
        "active_run": active_run(conn),
        "total_fpl_players": total_players,
        "scoring_rules": _scoring_rules(conn),
    }


def freshness(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    known = ["fpl_bootstrap", "fpl_fixtures", "fpl_history", "fbref", "odds", "news"]
    out = []
    for source in known:
        latest = conn.execute(
            "SELECT status, rows_written, message, started_at, finished_at FROM ingest_runs "
            "WHERE source=? ORDER BY started_at DESC, id DESC LIMIT 1",
            (source,),
        ).fetchone()
        success = conn.execute(
            "SELECT finished_at FROM ingest_runs WHERE source=? AND status IN ('ok','partial') "
            "ORDER BY started_at DESC, id DESC LIMIT 1",
            (source,),
        ).fetchone()
        out.append(
            {
                "source": source,
                "status": latest["status"] if latest else "never",
                "last_success": success["finished_at"] if success else None,
                "last_attempt": latest["started_at"] if latest else None,
                "rows": latest["rows_written"] if latest else 0,
                "message": latest["message"] if latest else None,
            }
        )
    return out


def _scoring_rules(conn: sqlite3.Connection) -> dict[str, Any] | None:
    row = conn.execute("SELECT value_json FROM game_config WHERE key='scoring'").fetchone()
    if not row:
        return None
    from ..fplengine.scoring import ScoringRules

    return ScoringRules.load(conn).summary()


# -----------------------------------------------------------------------------
# teams and fixtures
# -----------------------------------------------------------------------------
def teams(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    run = active_run(conn)
    indices = ((run or {}).get("assumptions") or {}).get("team_model") or {}
    fallback = set(indices.get("fallback_teams") or [])
    rows = []
    for r in conn.execute("SELECT * FROM teams ORDER BY name"):
        t = dict(r)
        rows.append(
            {
                "id": t["id"],
                "code": t["code"],
                "name": t["name"],
                "short_name": t["short_name"],
                "badge_url": t["badge_url"],
                "badge_candidates": badge_candidates(t["code"]),
                "shirt_url": t["shirt_url"],
                "primary_hex": t["primary_hex"],
                "secondary_hex": t["secondary_hex"],
                "strength": t["strength"],
                "strength_overall_home": t["strength_overall_home"],
                "strength_overall_away": t["strength_overall_away"],
                "strength_attack_home": t["strength_attack_home"],
                "strength_attack_away": t["strength_attack_away"],
                "strength_defence_home": t["strength_defence_home"],
                "strength_defence_away": t["strength_defence_away"],
                "strength_source": "api" if t["id"] not in fallback else "published_overall_only",
            }
        )
    return rows


def fixtures(conn: sqlite3.Connection, from_event: int | None = None, to_event: int | None = None) -> list[dict[str, Any]]:
    sql = """SELECT f.*, th.short_name AS home_short, th.name AS home_name, th.code AS home_code,
                    th.primary_hex AS home_hex,
                    ta.short_name AS away_short, ta.name AS away_name, ta.code AS away_code,
                    ta.primary_hex AS away_hex
             FROM fixtures f
             JOIN teams th ON th.id = f.team_h
             JOIN teams ta ON ta.id = f.team_a"""
    params: list[Any] = []
    clauses = []
    if from_event is not None:
        clauses.append("f.event >= ?")
        params.append(from_event)
    if to_event is not None:
        clauses.append("f.event <= ?")
        params.append(to_event)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY f.event, f.kickoff_time"

    out = []
    for r in conn.execute(sql, params):
        out.append(
            {
                "id": r["id"],
                "event": r["event"],
                "kickoff": r["kickoff_time"],
                "home": {"id": r["team_h"], "short_name": r["home_short"], "name": r["home_name"],
                         "code": r["home_code"], "primary_hex": r["home_hex"]},
                "away": {"id": r["team_a"], "short_name": r["away_short"], "name": r["away_name"],
                         "code": r["away_code"], "primary_hex": r["away_hex"]},
                "home_difficulty": r["team_h_difficulty"],
                "away_difficulty": r["team_a_difficulty"],
                "finished": bool(r["finished"]),
                "home_score": r["team_h_score"],
                "away_score": r["team_a_score"],
            }
        )
    return out


def fdr_grid(conn: sqlite3.Connection, from_event: int, to_event: int) -> dict[str, Any]:
    """Fixture outlook per team over a window.

    `difficulty` is the game's own 1-5 rating. `attack_index`/`defence_index` are
    the model's league-relative view of the same fixture, which is what the xP
    numbers actually use — the two are shown side by side rather than blended.
    """
    run = active_run(conn)
    team_model = ((run or {}).get("assumptions") or {}).get("team_model") or {}
    league_goals = team_model.get("league_goals_per_match")

    indices = _team_indices(conn)
    team_rows = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM teams")}
    grid: dict[int, dict[int, list[dict[str, Any]]]] = {tid: {} for tid in team_rows}

    for f in conn.execute(
        "SELECT * FROM fixtures WHERE event >= ? AND event <= ? ORDER BY event", (from_event, to_event)
    ):
        if f["event"] is None:
            continue
        for team_id, opp_id, is_home, difficulty in (
            (f["team_h"], f["team_a"], True, f["team_h_difficulty"]),
            (f["team_a"], f["team_h"], False, f["team_a_difficulty"]),
        ):
            if team_id not in grid:
                continue
            opp = indices.get(opp_id, {})
            venue = 1.09 if is_home else 0.91
            grid[team_id].setdefault(int(f["event"]), []).append(
                {
                    "opponent": team_rows.get(opp_id, {}).get("short_name"),
                    "opponent_id": opp_id,
                    "opponent_code": team_rows.get(opp_id, {}).get("code"),
                    "is_home": is_home,
                    "difficulty": difficulty,
                    # >1 means easier than average to attack into.
                    "attack_index": round(opp.get("defence_index", 1.0) * venue, 3),
                    # >1 means the opponent's attack is stronger than average.
                    "defence_index": round(opp.get("attack_index", 1.0) / venue, 3),
                    "kickoff": f["kickoff_time"],
                }
            )

    teams_out = []
    for tid, cells in grid.items():
        t = team_rows[tid]
        flat = [c for cell in cells.values() for c in cell]
        attack_scores = [c["attack_index"] for c in flat]
        defence_scores = [c["defence_index"] for c in flat]
        teams_out.append(
            {
                "team_id": tid,
                "short_name": t["short_name"],
                "name": t["name"],
                "code": t["code"],
                "primary_hex": t["primary_hex"],
                "cells": [
                    {"event": ev, "fixtures": cells.get(ev, [])} for ev in range(from_event, to_event + 1)
                ],
                "attack_score": round(sum(attack_scores) / len(attack_scores), 3) if attack_scores else None,
                "defence_score": round(sum(defence_scores) / len(defence_scores), 3) if defence_scores else None,
                "fixture_count": len(flat),
                "blanks": [ev for ev in range(from_event, to_event + 1) if not cells.get(ev)],
                "doubles": [ev for ev, c in cells.items() if len(c) > 1],
            }
        )
    teams_out.sort(key=lambda t: -(t["attack_score"] or 0))
    return {
        "from_event": from_event,
        "to_event": to_event,
        "league_goals_per_match": league_goals,
        "teams": teams_out,
    }


def _team_indices(conn: sqlite3.Connection) -> dict[int, dict[str, float]]:
    run = active_run(conn)
    assumptions = (run or {}).get("assumptions") or {}
    team_model = assumptions.get("team_model") or {}
    # The run stores only the summary; recompute the per-team indices from the
    # stored strengths so this stays a cheap read.
    out: dict[int, dict[str, float]] = {}
    for r in conn.execute(
        "SELECT id, strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away FROM teams"
    ):
        att_band = _mean(r["strength_attack_home"], r["strength_attack_away"])
        def_band = _mean(r["strength_defence_home"], r["strength_defence_away"])
        # Invert the band mapping used when the strengths were written.
        out[r["id"]] = {
            "attack_index": round(0.6 + 0.8 * ((att_band - 1.0) / 4.0), 4) if att_band else 1.0,
            "defence_index": round(0.6 + 0.8 * (1.0 - (def_band - 1.0) / 4.0), 4) if def_band else 1.0,
        }
    if team_model.get("league_goals_per_match") is None:
        return out
    return out


def _mean(*values: Any) -> float | None:
    nums = [float(v) for v in values if v is not None]
    return sum(nums) / len(nums) if nums else None


# -----------------------------------------------------------------------------
# players
# -----------------------------------------------------------------------------
PLAYER_SELECT = """
SELECT p.*, t.short_name AS team, t.name AS team_name, t.code AS team_code_ref,
       t.primary_hex, t.secondary_hex, t.badge_url,
       s.season, s.minutes, s.starts, s.goals_scored, s.assists, s.clean_sheets,
       s.bonus, s.bps, s.saves, s.goals_conceded, s.yellow_cards, s.red_cards,
       s.expected_goals, s.expected_assists, s.expected_goal_involvements,
       s.expected_goals_conceded, s.xg90, s.xa90, s.xgi90, s.xgc90, s.defcon90,
       s.bps90, s.pts90, s.ict_index, s.threat, s.creativity, s.influence,
       s.total_points AS season_points, s.defensive_contribution,
       ao.start_probability AS override_p_start, ao.injury_status AS override_status,
       ao.rationale AS override_rationale
FROM players p
JOIN teams t ON t.id = p.team_id
LEFT JOIN player_season_stats s ON s.player_id = p.id
LEFT JOIN availability_overrides ao ON ao.player_id = p.id
"""


def _prediction_map(
    conn: sqlite3.Connection, run_id: str, model_id: str, event: int, player_ids: Sequence[int] | None = None
) -> dict[int, dict[str, Any]]:
    sql = "SELECT * FROM predictions WHERE run_id=? AND model_id=? AND event_id=?"
    params: list[Any] = [run_id, model_id, event]
    if player_ids:
        sql += f" AND player_id IN ({','.join('?' * len(player_ids))})"
        params.extend(player_ids)
    return {r["player_id"]: dict(r) for r in conn.execute(sql, params)}


def _horizon_map(
    conn: sqlite3.Connection, run_id: str, model_id: str, from_event: int, to_event: int
) -> dict[int, list[dict[str, Any]]]:
    out: dict[int, list[dict[str, Any]]] = {}
    for r in conn.execute(
        """SELECT pr.player_id, pr.event_id, pr.xp_mean, pr.difficulty, pr.was_home,
                  pr.opponent_id, t.short_name AS opponent
           FROM predictions pr
           LEFT JOIN teams t ON t.id = pr.opponent_id
           WHERE pr.run_id=? AND pr.model_id=? AND pr.event_id BETWEEN ? AND ?
           ORDER BY pr.player_id, pr.event_id""",
        (run_id, model_id, from_event, to_event),
    ):
        out.setdefault(r["player_id"], []).append(
            {
                "event": r["event_id"],
                "xp": r["xp_mean"],
                "opponent": r["opponent"],
                "is_home": bool(r["was_home"]) if r["was_home"] is not None else None,
                "difficulty": r["difficulty"],
            }
        )
    return out


def serialise_prediction(row: dict[str, Any] | None, opponent_name: str | None, kickoff: str | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "model_id": row["model_id"],
        "event": row["event_id"],
        "xp": row["xp_mean"],
        "p10": row["xp_p10"],
        "p25": row["xp_p25"],
        "p50": row["xp_p50"],
        "p75": row["xp_p75"],
        "p90": row["xp_p90"],
        "std": row["xp_std"],
        "p_appear": row["p_appear"],
        "p_start": row["p_start"],
        "exp_minutes": row["exp_minutes"],
        "exp_goals": row["exp_goals"],
        "exp_assists": row["exp_assists"],
        "p_clean_sheet": row["p_clean_sheet"],
        "p_goal": row["p_goal"],
        "p_assist": row["p_assist"],
        "p_return": row["p_return"],
        "p_haul": row["p_haul"],
        "p_blank": row["p_blank"],
        "exp_bonus": row["exp_bonus"],
        "exp_saves": row["exp_saves"],
        "exp_defcon": row["exp_defcon"],
        "components": {
            "appearance": row["pts_appearance"],
            "goals": row["pts_goals"],
            "assists": row["pts_assists"],
            "clean_sheet": row["pts_clean_sheet"],
            "saves": row["pts_saves"],
            "defcon": row["pts_defcon"],
            "bonus": row["pts_bonus"],
            "negative": row["pts_negative"],
        },
        "fixture": {
            "opponent": opponent_name,
            "opponent_id": row["opponent_id"],
            "is_home": bool(row["was_home"]) if row["was_home"] is not None else None,
            "difficulty": row["difficulty"],
            "kickoff": kickoff,
            "count": 1 if row["opponent_id"] is not None else 0,
        },
    }


def serialise_player(
    row: dict[str, Any],
    prediction: dict[str, Any] | None,
    horizon_rows: list[dict[str, Any]] | None,
    team_names: dict[int, str],
    kickoffs: dict[int, str | None],
) -> dict[str, Any]:
    position = POSITIONS.get(row["element_type"], "?")
    price = row["now_cost"] / 10.0
    season = None
    if row.get("season"):
        season = {
            "season": row["season"],
            "minutes": row["minutes"],
            "starts": row["starts"],
            "goals": row["goals_scored"],
            "assists": row["assists"],
            "clean_sheets": row["clean_sheets"],
            "bonus": row["bonus"],
            "bps": row["bps"],
            "saves": row["saves"],
            "goals_conceded": row["goals_conceded"],
            "yellow_cards": row["yellow_cards"],
            "red_cards": row["red_cards"],
            "total_points": row["season_points"],
            "xg": row["expected_goals"],
            "xa": row["expected_assists"],
            "xgi": row["expected_goal_involvements"],
            "xgc": row["expected_goals_conceded"],
            "xg90": row["xg90"],
            "xa90": row["xa90"],
            "xgi90": row["xgi90"],
            "xgc90": row["xgc90"],
            "defcon90": row["defcon90"],
            "defensive_contribution": row["defensive_contribution"],
            "bps90": row["bps90"],
            "pts90": row["pts90"],
            "ict_index": row["ict_index"],
            "threat": row["threat"],
            "creativity": row["creativity"],
            "influence": row["influence"],
        }

    horizon = None
    if horizon_rows:
        horizon = {
            "from_event": horizon_rows[0]["event"],
            "to_event": horizon_rows[-1]["event"],
            "xp_total": round(sum(h["xp"] for h in horizon_rows), 3),
            "per_event": horizon_rows,
        }

    override = row.get("override_p_start")
    if override is not None:
        avail_source = "news_agent"
        p_start_avail = override
    elif row.get("chance_of_playing_next_round") is not None:
        avail_source = "fpl"
        p_start_avail = row["chance_of_playing_next_round"] / 100.0
    else:
        avail_source = "fpl" if row.get("status") else "none"
        p_start_avail = None

    xp = prediction["xp"] if prediction else None
    return {
        "id": row["id"],
        "code": row["code"],
        "web_name": row["web_name"],
        "full_name": f"{row['first_name']} {row['second_name']}".strip(),
        "team_id": row["team_id"],
        "team": row["team"],
        "team_name": row["team_name"],
        "team_code": row["team_code_ref"],
        "team_primary_hex": row["primary_hex"],
        "team_secondary_hex": row["secondary_hex"],
        "position": position,
        "element_type": row["element_type"],
        "price": round(price, 1),
        "price_change_start": (row["cost_change_start"] or 0) / 10.0,
        "photo": photo_block(row["code"]),
        "status": row["status"],
        "news": row["news"] or None,
        "news_added": row["news_added"],
        "chance_of_playing": row["chance_of_playing_next_round"],
        "availability": {
            "p_start": p_start_avail,
            "source": avail_source,
            "injury_status": row.get("override_status"),
            "rationale": row.get("override_rationale"),
        },
        "ownership": row["selected_by_percent"],
        "form": row["form"],
        "points_per_game": row["points_per_game"],
        "total_points": row["season_points"],
        "ep_next": row["ep_next"],
        "season": season,
        "set_pieces": {
            "penalties": row["penalties_order"],
            "corners": row["corners_order"],
            "freekicks": row["direct_fk_order"],
        },
        "prediction": prediction,
        "horizon": horizon,
        "value_per_million": round(xp / price, 4) if xp and price else None,
        "dreamteam_count": row["dreamteam_count"],
        "transfers_in_event": row["transfers_in_event"],
        "transfers_out_event": row["transfers_out_event"],
    }


SORT_KEYS = {
    "xp": lambda p: -(p["prediction"]["xp"] if p["prediction"] else -1),
    "xp_horizon": lambda p: -(p["horizon"]["xp_total"] if p["horizon"] else -1),
    "value": lambda p: -(p["value_per_million"] or -1),
    "price": lambda p: -p["price"],
    "ownership": lambda p: -(p["ownership"] or 0),
    "form": lambda p: -(p["form"] or 0),
    "xgi90": lambda p: -((p["season"] or {}).get("xgi90") or 0),
    "minutes": lambda p: -((p["season"] or {}).get("minutes") or 0),
    "points": lambda p: -(p["total_points"] or 0),
    "name": lambda p: p["web_name"].lower(),
}


def list_players(
    conn: sqlite3.Connection,
    *,
    model: str = "ensemble",
    event: int | None = None,
    horizon: int | None = None,
    position: str | None = None,
    team: int | None = None,
    max_cost: float | None = None,
    min_minutes: int | None = None,
    search: str | None = None,
    sort: str = "xp",
    order: str = "desc",
    limit: int = 750,
    offset: int = 0,
    only_available: bool = False,
) -> dict[str, Any]:
    run = require_run(conn)
    event = int(event or run["target_event"])
    horizon = int(horizon or run["horizon"])
    to_event = event + horizon - 1

    season = _season_label(conn, run)
    sql = PLAYER_SELECT + " WHERE (s.season = ? OR s.season IS NULL)"
    params: list[Any] = [season]
    if position:
        wanted = [k for k, v in POSITIONS.items() if v == position.upper()]
        if wanted:
            sql += " AND p.element_type = ?"
            params.append(wanted[0])
    if team:
        sql += " AND p.team_id = ?"
        params.append(team)
    if max_cost is not None:
        sql += " AND p.now_cost <= ?"
        params.append(int(round(max_cost * 10)))
    if min_minutes is not None:
        sql += " AND COALESCE(s.minutes, 0) >= ?"
        params.append(min_minutes)
    if search:
        sql += " AND (LOWER(p.web_name) LIKE ? OR LOWER(p.first_name || ' ' || p.second_name) LIKE ?)"
        needle = f"%{search.lower()}%"
        params.extend([needle, needle])
    if only_available:
        sql += " AND p.status = 'a'"

    rows = [dict(r) for r in conn.execute(sql, params)]
    predictions = _prediction_map(conn, run["run_id"], model, event)
    horizons = _horizon_map(conn, run["run_id"], model, event, to_event)
    team_names = {r["id"]: r["short_name"] for r in conn.execute("SELECT id, short_name FROM teams")}
    kickoffs = _event_kickoffs(conn, event)

    out = []
    for row in rows:
        pred_row = predictions.get(row["id"])
        pred = serialise_prediction(
            pred_row,
            team_names.get(pred_row["opponent_id"]) if pred_row else None,
            kickoffs.get(pred_row["fixture_id"]) if pred_row else None,
        )
        out.append(serialise_player(row, pred, horizons.get(row["id"]), team_names, kickoffs))

    key = SORT_KEYS.get(sort, SORT_KEYS["xp"])
    out.sort(key=key)
    if order == "asc":
        out.reverse()
    total = len(out)
    return {
        "run": run,
        "event": event,
        "horizon": horizon,
        "model": model,
        "total": total,
        "players": out[offset : offset + limit],
    }


def _season_label(conn: sqlite3.Connection, run: dict[str, Any]) -> str:
    if run.get("season"):
        return str(run["season"])
    row = conn.execute(
        "SELECT season, SUM(minutes) AS m FROM player_season_stats GROUP BY season ORDER BY m DESC LIMIT 1"
    ).fetchone()
    return row["season"] if row else ""


def _event_kickoffs(conn: sqlite3.Connection, event: int) -> dict[int, str | None]:
    return {
        r["id"]: r["kickoff_time"]
        for r in conn.execute("SELECT id, kickoff_time FROM fixtures WHERE event = ?", (event,))
    }


def player_detail(
    conn: sqlite3.Connection, player_id: int, *, model: str = "ensemble", event: int | None = None, horizon: int | None = None
) -> dict[str, Any] | None:
    run = require_run(conn)
    event = int(event or run["target_event"])
    horizon = int(horizon or run["horizon"])
    to_event = event + horizon - 1
    season = _season_label(conn, run)

    row = conn.execute(PLAYER_SELECT + " WHERE p.id = ? AND (s.season = ? OR s.season IS NULL)", (player_id, season)).fetchone()
    if row is None:
        return None
    row = dict(row)

    team_names = {r["id"]: r["short_name"] for r in conn.execute("SELECT id, short_name FROM teams")}
    kickoffs = _event_kickoffs(conn, event)
    pred_row = _prediction_map(conn, run["run_id"], model, event, [player_id]).get(player_id)
    pred = serialise_prediction(
        pred_row,
        team_names.get(pred_row["opponent_id"]) if pred_row else None,
        kickoffs.get(pred_row["fixture_id"]) if pred_row else None,
    )
    horizons = _horizon_map(conn, run["run_id"], model, event, to_event).get(player_id)
    base = serialise_player(row, pred, horizons, team_names, kickoffs)

    pmf = _load_json(pred_row.get("pmf_json")) if pred_row else None
    explain = None
    lgbm_row = _prediction_map(conn, run["run_id"], "lgbm", event, [player_id]).get(player_id)
    if lgbm_row:
        explain = _load_json(lgbm_row.get("explain_json"))

    model_spread = []
    for r in conn.execute(
        """SELECT pr.model_id, pr.xp_mean, m.name FROM predictions pr
           LEFT JOIN model_registry m ON m.model_id = pr.model_id
           WHERE pr.run_id=? AND pr.player_id=? AND pr.event_id=?""",
        (run["run_id"], player_id, event),
    ):
        model_spread.append({"model_id": r["model_id"], "name": r["name"] or r["model_id"], "xp": r["xp_mean"]})

    fixture_rows = []
    for r in conn.execute(
        """SELECT f.event, f.kickoff_time, f.team_h, f.team_a, f.team_h_difficulty, f.team_a_difficulty
           FROM fixtures f WHERE (f.team_h = ? OR f.team_a = ?) AND f.event IS NOT NULL
           ORDER BY f.event LIMIT 12""",
        (row["team_id"], row["team_id"]),
    ):
        is_home = r["team_h"] == row["team_id"]
        opp_id = r["team_a"] if is_home else r["team_h"]
        xp = next((h["xp"] for h in (horizons or []) if h["event"] == r["event"]), None)
        fixture_rows.append(
            {
                "event": r["event"],
                "opponent": team_names.get(opp_id),
                "opponent_id": opp_id,
                "is_home": is_home,
                "difficulty": r["team_h_difficulty"] if is_home else r["team_a_difficulty"],
                "kickoff": r["kickoff_time"],
                "xp": xp,
            }
        )

    fbref = conn.execute(
        "SELECT * FROM fbref_player_stats WHERE player_id = ? ORDER BY captured_at DESC LIMIT 1", (player_id,)
    ).fetchone()

    odds = [
        {
            "market": r["market"],
            "selection": r["selection"],
            "price": r["price_decimal"],
            "implied_prob": r["implied_prob"],
            "provider": r["provider"],
            "devigged": bool(r["devigged"]),
            "captured_at": r["captured_at"],
        }
        for r in conn.execute(
            "SELECT * FROM odds_markets WHERE player_id = ? ORDER BY captured_at DESC LIMIT 20", (player_id,)
        )
    ]

    news = [
        {
            "source": r["source"],
            "author": r["author"],
            "published_at": r["published_at"],
            "text": r["text"],
            "url": r["url"],
        }
        for r in conn.execute(
            """SELECT n.* FROM news_items n JOIN news_player_links l ON l.news_id = n.id
               WHERE l.player_id = ? ORDER BY COALESCE(n.published_at, n.captured_at) DESC LIMIT 20""",
            (player_id,),
        )
    ]

    history = [
        {
            "event": r["event_id"],
            "minutes": r["minutes"],
            "total_points": r["total_points"],
            "opponent": team_names.get(r["opponent_team"]),
            "was_home": bool(r["was_home"]) if r["was_home"] is not None else None,
            "xg": r["expected_goals"],
            "xa": r["expected_assists"],
            "bps": r["bps"],
        }
        for r in conn.execute(
            "SELECT * FROM element_gameweeks WHERE player_id = ? ORDER BY event_id", (player_id,)
        )
    ]

    base.update(
        {
            "pmf": pmf,
            "explain": explain,
            "model_spread": model_spread,
            "fixtures": fixture_rows,
            "fbref": {k: v for k, v in dict(fbref).items() if isinstance(v, (int, float)) and k != "player_id"}
            if fbref
            else None,
            "odds": odds,
            "news_reports": news,
            "gameweek_history": history,
        }
    )
    return base


# -----------------------------------------------------------------------------
# model lab
# -----------------------------------------------------------------------------
def leaderboard(conn: sqlite3.Connection) -> dict[str, Any]:
    run = require_run(conn)
    registry = {r["model_id"]: dict(r) for r in conn.execute("SELECT * FROM model_registry")}
    metrics: dict[str, dict[str, float]] = {}
    for r in conn.execute("SELECT * FROM model_metrics WHERE run_id = ?", (run["run_id"],)):
        metrics.setdefault(r["model_id"], {})[r["metric"]] = r["value"]

    models = []
    for model_id, info in registry.items():
        ms = metrics.get(model_id, {})
        models.append(
            {
                "model_id": model_id,
                "name": info["name"],
                "family": info["family"],
                "description": info["description"],
                "hue": info["hue"],
                "metrics": ms,
                "available": bool(ms),
                "unavailable_reason": None if ms else _unavailable_reason(model_id, run),
                "stack_weight": (run.get("stack_weights") or {}).get(model_id),
            }
        )
    models.sort(key=lambda m: (-(m["metrics"].get("spearman") or -9), m["name"]))

    calibration: dict[str, list[dict[str, Any]]] = {}
    for r in conn.execute(
        "SELECT * FROM calibration_bins WHERE run_id = ? ORDER BY model_id, bin_index", (run["run_id"],)
    ):
        calibration.setdefault(r["model_id"], []).append(
            {"pred_mean": r["pred_mean"], "actual_mean": r["actual_mean"], "n": r["n"],
             "pred_lo": r["pred_lo"], "pred_hi": r["pred_hi"]}
        )

    importance: dict[str, list[dict[str, Any]]] = {}
    for r in conn.execute(
        "SELECT * FROM feature_importance WHERE run_id = ? ORDER BY gain DESC", (run["run_id"],)
    ):
        importance.setdefault(r["model_id"], []).append(
            {"feature": r["feature"], "gain": r["gain"], "split": r["split"]}
        )

    return {
        "run": run,
        "evaluation": run.get("evaluation") or {},
        "models": models,
        "calibration": [{"model_id": k, "bins": v} for k, v in calibration.items()],
        "importance": [{"model_id": k, "features": v} for k, v in importance.items()],
        "disagreement": disagreement(conn, run),
        "assumptions": run.get("assumptions") or {},
        "gbm": run.get("gbm") or {},
    }


def _unavailable_reason(model_id: str, run: dict[str, Any]) -> str:
    if model_id == "form_baseline":
        return (
            "the game's rolling form figure is zero for every player outside a live "
            "season, so it carries no information to score"
        )
    if model_id == "lgbm_quantile" and not (run.get("gbm") or {}).get("fitted"):
        return (run.get("gbm") or {}).get("reason") or "not fitted in this run"
    return "no measured metrics in this run"


def disagreement(conn: sqlite3.Connection, run: dict[str, Any], limit: int = 40) -> list[dict[str, Any]]:
    event = run["target_event"]
    by_player: dict[int, dict[str, float]] = {}
    for r in conn.execute(
        "SELECT player_id, model_id, xp_mean FROM predictions WHERE run_id=? AND event_id=?",
        (run["run_id"], event),
    ):
        by_player.setdefault(r["player_id"], {})[r["model_id"]] = r["xp_mean"]
    names = {
        r["id"]: (r["web_name"], r["team"], POSITIONS.get(r["element_type"], "?"), r["code"])
        for r in conn.execute(
            "SELECT p.id, p.web_name, p.code, p.element_type, t.short_name AS team "
            "FROM players p JOIN teams t ON t.id = p.team_id"
        )
    }
    rows = []
    for pid, values in by_player.items():
        if len(values) < 2:
            continue
        spread = max(values.values()) - min(values.values())
        name = names.get(pid)
        rows.append(
            {
                "player_id": pid,
                "web_name": name[0] if name else str(pid),
                "team": name[1] if name else None,
                "position": name[2] if name else None,
                "code": name[3] if name else None,
                "spread": round(spread, 4),
                "by_model": {k: round(v, 4) for k, v in values.items()},
            }
        )
    rows.sort(key=lambda r: -r["spread"])
    return rows[:limit]


# -----------------------------------------------------------------------------
# derived views
# -----------------------------------------------------------------------------
def captaincy(conn: sqlite3.Connection, *, model: str = "ensemble", event: int | None = None, limit: int = 30) -> dict[str, Any]:
    run = require_run(conn)
    event = int(event or run["target_event"])
    payload = list_players(conn, model=model, event=event, limit=2000)
    rows = []
    for p in payload["players"]:
        pred = p["prediction"]
        if not pred or not pred["xp"]:
            continue
        ceiling = pred["p90"]
        floor = pred["p10"]
        # A captaincy decision is a bet on the ceiling: the armband doubles the
        # upside as well as the mean, so rank on mean while showing the spread
        # and a downside-penalised score.
        risk_adjusted = round(pred["xp"] - 0.5 * (pred["xp"] - floor), 3)
        rows.append(
            {
                **{k: p[k] for k in ("id", "code", "web_name", "team", "team_id", "position", "price", "photo", "ownership", "status", "news")},
                "xp": pred["xp"],
                "captain_xp": round(pred["xp"] * 2, 3),
                "p_haul": pred["p_haul"],
                "p_blank": pred["p_blank"],
                "p_return": pred["p_return"],
                "ceiling": ceiling,
                "floor": floor,
                "std": pred["std"],
                "risk_adjusted": risk_adjusted,
                "exp_minutes": pred["exp_minutes"],
                "opponent": pred["fixture"]["opponent"],
                "is_home": pred["fixture"]["is_home"],
                "difficulty": pred["fixture"]["difficulty"],
                # Effective ownership needs captaincy counts, which the game only
                # publishes once a gameweek is under way.
                "effective_ownership": None,
            }
        )
    rows.sort(key=lambda r: -r["xp"])
    return {
        "run": run,
        "event": event,
        "model": model,
        "note": (
            "Effective ownership is not shown because the game publishes captaincy "
            "counts only once a gameweek has started."
        ),
        "candidates": rows[:limit],
    }


def differentials(
    conn: sqlite3.Connection, *, model: str = "ensemble", event: int | None = None,
    max_ownership: float = 8.0, min_xp: float = 2.0, limit: int = 40
) -> dict[str, Any]:
    run = require_run(conn)
    event = int(event or run["target_event"])
    payload = list_players(conn, model=model, event=event, limit=2000)
    rows = []
    for p in payload["players"]:
        pred = p["prediction"]
        if not pred or (p["ownership"] or 0) > max_ownership or pred["xp"] < min_xp:
            continue
        rows.append(
            {
                **{k: p[k] for k in ("id", "code", "web_name", "team", "team_id", "position", "price", "photo", "ownership", "status", "season")},
                "xp": pred["xp"],
                "xp_horizon": p["horizon"]["xp_total"] if p["horizon"] else None,
                "p_haul": pred["p_haul"],
                "value_per_million": p["value_per_million"],
                "opponent": pred["fixture"]["opponent"],
                "is_home": pred["fixture"]["is_home"],
            }
        )
    rows.sort(key=lambda r: -(r["xp_horizon"] or r["xp"]))
    return {
        "run": run, "event": event, "model": model,
        "max_ownership": max_ownership, "min_xp": min_xp,
        "players": rows[:limit],
    }


def chips(conn: sqlite3.Connection, *, model: str = "ensemble") -> dict[str, Any]:
    run = require_run(conn)
    windows = [dict(r) for r in conn.execute("SELECT * FROM chips ORDER BY start_event, id")]
    # Squad-wide xP per gameweek, and how lumpy the fixture calendar is, are what
    # actually drive chip timing.
    per_event = []
    for r in conn.execute(
        """SELECT event_id,
                  COUNT(*) AS n,
                  AVG(xp_mean) AS mean_xp,
                  SUM(CASE WHEN xp_mean > 4 THEN 1 ELSE 0 END) AS strong
           FROM predictions WHERE run_id=? AND model_id=? GROUP BY event_id ORDER BY event_id""",
        (run["run_id"], model),
    ):
        per_event.append(
            {"event": r["event_id"], "mean_xp": round(r["mean_xp"] or 0, 4), "players": r["n"], "strong_options": r["strong"]}
        )

    fixture_shape = []
    for r in conn.execute(
        """SELECT event, COUNT(*) AS fixtures FROM fixtures WHERE event IS NOT NULL
           GROUP BY event ORDER BY event"""
    ):
        fixture_shape.append({"event": r["event"], "fixtures": r["fixtures"]})

    blanks = [f["event"] for f in fixture_shape if f["fixtures"] < 10]
    doubles = [f["event"] for f in fixture_shape if f["fixtures"] > 10]

    return {
        "run": run,
        "windows": windows,
        "per_event": per_event,
        "fixture_shape": fixture_shape,
        "blank_gameweeks": blanks,
        "double_gameweeks": doubles,
        "note": (
            "Chip timing is shown against the published fixture calendar and the "
            "model's per-gameweek outlook. Blank and double gameweeks are only "
            "known once the FA Cup and European calendars force rescheduling, so "
            "this reflects the schedule as it currently stands."
        ),
    }


def news_feed(conn: sqlite3.Connection, limit: int = 100) -> dict[str, Any]:
    items = []
    for r in conn.execute(
        """SELECT n.*, GROUP_CONCAT(l.player_id) AS player_ids FROM news_items n
           LEFT JOIN news_player_links l ON l.news_id = n.id
           GROUP BY n.id ORDER BY COALESCE(n.published_at, n.captured_at) DESC LIMIT ?""",
        (limit,),
    ):
        row = dict(r)
        ids = [int(x) for x in (row.pop("player_ids") or "").split(",") if x]
        items.append({**row, "player_ids": ids})

    overrides = []
    for r in conn.execute(
        """SELECT ao.*, p.web_name, p.code, t.short_name AS team FROM availability_overrides ao
           JOIN players p ON p.id = ao.player_id JOIN teams t ON t.id = p.team_id
           ORDER BY ao.created_at DESC LIMIT ?""",
        (limit,),
    ):
        overrides.append(dict(r))

    flagged = []
    for r in conn.execute(
        """SELECT p.id, p.code, p.web_name, p.status, p.news, p.news_added,
                  p.chance_of_playing_next_round, t.short_name AS team
           FROM players p JOIN teams t ON t.id = p.team_id
           WHERE p.news IS NOT NULL AND p.news <> '' ORDER BY p.news_added DESC LIMIT ?""",
        (limit,),
    ):
        flagged.append(dict(r))

    return {"items": items, "overrides": overrides, "official_flags": flagged}


def odds_view(conn: sqlite3.Connection, event: int | None = None, limit: int = 500) -> dict[str, Any]:
    sql = "SELECT * FROM odds_markets"
    params: list[Any] = []
    if event is not None:
        sql += " WHERE event_id = ?"
        params.append(event)
    sql += " ORDER BY captured_at DESC LIMIT ?"
    params.append(limit)
    rows = [dict(r) for r in conn.execute(sql, params)]
    return {
        "markets": rows,
        "configured": bool(config.ODDS_API_KEY),
        "requires": ["ODDS_API_KEY"],
        "note": (
            "Bookmaker prices are ingested as priors for clean-sheet and goalscorer "
            "probabilities. With no key configured nothing is stored and nothing is "
            "estimated in their place."
        ),
    }


# -----------------------------------------------------------------------------
# helpers
# -----------------------------------------------------------------------------
def _count(conn: sqlite3.Connection, table: str) -> int:
    try:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        return 0


def _load_json(value: Any) -> Any:
    if value in (None, ""):
        return None
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return None


def candidates_for_solver(
    conn: sqlite3.Connection, run_id: str, model: str, events: Iterable[int]
) -> list[dict[str, Any]]:
    events = list(events)
    rows = conn.execute(
        f"""SELECT pr.player_id, pr.event_id, pr.xp_mean, p.element_type, p.team_id, p.now_cost
            FROM predictions pr JOIN players p ON p.id = pr.player_id
            WHERE pr.run_id = ? AND pr.model_id = ? AND pr.event_id IN ({','.join('?' * len(events))})""",
        [run_id, model, *events],
    ).fetchall()
    by_player: dict[int, dict[str, Any]] = {}
    for r in rows:
        entry = by_player.setdefault(
            r["player_id"],
            {
                "player_id": r["player_id"],
                "position": POSITIONS[r["element_type"]],
                "team_id": r["team_id"],
                "price": r["now_cost"] / 10.0,
                "xp_by_event": {},
            },
        )
        entry["xp_by_event"][r["event_id"]] = r["xp_mean"]
    return list(by_player.values())
