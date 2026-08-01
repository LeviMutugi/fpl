"""Bookmaker odds ingestion (the-odds-api).

Market prices are the single strongest external signal available for the two
quantities the structural model is least able to pin down from historical data:
whether a team keeps a clean sheet, and whether a given player scores. A closing
price from a sharp book aggregates far more information than a season of xG.

Prices are stored as probabilities only after removing the bookmaker's margin.
For a complete market the implied probabilities are renormalised to sum to one
(`devigged = 1`); when only part of the book is returned the raw reciprocal is
stored with `devigged = 0`, so a consumer can tell the difference rather than
silently treating an over-round price as a probability.

Requires ODDS_API_KEY. With no key the adapter stores nothing and reports
`unconfigured` — it never substitutes an estimate.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from ..app import config
from ..app import db as dbm
from . import matching
from .fpl import log_finish, log_start, store_snapshot
from .http import SourceError, SourceUnreachable, fetch_json

# Markets we know how to interpret. `h2h` and `totals` are always available on
# the free tier; the player and clean-sheet markets need a paid plan and are
# requested only if the account exposes them.
CORE_MARKETS = ("h2h", "totals")
EXTRA_MARKETS = ("player_goal_scorer_anytime", "team_totals")

# Fixtures are matched to the FPL calendar by team plus kick-off proximity;
# bookmakers and the FPL API occasionally disagree on kick-off by a few hours,
# and a fixture is never guessed outside this window.
KICKOFF_TOLERANCE = timedelta(hours=36)


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _fixture_index(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, event, team_h, team_a, kickoff_time FROM fixtures WHERE event IS NOT NULL"
    ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "event": r["event"],
                "team_h": r["team_h"],
                "team_a": r["team_a"],
                "kickoff": _parse_time(r["kickoff_time"]),
            }
        )
    return out


def match_fixture(
    conn: sqlite3.Connection,
    fixtures: list[dict[str, Any]],
    home_name: str,
    away_name: str,
    commence: datetime | None,
) -> dict[str, Any] | None:
    home_id, home_conf = matching.match_team(conn, home_name)
    away_id, away_conf = matching.match_team(conn, away_name)
    if home_id is None or away_id is None or min(home_conf, away_conf) < 0.8:
        return None
    for f in fixtures:
        if f["team_h"] != home_id or f["team_a"] != away_id:
            continue
        if commence and f["kickoff"] and abs(f["kickoff"] - commence) > KICKOFF_TOLERANCE:
            continue
        return f
    return None


def devig(prices: list[float]) -> list[float] | None:
    """Renormalise implied probabilities so the book sums to one."""
    if not prices or any(p <= 1.0 for p in prices):
        return None
    implied = [1.0 / p for p in prices]
    total = sum(implied)
    if total <= 0:
        return None
    return [round(v / total, 6) for v in implied]


def _clean_sheet_from_totals(outcomes: list[dict[str, Any]]) -> dict[str, float]:
    """Derive P(clean sheet) from a team-totals under-0.5 line where present."""
    out: dict[str, float] = {}
    for o in outcomes:
        if o.get("point") == 0.5 and str(o.get("name", "")).lower() == "under":
            price = o.get("price")
            desc = o.get("description")
            if price and desc:
                out[str(desc)] = round(1.0 / float(price), 6)
    return out


def _rows_from_event(
    conn: sqlite3.Connection,
    fixtures: list[dict[str, Any]],
    event_payload: dict[str, Any],
) -> tuple[list[dict[str, Any]], str | None]:
    commence = _parse_time(event_payload.get("commence_time"))
    fixture = match_fixture(
        conn, fixtures, event_payload.get("home_team", ""), event_payload.get("away_team", ""), commence
    )
    if fixture is None:
        return [], f"{event_payload.get('home_team')} v {event_payload.get('away_team')}"

    home_id, home_conf = matching.match_team(conn, event_payload.get("home_team"))
    away_id, _ = matching.match_team(conn, event_payload.get("away_team"))
    rows: list[dict[str, Any]] = []
    captured = datetime.now(timezone.utc).isoformat()

    for book in event_payload.get("bookmakers", []):
        provider = book.get("key") or "unknown"
        for market in book.get("markets", []):
            key = market.get("key")
            outcomes = market.get("outcomes") or []
            prices = [float(o["price"]) for o in outcomes if o.get("price")]
            devigged = devig(prices) if len(prices) == len(outcomes) and len(outcomes) > 1 else None

            for i, outcome in enumerate(outcomes):
                price = outcome.get("price")
                if not price:
                    continue
                selection = str(outcome.get("name", ""))
                description = outcome.get("description")
                player_id = None
                team_id = None
                if key == "player_goal_scorer_anytime" and description:
                    player_id, conf = matching.match_player(conn, str(description))
                    if conf < 0.8:
                        player_id = None
                elif key in ("h2h", "team_totals"):
                    matched, conf = matching.match_team(conn, description or selection)
                    team_id = matched if conf >= 0.8 else None
                    if team_id is None and selection.lower() == "draw":
                        team_id = None

                rows.append(
                    {
                        "provider": provider,
                        "aggregator": "the-odds-api",
                        "market": key,
                        "event_id": fixture["event"],
                        "fixture_id": fixture["id"],
                        "team_id": team_id,
                        "player_id": player_id,
                        "selection": description or selection,
                        "line": outcome.get("point"),
                        "price_decimal": float(price),
                        "implied_prob": devigged[i] if devigged else round(1.0 / float(price), 6),
                        "devigged": 1 if devigged else 0,
                        "commence_time": event_payload.get("commence_time"),
                        "captured_at": captured,
                    }
                )

            if key == "team_totals":
                for team_name, prob in _clean_sheet_from_totals(outcomes).items():
                    # A team-totals under-0.5 line is exactly "the opponent keeps
                    # a clean sheet", so it is stored under that name too.
                    scoring_team, conf = matching.match_team(conn, team_name)
                    if conf < 0.8 or scoring_team is None:
                        continue
                    keeper = away_id if scoring_team == home_id else home_id
                    rows.append(
                        {
                            "provider": provider,
                            "aggregator": "the-odds-api",
                            "market": "clean_sheet",
                            "event_id": fixture["event"],
                            "fixture_id": fixture["id"],
                            "team_id": keeper,
                            "player_id": None,
                            "selection": f"clean sheet: {team_name} fail to score",
                            "line": 0.5,
                            "price_decimal": round(1.0 / prob, 4) if prob else 0.0,
                            "implied_prob": prob,
                            "devigged": 0,
                            "commence_time": event_payload.get("commence_time"),
                            "captured_at": captured,
                        }
                    )
    _ = home_conf
    return rows, None


def ingest(conn: sqlite3.Connection, markets: Iterable[str] | None = None) -> dict[str, Any]:
    run = log_start(conn, "odds")
    if not config.ODDS_API_KEY:
        message = (
            "ODDS_API_KEY is not set. Create a key at the-odds-api.com and export it; "
            "until then no bookmaker prices are stored and none are estimated."
        )
        log_finish(conn, run, "unconfigured", 0, message)
        return {"source": "odds", "mode": "unconfigured", "rows": 0, "message": message}

    wanted = list(markets) if markets else list(CORE_MARKETS) + list(EXTRA_MARKETS)
    url = f"{config.ODDS_API_BASE}/sports/{config.ODDS_SPORT_KEY}/odds"
    params = {
        "apiKey": config.ODDS_API_KEY,
        "regions": config.ODDS_REGIONS,
        "bookmakers": config.ODDS_BOOKMAKERS,
        "markets": ",".join(wanted),
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    }

    try:
        fetched = fetch_json(url, params=params)
    except SourceError as exc:
        # A 422 usually means the plan does not expose one of the extra markets;
        # retry with the core markets before giving up.
        if "422" in str(exc) and set(wanted) != set(CORE_MARKETS):
            return ingest(conn, markets=CORE_MARKETS)
        log_finish(conn, run, "error", 0, str(exc))
        return {"source": "odds", "mode": "error", "rows": 0, "message": str(exc)}
    except SourceUnreachable as exc:
        log_finish(conn, run, "unreachable", 0, str(exc))
        return {"source": "odds", "mode": "unreachable", "rows": 0, "message": str(exc)}

    store_snapshot(conn, f"odds:{config.ODDS_SPORT_KEY}", fetched.payload, source="odds", sha=fetched.sha256)
    fixtures = _fixture_index(conn)
    rows: list[dict[str, Any]] = []
    unmatched: list[str] = []
    for event_payload in fetched.payload if isinstance(fetched.payload, list) else []:
        event_rows, miss = _rows_from_event(conn, fixtures, event_payload)
        rows.extend(event_rows)
        if miss:
            unmatched.append(miss)

    written = dbm.executemany(
        conn,
        """INSERT INTO odds_markets
           (provider, aggregator, market, event_id, fixture_id, team_id, player_id, selection,
            line, price_decimal, implied_prob, devigged, commence_time, captured_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            (
                r["provider"], r["aggregator"], r["market"], r["event_id"], r["fixture_id"],
                r["team_id"], r["player_id"], r["selection"], r["line"], r["price_decimal"],
                r["implied_prob"], r["devigged"], r["commence_time"], r["captured_at"],
            )
            for r in rows
        ],
    )
    conn.commit()

    message = f"{written} prices from {config.ODDS_BOOKMAKERS} across markets {','.join(wanted)}"
    if unmatched:
        message += f"; {len(unmatched)} bookmaker fixtures had no FPL match and were skipped"
    status = "ok" if written else "partial"
    log_finish(conn, run, status, written, message)
    return {"source": "odds", "mode": "live", "rows": written, "message": message}


def derive_priors(conn: sqlite3.Connection, event_id: int) -> dict[str, Any]:
    """Market-implied priors in the shape the points model would consume.

    Returns empty structures when no odds have been ingested, so a caller can
    tell "the market says nothing" apart from "the market says zero".
    """
    clean_sheet: dict[int, float] = {}
    for r in conn.execute(
        """SELECT team_id, AVG(implied_prob) AS p FROM odds_markets
           WHERE market='clean_sheet' AND event_id=? AND team_id IS NOT NULL
           GROUP BY team_id""",
        (event_id,),
    ):
        clean_sheet[int(r["team_id"])] = round(float(r["p"]), 5)

    anytime_scorer: dict[int, float] = {}
    for r in conn.execute(
        """SELECT player_id, AVG(implied_prob) AS p FROM odds_markets
           WHERE market='player_goal_scorer_anytime' AND event_id=? AND player_id IS NOT NULL
           GROUP BY player_id""",
        (event_id,),
    ):
        anytime_scorer[int(r["player_id"])] = round(float(r["p"]), 5)

    return {
        "event": event_id,
        "clean_sheet": clean_sheet,
        "anytime_scorer": anytime_scorer,
        "available": bool(clean_sheet or anytime_scorer),
    }
