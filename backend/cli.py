"""Command line entry point.

    python -m backend.cli ingest      # refresh from the FPL API (falls back to snapshot)
    python -m backend.cli run         # fit models and write a new run
    python -m backend.cli solve       # optimise a squad from the latest run
    python -m backend.cli status      # what is in the database right now
    python -m backend.cli serve       # start the API
"""
from __future__ import annotations

import argparse
import json
import sys

from .app import config, db as dbm, service


def cmd_ingest(args: argparse.Namespace) -> int:
    from .ingest import fpl

    conn = dbm.connect()
    results = [fpl.ingest_bootstrap(conn), fpl.ingest_fixtures(conn)]
    if args.history:
        results.append(fpl.ingest_player_history(conn, limit=args.limit))
    for r in results:
        print(f"{r['source']:<16} {r['mode']:<10} rows={r['rows']:<6} {r['message']}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    from .fplengine import pipeline

    conn = dbm.connect()
    result = pipeline.run(conn, horizon=args.horizon, event=args.event)
    print(f"run_id        {result['run_id']}")
    print(f"target event  GW{result['target_event']} (horizon {result['horizon']})")
    print(f"players       {result['n_players']}   predictions {result['n_predictions']}")
    print(f"stack weights {result['stack_weights']}")
    print(f"duration      {result['duration_ms']} ms")
    print()
    print(f"{'model':<16}{'spearman':>10}{'mae':>9}{'rmse':>9}{'r2':>9}{'top10%':>9}")
    for model, metrics in result["metrics"].items():
        print(
            f"{model:<16}"
            f"{metrics.get('spearman', float('nan')):>10.4f}"
            f"{metrics.get('mae', float('nan')):>9.4f}"
            f"{metrics.get('rmse', float('nan')):>9.4f}"
            f"{metrics.get('r2', float('nan')):>9.4f}"
            f"{metrics.get('precision_top_decile', float('nan')):>9.4f}"
        )
    return 0


def cmd_solve(args: argparse.Namespace) -> int:
    from .solver import optimizer

    conn = dbm.connect()
    run = service.require_run(conn)
    events = list(range(run["target_event"], run["target_event"] + (args.horizon or run["horizon"])))
    raw = service.candidates_for_solver(conn, run["run_id"], args.model, events)
    candidates = [
        optimizer.Candidate(r["player_id"], r["position"], r["team_id"], r["price"], r["xp_by_event"])
        for r in raw
    ]
    result = optimizer.solve(candidates, optimizer.SolveRequest(events=events, budget=args.budget))
    names = {
        r["id"]: (r["web_name"], r["short_name"])
        for r in conn.execute(
            "SELECT p.id, p.web_name, t.short_name FROM players p JOIN teams t ON t.id=p.team_id"
        )
    }
    print(f"status {result.status}  objective {result.objective}  cost £{result.squad_cost}m  ({result.solve_ms} ms)")
    target = events[0]
    print(f"\nGW{target} starting XI")
    for pid in result.xi_by_event[target]:
        mark = " (C)" if pid == result.captain_by_event[target] else ""
        print(f"  {names[pid][0]:<16}{names[pid][1]}{mark}")
    print("bench:", ", ".join(names[p][0] for p in result.bench_by_event[target]))
    for b in result.binding:
        print(f"  · {b['constraint']}: {b['note']}")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    conn = dbm.connect()
    meta = service.meta(conn)
    print(f"database        {config.DB_PATH}")
    print(f"season          {meta['season']} (priors from {meta['prior_season']})")
    print(f"next gameweek   {meta['next_event']}  deadline {meta['next_deadline']}")
    print("counts          " + json.dumps(meta["counts"]))
    print("\nsources")
    for f in meta["data_freshness"]:
        print(f"  {f['source']:<16}{f['status']:<14}rows={f['rows']:<7}{(f['message'] or '')[:70]}")
    run = meta["active_run"]
    print("\nactive run      " + (run["run_id"] if run else "none — run `python -m backend.cli run`"))
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("backend.app.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="backend.cli", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("ingest", help="refresh reference data from the FPL API")
    p.add_argument("--history", action="store_true", help="also pull per-gameweek player history")
    p.add_argument("--limit", type=int, default=None)
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("run", help="fit models and persist a run")
    p.add_argument("--horizon", type=int, default=config.DEFAULT_HORIZON)
    p.add_argument("--event", type=int, default=None)
    p.set_defaults(func=cmd_run)

    p = sub.add_parser("solve", help="optimise a squad")
    p.add_argument("--budget", type=float, default=100.0)
    p.add_argument("--horizon", type=int, default=None)
    p.add_argument("--model", default="ensemble")
    p.set_defaults(func=cmd_solve)

    p = sub.add_parser("status", help="show database and source state")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("serve", help="start the API server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8010)
    p.add_argument("--reload", action="store_true")
    p.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    dbm.migrate()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
