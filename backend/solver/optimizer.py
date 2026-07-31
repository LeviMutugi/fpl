"""Squad optimisation as a mixed-integer program.

Solved with CBC through PuLP. The decision variables are the squad, the starting
eleven per gameweek, the captain per gameweek, and the bench order per gameweek,
so the objective is the quantity a manager actually scores rather than a proxy:

    sum over gameweeks of  (starters' xP + captain's extra multiple
                            + bench xP weighted by the odds of it counting)
    minus points hits for transfers beyond the free allowance

Two honest limitations, both surfaced in the response:
  * The candidate pool is pre-filtered by horizon xP (with anything locked or
    already owned forced in), because a full 564-player model over a five-week
    horizon is slower than it is useful.
  * Transfers are optimised as a single decision evaluated against the whole
    horizon. Sequencing transfers week by week is a different, much larger
    program and is not attempted here.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

import pulp

POSITION_LIMITS = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
XI_MIN = {"GKP": 1, "DEF": 3, "MID": 2, "FWD": 1}
XI_MAX = {"GKP": 1, "DEF": 5, "MID": 5, "FWD": 3}
SQUAD_SIZE = 15
XI_SIZE = 11
DEFAULT_BENCH_WEIGHTS = (0.28, 0.14, 0.06, 0.02)  # outfield 1-3, reserve keeper

FORMATIONS = {
    "3-4-3": {"DEF": 3, "MID": 4, "FWD": 3},
    "3-5-2": {"DEF": 3, "MID": 5, "FWD": 2},
    "4-4-2": {"DEF": 4, "MID": 4, "FWD": 2},
    "4-3-3": {"DEF": 4, "MID": 3, "FWD": 3},
    "4-5-1": {"DEF": 4, "MID": 5, "FWD": 1},
    "5-3-2": {"DEF": 5, "MID": 3, "FWD": 2},
    "5-4-1": {"DEF": 5, "MID": 4, "FWD": 1},
    "5-2-3": {"DEF": 5, "MID": 2, "FWD": 3},
    "3-6-1": {"DEF": 3, "MID": 6, "FWD": 1},
}


@dataclass(slots=True)
class Candidate:
    player_id: int
    position: str
    team_id: int
    price: float
    xp_by_event: dict[int, float]
    selling_price: float | None = None

    def horizon_xp(self) -> float:
        return sum(self.xp_by_event.values())


@dataclass(slots=True)
class SolveRequest:
    events: Sequence[int]
    budget: float = 100.0
    max_per_team: int = 3
    bench_weights: Sequence[float] = DEFAULT_BENCH_WEIGHTS
    formation: str | None = None
    locked_in: Sequence[int] = ()
    locked_out: Sequence[int] = ()
    existing_squad: Sequence[int] = ()
    free_transfers: int = 1
    transfer_penalty: float = 4.0
    chip: str = "none"
    pool_per_position: int = 45
    time_limit: int = 25
    captain_multiplier: int = 2


@dataclass(slots=True)
class SolveResult:
    solve_id: str
    status: str
    objective: float
    squad: list[int]
    xi_by_event: dict[int, list[int]]
    captain_by_event: dict[int, int]
    bench_by_event: dict[int, list[int]]
    transfers_in: list[int]
    transfers_out: list[int]
    hits: int
    squad_cost: float
    solve_ms: int
    pool_size: int
    binding: list[dict[str, Any]] = field(default_factory=list)
    per_event: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def build_pool(
    candidates: Iterable[Candidate],
    req: SolveRequest,
) -> list[Candidate]:
    """Keep the strongest N per position, plus everything owned or locked in."""
    forced = set(req.locked_in) | set(req.existing_squad)
    excluded = set(req.locked_out)
    by_position: dict[str, list[Candidate]] = {}
    forced_list: list[Candidate] = []
    for c in candidates:
        if c.player_id in excluded and c.player_id not in forced:
            continue
        if c.player_id in forced:
            forced_list.append(c)
            continue
        by_position.setdefault(c.position, []).append(c)

    pool: list[Candidate] = list(forced_list)
    seen = {c.player_id for c in pool}
    for position, group in by_position.items():
        group.sort(key=lambda c: (-c.horizon_xp(), c.price))
        for c in group[: req.pool_per_position]:
            if c.player_id not in seen:
                pool.append(c)
                seen.add(c.player_id)
    return pool


def solve(candidates: Iterable[Candidate], req: SolveRequest) -> SolveResult:
    started = time.time()
    pool = build_pool(candidates, req)
    by_id = {c.player_id: c for c in pool}
    events = list(req.events)
    chip = (req.chip or "none").lower()
    bench_weights = list(req.bench_weights)
    if chip == "bboost":
        bench_weights = [1.0, 1.0, 1.0, 1.0]
    captain_multiplier = 3 if chip == "3xc" else req.captain_multiplier

    problem = pulp.LpProblem("fpl_squad", pulp.LpMaximize)

    squad = {c.player_id: pulp.LpVariable(f"sq_{c.player_id}", cat="Binary") for c in pool}
    start = {
        (c.player_id, e): pulp.LpVariable(f"st_{c.player_id}_{e}", cat="Binary")
        for c in pool
        for e in events
    }
    captain = {
        (c.player_id, e): pulp.LpVariable(f"cp_{c.player_id}_{e}", cat="Binary")
        for c in pool
        for e in events
    }
    outfield = [c for c in pool if c.position != "GKP"]
    bench_slot = {
        (c.player_id, e, k): pulp.LpVariable(f"bs_{c.player_id}_{e}_{k}", cat="Binary")
        for c in outfield
        for e in events
        for k in range(3)
    }

    # --- objective -----------------------------------------------------------
    terms = []
    for e in events:
        for c in pool:
            xp = c.xp_by_event.get(e, 0.0)
            terms.append(xp * start[(c.player_id, e)])
            terms.append(xp * (captain_multiplier - 1) * captain[(c.player_id, e)])
        for c in outfield:
            for k in range(3):
                terms.append(bench_weights[k] * c.xp_by_event.get(e, 0.0) * bench_slot[(c.player_id, e, k)])
        for c in pool:
            if c.position == "GKP":
                # The keeper not in the eleven is the reserve by construction.
                terms.append(
                    bench_weights[3] * c.xp_by_event.get(e, 0.0) * (squad[c.player_id] - start[(c.player_id, e)])
                )

    # --- transfers -----------------------------------------------------------
    existing = [pid for pid in req.existing_squad if pid in by_id]
    hits_var = None
    transfers_expr = None
    if existing:
        # Transfers out are owned players not in the new squad.
        transfers_expr = pulp.lpSum(1 - squad[pid] for pid in existing)
        if chip in ("wildcard", "freehit"):
            problem += transfers_expr >= 0
        else:
            hits_var = pulp.LpVariable("hits", lowBound=0, cat="Integer")
            problem += hits_var >= transfers_expr - req.free_transfers
            terms.append(-req.transfer_penalty * hits_var)

    problem += pulp.lpSum(terms)

    # --- squad structure -----------------------------------------------------
    problem += pulp.lpSum(squad.values()) == SQUAD_SIZE, "squad_size"
    for position, limit in POSITION_LIMITS.items():
        members = [squad[c.player_id] for c in pool if c.position == position]
        problem += pulp.lpSum(members) == limit, f"squad_{position}"

    teams = {c.team_id for c in pool}
    for team_id in teams:
        members = [squad[c.player_id] for c in pool if c.team_id == team_id]
        if members:
            problem += pulp.lpSum(members) <= req.max_per_team, f"team_cap_{team_id}"

    # Budget. `budget` is the total squad value the manager can field: for a fresh
    # squad that is the £100.0m allowance, and for a transfer plan the caller
    # passes the current squad value plus the money in the bank, so a player sold
    # releases exactly what they are worth.
    problem += (
        pulp.lpSum(c.price * squad[c.player_id] for c in pool) <= req.budget,
        "budget",
    )

    for pid in req.locked_in:
        if pid in squad:
            problem += squad[pid] == 1, f"lock_in_{pid}"
    for pid in req.locked_out:
        if pid in squad:
            problem += squad[pid] == 0, f"lock_out_{pid}"

    # --- lineup structure ----------------------------------------------------
    formation = FORMATIONS.get(req.formation or "", None)
    for e in events:
        problem += pulp.lpSum(start[(c.player_id, e)] for c in pool) == XI_SIZE, f"xi_size_{e}"
        for c in pool:
            problem += start[(c.player_id, e)] <= squad[c.player_id], f"start_in_squad_{c.player_id}_{e}"
            problem += captain[(c.player_id, e)] <= start[(c.player_id, e)], f"cap_starts_{c.player_id}_{e}"
        problem += pulp.lpSum(captain[(c.player_id, e)] for c in pool) == 1, f"one_captain_{e}"

        for position in POSITION_LIMITS:
            members = [start[(c.player_id, e)] for c in pool if c.position == position]
            if not members:
                continue
            if formation is not None and position != "GKP":
                problem += pulp.lpSum(members) == formation[position], f"formation_{position}_{e}"
            else:
                problem += pulp.lpSum(members) >= XI_MIN[position], f"xi_min_{position}_{e}"
                problem += pulp.lpSum(members) <= XI_MAX[position], f"xi_max_{position}_{e}"
        problem += pulp.lpSum(start[(c.player_id, e)] for c in pool if c.position == "GKP") == 1, f"one_gk_{e}"

        # Bench ordering: exactly one outfield player per bench slot, and a
        # benched player occupies exactly one slot.
        for k in range(3):
            problem += (
                pulp.lpSum(bench_slot[(c.player_id, e, k)] for c in outfield) == 1,
                f"bench_slot_{k}_{e}",
            )
        for c in outfield:
            problem += (
                pulp.lpSum(bench_slot[(c.player_id, e, k)] for k in range(3))
                == squad[c.player_id] - start[(c.player_id, e)],
                f"bench_assign_{c.player_id}_{e}",
            )

    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=req.time_limit)
    problem.solve(solver)
    status = pulp.LpStatus[problem.status]

    chosen = [pid for pid, var in squad.items() if var.value() and var.value() > 0.5]
    xi_by_event: dict[int, list[int]] = {}
    bench_by_event: dict[int, list[int]] = {}
    captain_by_event: dict[int, int] = {}
    per_event: list[dict[str, Any]] = []
    for e in events:
        xi = [c.player_id for c in pool if start[(c.player_id, e)].value() and start[(c.player_id, e)].value() > 0.5]
        xi_by_event[e] = xi
        caps = [c.player_id for c in pool if captain[(c.player_id, e)].value() and captain[(c.player_id, e)].value() > 0.5]
        captain_by_event[e] = caps[0] if caps else (max(xi, key=lambda p: by_id[p].xp_by_event.get(e, 0.0)) if xi else 0)
        ordered_bench: list[int] = []
        for k in range(3):
            for c in outfield:
                v = bench_slot[(c.player_id, e, k)].value()
                if v and v > 0.5:
                    ordered_bench.append(c.player_id)
                    break
        reserve_gk = [
            pid for pid in chosen
            if by_id[pid].position == "GKP" and pid not in xi
        ]
        bench_by_event[e] = ordered_bench + reserve_gk
        xi_xp = sum(by_id[p].xp_by_event.get(e, 0.0) for p in xi)
        cap_id = captain_by_event[e]
        per_event.append(
            {
                "event": e,
                "xi_xp": round(xi_xp, 3),
                "captain_id": cap_id,
                "captain_bonus": round(by_id[cap_id].xp_by_event.get(e, 0.0) * (captain_multiplier - 1), 3)
                if cap_id in by_id
                else 0.0,
                "bench_xp": round(
                    sum(
                        bench_weights[i] * by_id[p].xp_by_event.get(e, 0.0)
                        for i, p in enumerate(bench_by_event[e][:3])
                    )
                    + sum(
                        bench_weights[3] * by_id[p].xp_by_event.get(e, 0.0)
                        for p in bench_by_event[e][3:]
                    ),
                    3,
                ),
            }
        )

    transfers_out = [pid for pid in existing if pid not in chosen]
    transfers_in = [pid for pid in chosen if pid not in set(existing)] if existing else []
    hits = 0
    if hits_var is not None and hits_var.value():
        hits = int(round(hits_var.value()))

    squad_cost = round(sum(by_id[p].price for p in chosen), 1)
    binding = _binding_report(problem, by_id, chosen, req, squad_cost)

    notes = [
        f"candidate pool: {len(pool)} players (top {req.pool_per_position} per position by horizon xP"
        f"{', plus owned and locked players' if existing or req.locked_in else ''})",
        f"bench weights: {', '.join(str(w) for w in bench_weights)}",
    ]
    if chip != "none":
        notes.append(f"chip modelled: {chip}")
    if existing:
        notes.append(
            "transfers are optimised as one decision scored against the whole horizon; "
            "week-by-week sequencing is not modelled"
        )

    return SolveResult(
        solve_id=f"s-{uuid.uuid4().hex[:10]}",
        status=status,
        objective=round(float(pulp.value(problem.objective) or 0.0), 4),
        squad=chosen,
        xi_by_event=xi_by_event,
        captain_by_event=captain_by_event,
        bench_by_event=bench_by_event,
        transfers_in=transfers_in,
        transfers_out=transfers_out,
        hits=hits,
        squad_cost=squad_cost,
        solve_ms=int((time.time() - started) * 1000),
        pool_size=len(pool),
        binding=binding,
        per_event=per_event,
        notes=notes,
    )


def _binding_report(
    problem: pulp.LpProblem,
    by_id: dict[int, Candidate],
    chosen: list[int],
    req: SolveRequest,
    squad_cost: float,
) -> list[dict[str, Any]]:
    """Which constraints are actually holding the solution back."""
    out: list[dict[str, Any]] = []
    budget_slack = round(req.budget - squad_cost, 2)
    out.append(
        {
            "constraint": "budget",
            "slack": budget_slack,
            "note": (
                f"£{budget_slack}m unspent — budget is not the limiting factor"
                if budget_slack > 0.15
                else "budget is fully committed and is limiting the squad"
            ),
        }
    )
    counts: dict[int, int] = {}
    for pid in chosen:
        counts[by_id[pid].team_id] = counts.get(by_id[pid].team_id, 0) + 1
    at_cap = [t for t, n in counts.items() if n >= req.max_per_team]
    out.append(
        {
            "constraint": "max_per_team",
            "slack": float(req.max_per_team - (max(counts.values()) if counts else 0)),
            "note": (
                f"{len(at_cap)} club(s) at the {req.max_per_team}-player cap"
                if at_cap
                else "no club is at the cap"
            ),
        }
    )
    for position, limit in POSITION_LIMITS.items():
        held = sum(1 for pid in chosen if by_id[pid].position == position)
        out.append(
            {
                "constraint": f"squad_{position}",
                "slack": float(limit - held),
                "note": f"{held}/{limit} {position} selected (fixed by the rules)",
            }
        )
    return out


def marginal_budget_value(
    candidates: Iterable[Candidate], req: SolveRequest, step: float = 0.5
) -> float | None:
    """What one more half-million of budget would be worth, by re-solving.

    A genuine shadow price rather than an LP-relaxation dual, since the dual of a
    mixed-integer program is not defined.
    """
    cached = list(candidates)
    base = solve(cached, req)
    if base.status != "Optimal":
        return None
    bumped = SolveRequest(**{**req.__dict__, "budget": req.budget + step})
    alt = solve(cached, bumped)
    if alt.status != "Optimal":
        return None
    return round(alt.objective - base.objective, 4)
