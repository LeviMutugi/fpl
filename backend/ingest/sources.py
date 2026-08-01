"""Source registry.

One description per ingest source, assembled from the database rather than
declared, so the Data Sources page shows what actually happened rather than what
is supposed to happen. `configured` reports only whether the required
environment variables are present — never their values.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Callable

from ..app import config

SOURCES: list[dict[str, Any]] = [
    {
        "source": "fpl_bootstrap",
        "label": "FPL bootstrap-static",
        "purpose": (
            "Players, teams, gameweeks, prices, ownership, availability flags and "
            "the official scoring rules. Everything else is built on this."
        ),
        "requires": [],
        "table": "players",
        "docs_url": "https://fantasy.premierleague.com/api/bootstrap-static/",
    },
    {
        "source": "fpl_fixtures",
        "label": "FPL fixtures",
        "purpose": (
            "The full 38-gameweek calendar with the game's own difficulty ratings. "
            "Drives fixture adjustment, the difficulty grid, and blank/double detection."
        ),
        "requires": [],
        "table": "fixtures",
        "docs_url": "https://fantasy.premierleague.com/api/fixtures/",
    },
    {
        "source": "fpl_history",
        "label": "FPL per-gameweek history",
        "purpose": (
            "Match-by-match player returns. Without it the models fall back to season "
            "aggregates, and CRPS and per-gameweek calibration are unavailable."
        ),
        "requires": [],
        "table": "element_gameweeks",
        "docs_url": "https://fantasy.premierleague.com/api/element-summary/1/",
    },
    {
        "source": "fbref",
        "label": "FBref / Understat underlying metrics",
        "purpose": (
            "Non-penalty xG, shot- and goal-creating actions, key passes, progressive "
            "carries and defensive actions — the volume signals behind a player's "
            "returns, feeding the gradient-boosted model."
        ),
        "requires": [],
        "extras": ["soccerdata"],
        "table": "fbref_player_stats",
        "docs_url": "https://fbref.com/",
    },
    {
        "source": "odds",
        "label": "Bookmaker odds (the-odds-api)",
        "purpose": (
            "De-vigged clean-sheet and anytime-goalscorer probabilities. The strongest "
            "available prior for the two quantities historical data pins down worst."
        ),
        "requires": ["ODDS_API_KEY"],
        "table": "odds_markets",
        "docs_url": "https://the-odds-api.com/",
    },
    {
        "source": "news",
        "label": "Availability agent",
        "purpose": (
            "Reads official injury notes and beat-reporter posts and extracts a start "
            "probability per player, overriding the FPL flag that often lags a press "
            "conference by a day."
        ),
        "requires": ["ANTHROPIC_API_KEY"],
        "optional_requires": ["X_BEARER_TOKEN"],
        "extras": ["anthropic"],
        "table": "availability_overrides",
        "docs_url": "https://platform.claude.com/docs/en/api/overview",
    },
]


def _env_present(name: str) -> bool:
    return bool(getattr(config, name, None))


def _row_count(conn: sqlite3.Connection, table: str) -> int:
    try:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        return 0


def describe(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    out = []
    for spec in SOURCES:
        latest = conn.execute(
            "SELECT status, rows_written, message, started_at, finished_at FROM ingest_runs "
            "WHERE source=? ORDER BY started_at DESC, id DESC LIMIT 1",
            (spec["source"],),
        ).fetchone()
        success = conn.execute(
            "SELECT finished_at FROM ingest_runs WHERE source=? AND status IN ('ok','partial') "
            "ORDER BY started_at DESC, id DESC LIMIT 1",
            (spec["source"],),
        ).fetchone()
        required = spec.get("requires", [])
        out.append(
            {
                "source": spec["source"],
                "label": spec["label"],
                "purpose": spec["purpose"],
                "status": latest["status"] if latest else "never",
                "last_success": success["finished_at"] if success else None,
                "last_attempt": latest["started_at"] if latest else None,
                "rows": latest["rows_written"] if latest else 0,
                "message": latest["message"] if latest else None,
                "requires": required,
                "optional_requires": spec.get("optional_requires", []),
                "extras": spec.get("extras", []),
                "configured": all(_env_present(name) for name in required),
                "missing_env": [name for name in required if not _env_present(name)],
                "table": spec["table"],
                "table_rows": _row_count(conn, spec["table"]),
                "docs_url": spec["docs_url"],
            }
        )
    return out


def handler(source: str) -> Callable[[sqlite3.Connection], dict[str, Any]]:
    """Resolve a source name to its ingest callable, importing lazily."""
    if source == "fbref":
        from . import fbref

        return fbref.ingest
    if source == "odds":
        from . import odds

        return odds.ingest
    if source == "news":
        from . import news

        return news.ingest
    from . import fpl

    return {
        "fpl_bootstrap": fpl.ingest_bootstrap,
        "bootstrap": fpl.ingest_bootstrap,
        "fpl_fixtures": fpl.ingest_fixtures,
        "fixtures": fpl.ingest_fixtures,
        "fpl_history": fpl.ingest_player_history,
        "history": fpl.ingest_player_history,
    }[source]
