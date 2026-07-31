"""Ingest CLI.

    python -m backend.ingest.runner status
    python -m backend.ingest.runner all
    python -m backend.ingest.runner fpl | bootstrap | fixtures | history | fbref | odds | news

Exits non-zero if any requested source finished with `error`. A source that is
merely `unconfigured` or `unreachable` is reported, not treated as a failure —
those are expected states, not bugs.
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from ..app import db as dbm
from . import sources

GROUPS = {
    "fpl": ["bootstrap", "fixtures"],
    "all": ["bootstrap", "fixtures", "history", "fbref", "odds", "news"],
}
FAILURE_STATES = {"error"}


def _call(conn: Any, name: str, args: argparse.Namespace) -> dict[str, Any]:
    fn = sources.handler(name)
    kwargs: dict[str, Any] = {}
    if name in ("history", "fpl_history") and args.limit:
        kwargs["limit"] = args.limit
    if name == "news":
        if args.event:
            kwargs["event_id"] = args.event
        if args.limit:
            kwargs["limit"] = args.limit
    try:
        return fn(conn, **kwargs)
    except Exception as exc:  # reported, never swallowed
        return {"source": name, "mode": "error", "rows": 0, "message": f"{type(exc).__name__}: {exc}"}


def cmd_status(conn: Any) -> int:
    rows = sources.describe(conn)
    width = max(len(r["source"]) for r in rows)
    print(f"{'source'.ljust(width)}  {'status':<13}{'rows':>8}  {'table rows':>10}  config")
    print("-" * (width + 56))
    for r in rows:
        cfg = "ok" if r["configured"] else "missing: " + ", ".join(r["missing_env"])
        print(
            f"{r['source'].ljust(width)}  {r['status']:<13}{r['rows']:>8}  "
            f"{r['table_rows']:>10}  {cfg}"
        )
    print()
    for r in rows:
        if r["message"]:
            print(f"  {r['source']}: {r['message'][:160]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="backend.ingest.runner", description=__doc__)
    parser.add_argument(
        "source",
        help="status | all | fpl | bootstrap | fixtures | history | fbref | odds | news",
    )
    parser.add_argument("--limit", type=int, default=None, help="cap the number of items fetched")
    parser.add_argument("--event", type=int, default=None, help="target gameweek where relevant")
    parser.add_argument("--horizon", type=int, default=None, help="gameweeks ahead where relevant")
    args = parser.parse_args(argv)

    dbm.migrate()
    conn = dbm.connect()

    if args.source == "status":
        return cmd_status(conn)

    names = GROUPS.get(args.source, [args.source])
    results = []
    for name in names:
        try:
            results.append(_call(conn, name, args))
        except KeyError:
            print(f"unknown source '{name}'", file=sys.stderr)
            return 2

    width = max(len(str(r.get("source", ""))) for r in results)
    print(f"{'source'.ljust(width)}  {'mode':<14}{'rows':>7}  message")
    print("-" * (width + 40))
    for r in results:
        print(
            f"{str(r.get('source', '')).ljust(width)}  {str(r.get('mode', '')):<14}"
            f"{r.get('rows', 0):>7}  {str(r.get('message', ''))[:140]}"
        )
    return 1 if any(r.get("mode") in FAILURE_STATES for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
