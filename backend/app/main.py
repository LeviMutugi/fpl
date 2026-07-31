"""FastAPI application.

Thin transport layer: every response body is built in `service.py` or by the
model/solver packages, so the shapes documented in docs/API_CONTRACT.md have a
single source of truth.
"""
from __future__ import annotations

import html
import re
import sqlite3
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, db as dbm, service
from ..fplengine import pipeline
from ..solver import optimizer

API_TITLE = "FPL Research Engine"


@asynccontextmanager
async def lifespan(app: FastAPI):
    dbm.migrate()
    yield


app = FastAPI(title=API_TITLE, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def conn() -> sqlite3.Connection:
    return dbm.get_conn()


@app.exception_handler(service.NoRunError)
async def no_run_handler(_request: Request, _exc: service.NoRunError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "error": "no_model_run",
            "detail": "The engine has not completed a model run yet.",
            "hint": "POST /api/run, or from a shell: python -m backend.cli run",
        },
    )


# -----------------------------------------------------------------------------
# meta and reference
# -----------------------------------------------------------------------------
@app.get("/api/meta")
def get_meta() -> dict[str, Any]:
    return service.meta(conn())


@app.get("/api/teams")
def get_teams() -> list[dict[str, Any]]:
    return service.teams(conn())


@app.get("/api/fixtures")
def get_fixtures(
    from_event: int | None = Query(None, alias="from"),
    to_event: int | None = Query(None, alias="to"),
) -> list[dict[str, Any]]:
    return service.fixtures(conn(), from_event, to_event)


@app.get("/api/fdr")
def get_fdr(
    from_event: int = Query(..., alias="from"),
    to_event: int = Query(..., alias="to"),
) -> dict[str, Any]:
    if to_event < from_event:
        raise HTTPException(400, "`to` must not be before `from`")
    if to_event - from_event > 20:
        raise HTTPException(400, "window limited to 20 gameweeks")
    return service.fdr_grid(conn(), from_event, to_event)


