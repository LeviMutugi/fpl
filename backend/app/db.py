"""SQLite access layer.

One connection per thread, WAL enabled so the ingest CLI and the API can run at
the same time. `migrate()` is idempotent and also upgrades the pre-existing
database in place: the original snapshots are preserved, the derived reference
tables are rebuilt from them.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

from . import config

_local = threading.local()

# Reference tables that are pure projections of raw_snapshots and can therefore
# be dropped and rebuilt whenever their shape changes.
DERIVED_TABLES = (
    "players",
    "teams",
    "fixtures",
    "events",
    "chips",
    "element_types",
    "player_season_stats",
    "model_predictions",  # legacy name, superseded by `predictions`
)


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path or config.DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_conn() -> sqlite3.Connection:
    """Thread-local connection for request handlers."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = connect()
        _local.conn = conn
    return conn


@contextmanager
def tx(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error:
        return set()


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def migrate(path: Path | None = None, *, rebuild_derived: bool = False) -> None:
    """Apply the schema, upgrading a legacy database in place if needed."""
    target = path or config.DB_PATH
    conn = connect(target)
    try:
        # raw_snapshots predates the `source`/`sha256` columns.
        if _table_exists(conn, "raw_snapshots"):
            cols = _columns(conn, "raw_snapshots")
            if "source" not in cols:
                conn.execute(
                    "ALTER TABLE raw_snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'fpl'"
                )
            if "sha256" not in cols:
                conn.execute("ALTER TABLE raw_snapshots ADD COLUMN sha256 TEXT")

        # A legacy `players` table has no team_id and NOT NULL photo columns.
        legacy = _table_exists(conn, "players") and "team_id" not in _columns(conn, "players")
        if legacy or rebuild_derived:
            conn.execute("PRAGMA foreign_keys=OFF")
            for table in DERIVED_TABLES:
                conn.execute(f"DROP TABLE IF EXISTS {table}")
            conn.commit()
            conn.execute("PRAGMA foreign_keys=ON")

        conn.executescript(config.SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()


# --- small helpers used across ingest/model code ----------------------------

def executemany(conn: sqlite3.Connection, sql: str, rows: Iterable[Sequence[Any]]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    conn.executemany(sql, rows)
    return len(rows)


def upsert(conn: sqlite3.Connection, table: str, rows: list[dict[str, Any]], keys: Sequence[str]) -> int:
    """INSERT .. ON CONFLICT(keys) DO UPDATE for a list of homogeneous dicts."""
    if not rows:
        return 0
    cols = list(rows[0].keys())
    placeholders = ",".join("?" for _ in cols)
    updates = ",".join(f"{c}=excluded.{c}" for c in cols if c not in keys)
    conflict = ",".join(keys)
    sql = (
        f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT({conflict}) DO UPDATE SET {updates}"
        if updates
        else f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
    )
    conn.executemany(sql, [[r[c] for c in cols] for r in rows])
    return len(rows)


def query(sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
    return get_conn().execute(sql, params).fetchall()


def query_one(sql: str, params: Sequence[Any] = ()) -> sqlite3.Row | None:
    return get_conn().execute(sql, params).fetchone()


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


def latest_snapshot(conn: sqlite3.Connection, endpoint: str) -> tuple[int, Any, str] | None:
    row = conn.execute(
        "SELECT id, payload, captured_at FROM raw_snapshots WHERE endpoint=? "
        "ORDER BY captured_at DESC, id DESC LIMIT 1",
        (endpoint,),
    ).fetchone()
    if row is None:
        return None
    return row["id"], json.loads(row["payload"]), row["captured_at"]


def table_count(conn: sqlite3.Connection, table: str) -> int:
    if not _table_exists(conn, table):
        return 0
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
