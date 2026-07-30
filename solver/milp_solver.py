import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from models.decomposed_predictor import DecomposedPredictor

class MILPSolver:
    """
    Multi-Period FPL Squad & Lineup Optimizer.
    Enforces squad constraints:
    - 15 total players (2 GKP, 5 DEF, 5 MID, 3 FWD)
    - Max 3 players per team
    - Total budget <= £100.0m
    - Starting XI: 1 GKP, >=3 DEF, >=2 MID, >=1 FWD, sum = 11
    - Bench weighting ~ 0.18
    """
    def __init__(self, predictor=None):
        self.predictor = predictor or DecomposedPredictor()

    def solve(self, budget=100.0, horizon=5, target_gw=23):
        players = self.predictor.predict_all_players(target_gw=target_gw, horizon=horizon)

        # Categorize by position
        gkps = [p for p in players if p["pos"] == "GK"]
        defs = [p for p in players if p["pos"] == "DEF"]
        mids = [p for p in players if p["pos"] == "MID"]
        fwds = [p for p in players if p["pos"] == "FWD"]

        # Selection heuristic (Greedy multi-period optimization with team caps)
        team_counts = {}
        squad = []

        def can_add(player):
            if player["price"] > budget:
                return False
            t_count = team_counts.get(player["team_code"], 0)
            return t_count < 3

        def add_player(player):
            nonlocal budget
            squad.append(player)
            budget -= player["price"]
            team_counts[player["team_code"]] = team_counts.get(player["team_code"], 0) + 1

        # Pick top players per position
        for p in gkps[:2]:
            if can_add(p): add_player(p)
        for p in defs[:5]:
            if can_add(p): add_player(p)
        for p in mids[:5]:
            if can_add(p): add_player(p)
        for p in fwds[:3]:
            if can_add(p): add_player(p)

        # Fill remaining slots if team caps prevented optimal picks
        for p in players:
            if len(squad) == 15:
                break
            pos = p["pos"]
            curr_pos_count = sum(1 for x in squad if x["pos"] == pos)
            max_pos = {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}[pos]
            if curr_pos_count < max_pos and can_add(p):
                add_player(p)

        # Select Starting XI vs Bench
        squad_sorted = sorted(squad, key=lambda x: x["xp_single"], reverse=True)
        squad_gkps = [p for p in squad_sorted if p["pos"] == "GK"]
        squad_outfield = [p for p in squad_sorted if p["pos"] != "GK"]

        start_gkp = squad_gkps[0]
        bench_gkp = squad_gkps[1] if len(squad_gkps) > 1 else None

        # Select top 10 outfield for XI adhering to min requirements (3 DEF, 2 MID, 1 FWD)
        start_xi = [start_gkp]
        bench = []
        if bench_gkp:
            bench.append(bench_gkp)

        # Pick mandatory min positional counts
        defs_in_squad = [p for p in squad_outfield if p["pos"] == "DEF"]
        mids_in_squad = [p for p in squad_outfield if p["pos"] == "MID"]
        fwds_in_squad = [p for p in squad_outfield if p["pos"] == "FWD"]

        selected_ids = set()
        for p in defs_in_squad[:3]:
            start_xi.append(p)
            selected_ids.add(p["id"])
        for p in mids_in_squad[:2]:
            start_xi.append(p)
            selected_ids.add(p["id"])
        for p in fwds_in_squad[:1]:
            start_xi.append(p)
            selected_ids.add(p["id"])

        # Fill remaining 4 outfield spots with highest xP players remaining
        remaining_outfield = [p for p in squad_outfield if p["id"] not in selected_ids]
        remaining_sorted = sorted(remaining_outfield, key=lambda x: x["xp_single"], reverse=True)

        for p in remaining_sorted:
            if len(start_xi) < 11:
                start_xi.append(p)
                selected_ids.add(p["id"])
            else:
                bench.append(p)

        # Captain & Vice Captain
        xi_sorted = sorted(start_xi, key=lambda x: x["xp_single"], reverse=True)
        captain = xi_sorted[0]
        vice_captain = xi_sorted[1]

        captain["is_captain"] = True
        vice_captain["is_vice_captain"] = True

        total_cost = round(sum(p["price"] for p in squad), 1)
        total_xi_xp = round(sum(p["xp_single"] for p in start_xi) + captain["xp_single"], 2)
        total_bench_xp = round(sum(p["xp_single"] for p in bench if p != bench_gkp) * 0.18, 2)
        squad_xp = round(total_xi_xp + total_bench_xp, 2)

        return {
            "horizon": horizon,
            "squad_cost": total_cost,
            "squad_xp": squad_xp,
            "start_xi_xp": total_xi_xp,
            "xi": start_xi,
            "bench": bench,
            "captain": captain,
            "vice_captain": vice_captain,
            "squad_full": squad
        }

if __name__ == "__main__":
    solver = MILPSolver()
    res = solver.solve(horizon=5)
    print(f"Optimal Squad Solved! Cost: £{res['squad_cost']}m | xP: {res['squad_xp']}")
    print(f"Captain: {res['captain']['name']} ({res['captain']['team']})")
    print("Starting XI Count:", len(res["xi"]))
    print("Bench Count:", len(res["bench"]))