# -----------------------------------------------------------------------------
# players
# -----------------------------------------------------------------------------
@app.get("/api/players")
def get_players(
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
    return service.list_players(
        conn(),
        model=model,
        event=event,
        horizon=horizon,
        position=position,
        team=team,
        max_cost=max_cost,
        min_minutes=min_minutes,
        search=search,
        sort=sort,
        order=order,
        limit=min(limit, 800),
        offset=offset,
        only_available=only_available,
    )


@app.get("/api/players/{player_id}")
def get_player(
    player_id: int, model: str = "ensemble", event: int | None = None, horizon: int | None = None
) -> dict[str, Any]:
    detail = service.player_detail(conn(), player_id, model=model, event=event, horizon=horizon)
    if detail is None:
        raise HTTPException(404, f"no player with id {player_id}")
    return detail


# -----------------------------------------------------------------------------
# model lab and derived views
# -----------------------------------------------------------------------------
@app.get("/api/models/leaderboard")
def get_leaderboard() -> dict[str, Any]:
    return service.leaderboard(conn())


@app.get("/api/captaincy")
def get_captaincy(model: str = "ensemble", event: int | None = None, limit: int = 30) -> dict[str, Any]:
    return service.captaincy(conn(), model=model, event=event, limit=limit)


@app.get("/api/differentials")
def get_differentials(
    model: str = "ensemble", event: int | None = None, max_ownership: float = 8.0,
    min_xp: float = 2.0, limit: int = 40,
) -> dict[str, Any]:
    return service.differentials(
        conn(), model=model, event=event, max_ownership=max_ownership, min_xp=min_xp, limit=limit
    )


@app.get("/api/chips")
def get_chips(model: str = "ensemble") -> dict[str, Any]:
    return service.chips(conn(), model=model)


@app.get("/api/news")
def get_news(limit: int = 100) -> dict[str, Any]:
    return service.news_feed(conn(), limit=limit)


@app.get("/api/odds")
def get_odds(event: int | None = None) -> dict[str, Any]:
    return service.odds_view(conn(), event=event)


@app.get("/api/sources")
def get_sources() -> list[dict[str, Any]]:
    try:
        from ..ingest import sources

        return sources.describe(conn())
    except ImportError:
        # The advanced-source registry is optional; fall back to the ingest log.
        return [
            {**row, "label": row["source"], "requires": [], "configured": True}
            for row in service.freshness(conn())
        ]


# -----------------------------------------------------------------------------
# optimisation
# -----------------------------------------------------------------------------
class OptimizeRequest(BaseModel):
    budget: float = 100.0
    horizon: int | None = None
    event: int | None = None
    model: str = "ensemble"
    formation: str | None = None
    bench_weights: list[float] | None = None
    max_per_team: int = Field(default=3, ge=1, le=15)
    locked_in: list[int] = Field(default_factory=list)
    locked_out: list[int] = Field(default_factory=list)
    existing_squad: list[int] = Field(default_factory=list)
    free_transfers: int = 1
    transfer_penalty: float = 4.0
    chip: str = "none"
    time_limit: int = Field(default=25, ge=5, le=120)


@app.post("/api/optimize")
def post_optimize(req: OptimizeRequest) -> dict[str, Any]:
    c = conn()
    run = service.require_run(c)
    event = int(req.event or run["target_event"])
    horizon = int(req.horizon or run["horizon"])
    events = list(range(event, event + horizon))

    raw = service.candidates_for_solver(c, run["run_id"], req.model, events)
    if not raw:
        raise HTTPException(
            503,
            f"no predictions stored for model '{req.model}' over gameweeks {events[0]}-{events[-1]}",
        )
    candidates = [
        optimizer.Candidate(
            player_id=r["player_id"],
            position=r["position"],
            team_id=r["team_id"],
            price=r["price"],
            xp_by_event=r["xp_by_event"],
        )
        for r in raw
    ]

    solve_req = optimizer.SolveRequest(
        events=events,
        budget=req.budget,
        max_per_team=req.max_per_team,
        bench_weights=req.bench_weights or optimizer.DEFAULT_BENCH_WEIGHTS,
        formation=req.formation,
        locked_in=req.locked_in,
        locked_out=req.locked_out,
        existing_squad=req.existing_squad,
        free_transfers=req.free_transfers,
        transfer_penalty=req.transfer_penalty,
        chip=req.chip,
        time_limit=req.time_limit,
    )
    result = optimizer.solve(candidates, solve_req)
    if result.status != "Optimal":
        raise HTTPException(
            422,
            f"solver finished with status '{result.status}' — the constraints may be infeasible "
            f"(budget £{req.budget}m, {len(req.locked_in)} locked in, {len(req.locked_out)} locked out)",
        )
    return _serialise_solve(c, result, req, run, events)


def _serialise_solve(
    c: sqlite3.Connection,
    result: optimizer.SolveResult,
    req: OptimizeRequest,
    run: dict[str, Any],
    events: list[int],
) -> dict[str, Any]:
    payload = service.list_players(c, model=req.model, event=events[0], horizon=len(events), limit=2000)
    by_id = {p["id"]: p for p in payload["players"]}

    target = events[0]
    xi_ids = result.xi_by_event.get(target, [])
    bench_ids = result.bench_by_event.get(target, [])
    captain_id = result.captain_by_event.get(target)
    vice_id = max(
        (p for p in xi_ids if p != captain_id),
        key=lambda p: (by_id[p]["prediction"]["xp"] if by_id.get(p) and by_id[p]["prediction"] else 0),
        default=None,
    )

    counts = {"GKP": 0, "DEF": 0, "MID": 0, "FWD": 0}
    for pid in xi_ids:
        if pid in by_id:
            counts[by_id[pid]["position"]] += 1
    formation = f"{counts['DEF']}-{counts['MID']}-{counts['FWD']}"

    slots = _pitch_slots(counts)

    def decorate(pid: int, role: str, bench_order: int | None) -> dict[str, Any]:
        base = dict(by_id.get(pid, {"id": pid}))
        base.update(
            {
                "role": role,
                "bench_order": bench_order,
                "is_captain": pid == captain_id,
                "is_vice": pid == vice_id,
                "pitch_slot": slots.pop(base.get("position", "MID"), None) if role == "xi" else None,
            }
        )
        return base

    xi_sorted = sorted(
        xi_ids,
        key=lambda p: ({"GKP": 0, "DEF": 1, "MID": 2, "FWD": 3}.get(by_id.get(p, {}).get("position", "MID"), 4),
                       -(by_id[p]["prediction"]["xp"] if by_id.get(p) and by_id[p]["prediction"] else 0)),
    )
    xi = [decorate(pid, "xi", None) for pid in xi_sorted]
    bench = [decorate(pid, "bench", i) for i, pid in enumerate(bench_ids)]

    xi_xp = round(sum(p["prediction"]["xp"] for p in xi if p.get("prediction")), 3)
    bench_xp = round(sum(p["prediction"]["xp"] for p in bench if p.get("prediction")), 3)

    transfers = None
    if result.transfers_out or result.transfers_in:
        pairs = []
        for out_id, in_id in zip(result.transfers_out, result.transfers_in):
            out_p, in_p = by_id.get(out_id), by_id.get(in_id)
            delta = 0.0
            if out_p and in_p and out_p.get("horizon") and in_p.get("horizon"):
                delta = round(in_p["horizon"]["xp_total"] - out_p["horizon"]["xp_total"], 3)
            pairs.append({"out": out_p, "in": in_p, "delta_xp": delta})
        transfers = pairs

    per_event = []
    for row in result.per_event:
        cap = by_id.get(row["captain_id"])
        per_event.append(
            {
                **row,
                "captain": cap["web_name"] if cap else None,
                "captain_code": cap["code"] if cap else None,
            }
        )

    return {
        "solve_id": result.solve_id,
        "run_id": run["run_id"],
        "model_id": req.model,
        "status": result.status,
        "solve_ms": result.solve_ms,
        "pool_size": result.pool_size,
        "objective": result.objective,
        "squad_cost": result.squad_cost,
        "bank": round(req.budget - result.squad_cost, 1),
        "event": target,
        "events": events,
        "xi": xi,
        "bench": bench,
        "captain_id": captain_id,
        "vice_id": vice_id,
        "formation": formation,
        "xi_xp": xi_xp,
        "bench_xp": bench_xp,
        "total_xp": round(xi_xp + (by_id[captain_id]["prediction"]["xp"] if captain_id in by_id and by_id[captain_id]["prediction"] else 0), 3),
        "transfers": transfers,
        "hits": result.hits,
        "binding": result.binding,
        "per_event": per_event,
        "notes": result.notes,
        "chip": req.chip,
    }


def _pitch_slots(counts: dict[str, int]) -> dict[str, list[dict[str, int]]]:
    """Row/column coordinates for each position, consumed by the pitch view."""
    rows = {"GKP": 0, "DEF": 1, "MID": 2, "FWD": 3}
    slots: dict[str, list[dict[str, int]]] = {}
    for position, count in counts.items():
        slots[position] = [{"row": rows[position], "col": i, "of": count} for i in range(count)]
    return _PopList(slots)


class _PopList(dict):
    """Hands out the next free slot for a position on each `pop`."""

    def pop(self, key: str, default: Any = None) -> Any:  # type: ignore[override]
        bucket = super().get(key)
        if not bucket:
            return default
        return bucket.pop(0)


# -----------------------------------------------------------------------------
# runs and ingest
# -----------------------------------------------------------------------------
class RunRequest(BaseModel):
    horizon: int = 5
    event: int | None = None


@app.post("/api/run")
def post_run(req: RunRequest) -> dict[str, Any]:
    horizon = max(1, min(req.horizon, config.MAX_HORIZON))
    result = pipeline.run(conn(), horizon=horizon, event=req.event)
    return result


@app.post("/api/ingest/{source}")
def post_ingest(source: str) -> dict[str, Any]:
    c = conn()
    from ..ingest import fpl as fpl_ingest

    handlers: dict[str, Any] = {
        "bootstrap": lambda: fpl_ingest.ingest_bootstrap(c),
        "fixtures": lambda: fpl_ingest.ingest_fixtures(c),
        "history": lambda: fpl_ingest.ingest_player_history(c),
    }
    if source not in handlers:
        try:
            from ..ingest import sources as source_registry

            handler = source_registry.handler(source)
        except (ImportError, KeyError, AttributeError):
            raise HTTPException(404, f"unknown ingest source '{source}'")
        return handler(c)
    try:
        return handlers[source]()
    except Exception as exc:  # surfaced to the UI as a source status
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc


# -----------------------------------------------------------------------------
# imagery
# -----------------------------------------------------------------------------
@app.get("/api/photo/{code}")
async def get_photo(code: int, size: str = "md") -> Response:
    """Resolve a player photo, caching the first CDN path that answers.

    The browser tries the CDN directly first; this endpoint exists for the cases
    where it cannot (hotlink protection, an offline dev box) and guarantees an
    image either way — a generated monogram rather than a broken tile.
    """
    cached = config.PHOTO_CACHE_DIR / f"{code}-{size}.png"
    if cached.exists():
        return FileResponse(cached, media_type="image/png")

    for url in service.photo_candidates(code, size):
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": config.FPL_USER_AGENT})
        except httpx.HTTPError:
            continue
        if resp.status_code == 200 and resp.content[:4] == b"\x89PNG":
            cached.write_bytes(resp.content)
            return Response(resp.content, media_type="image/png")
    return Response(_monogram_svg(code), media_type="image/svg+xml")


@app.get("/api/badge/{code}")
async def get_badge(code: int, size: int = 70) -> Response:
    for url in service.badge_candidates(code, size):
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": config.FPL_USER_AGENT})
        except httpx.HTTPError:
            continue
        if resp.status_code == 200:
            return Response(resp.content, media_type="image/png")
    # Not the player route: `code` here is a *team* code, and the two namespaces
    # overlap, so falling through to /api/photo would draw some unrelated
    # player's initials as a club crest.
    return Response(_crest_svg(code), media_type="image/svg+xml")


def _crest_svg(code: int) -> bytes:
    """Club crest stand-in: the three-letter short name on the club's colour.

    The club's own `primary_hex` is used when the bootstrap supplied one, so a
    missing badge still lands in roughly the right place visually.
    """
    row = conn().execute(
        "SELECT short_name, name, primary_hex FROM teams WHERE code = ?", (code,)
    ).fetchone()
    text = (row["short_name"] if row else "") or "?"
    label = (row["name"] if row else "") or str(code)
    hex_value = row["primary_hex"] if row else None
    fill = hex_value if hex_value and re.fullmatch(r"#[0-9a-fA-F]{6}", hex_value) else None
    hue = (abs(code or 1) * 137.508) % 360
    top = fill or f"hsl({hue:.1f}, 44%, 46%)"
    bottom = fill or f"hsl({(hue + 7) % 360:.1f}, 48%, 30%)"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="{html.escape(label)}">
  <defs><linearGradient id="c" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0%" stop-color="{top}"/>
    <stop offset="100%" stop-color="{bottom}"/>
  </linearGradient></defs>
  <circle cx="50" cy="50" r="48" fill="url(#c)"/>
  <text x="50" y="53" text-anchor="middle" dominant-baseline="central"
        font-family="Outfit, Inter, system-ui, sans-serif"
        font-size="30" font-weight="700" letter-spacing="-1"
        fill="rgba(255,255,255,.94)">{html.escape(text[:3].upper())}</text>
</svg>""".encode()


def _initials(name: str) -> str:
    """First and last initial, matching the client's `initials()` helper."""
    words = [w for w in re.split(r"[\s-]+", re.sub(r"[^\w\s'-]", " ", name)) if w]
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[-1][0]).upper()


def _monogram_svg(code: int) -> bytes:
    """The terminal rung of the photo ladder: an initials plate.

    The code alone would only give a colour, so the player's name is read back
    from the database — a plate that says `EH` is a usable stand-in for a
    photograph, whereas a generic silhouette says nothing at all. The hue uses
    the same golden-angle walk as the client monogram, so the same player gets
    the same colour whichever rung ends up drawing them.
    """
    row = conn().execute("SELECT web_name FROM players WHERE code = ?", (code,)).fetchone()
    label = row["web_name"] if row else ""
    text = _initials(label) if label else "?"
    # An SVG served to an <img> renders in its own document, and Chromium's
    # presentation-attribute parser does not accept oklch() there — the stops
    # would silently drop out and leave white text on a blank plate. hsl() is
    # understood everywhere, so the fallback uses it deliberately.
    hue = (abs(code or 1) * 137.508) % 360
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="{html.escape(label or str(code))}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0%" stop-color="hsl({hue:.1f}, 44%, 46%)"/>
    <stop offset="100%" stop-color="hsl({(hue + 7) % 360:.1f}, 48%, 30%)"/>
  </linearGradient></defs>
  <rect width="100" height="100" rx="28" fill="url(#g)"/>
  <ellipse cx="50" cy="118" rx="44" ry="42" fill="rgba(255,255,255,.10)"/>
  <text x="50" y="52" text-anchor="middle" dominant-baseline="central"
        font-family="Outfit, Inter, system-ui, sans-serif"
        font-size="{30 if len(text) > 2 else 38}" font-weight="650"
        fill="rgba(255,255,255,.92)">{html.escape(text)}</text>
</svg>""".encode()


# -----------------------------------------------------------------------------
# built frontend (production single-process mode)
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    c = conn()
    return {
        "status": "ok",
        "database": str(config.DB_PATH),
        "players": dbm.table_count(c, "players"),
        "predictions": dbm.table_count(c, "predictions"),
        "has_run": service.active_run(c) is not None,
    }


if config.FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIST), html=True), name="frontend")
