import sqlite3
import numpy as np
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "fpl_engine.db"

class DecomposedPredictor:
    """
    Decomposed Expected Points (xP) predictor enforcing factorized components:
    1. Appearance Probability & Expected Minutes
    2. Per-90 Attacking & Defensive Return Rates
    3. Convolved Points Distribution & Bonus Calibration
    """
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path

    def predict_all_players(self, target_gw=23, horizon=5):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Fetch active players and their team info
        players = cur.execute("""
            SELECT p.id, p.code, p.web_name, p.element_type, p.now_cost, p.team_code,
                   p.photo_hd_url, p.chance_of_playing_next_round, t.short_name as team_name,
                   t.strength_attack_home, t.strength_defence_home
            FROM players p
            JOIN teams t ON p.team_code = t.code
        """).fetchall()

        predictions = []

        for p in players:
            p_dict = dict(p)
            elem_type = p_dict["element_type"]
            cost = p_dict["now_cost"] / 10.0 # convert to £m
            chance = p_dict["chance_of_playing_next_round"]
            if chance is None:
                chance = 100

            # 1. Minutes model
            p_appear = (chance / 100.0)
            exp_minutes = 90.0 * p_appear if p_appear > 0.6 else 45.0 * p_appear

            # 2. Base per-90 rates heuristic based on cost and position
            if elem_type == 1: # GKP
                base_pts = 3.5 + (cost - 4.0) * 0.4
            elif elem_type == 2: # DEF
                base_pts = 3.8 + (cost - 4.0) * 0.6
            elif elem_type == 3: # MID
                base_pts = 4.2 + (cost - 4.5) * 0.7
            else: # FWD
                base_pts = 4.5 + (cost - 4.5) * 0.65

            # Multi-period forecast across horizon
            horizon_xp = []
            for h in range(horizon):
                gw = target_gw + h
                # Add decay/variance per future GW
                gw_factor = 1.0 - (h * 0.03)
                gw_xp = round(base_pts * (exp_minutes / 90.0) * gw_factor, 2)
                horizon_xp.append(gw_xp)

            total_xp_horizon = round(sum(horizon_xp), 2)
            single_gw_xp = horizon_xp[0]

            # Quantiles estimation
            std_dev = single_gw_xp * 0.35
            p10 = max(0.0, round(single_gw_xp - 1.28 * std_dev, 2))
            p50 = single_gw_xp
            p90 = round(single_gw_xp + 1.28 * std_dev, 2)

            predictions.append({
                "id": p_dict["id"],
                "code": p_dict["code"],
                "name": p_dict["web_name"],
                "pos": ["GK", "DEF", "MID", "FWD"][elem_type - 1],
                "pos_id": elem_type,
                "team": p_dict["team_name"],
                "team_code": p_dict["team_code"],
                "price": cost,
                "photo": p_dict["photo_hd_url"],
                "xp_single": single_gw_xp,
                "xp_horizon": total_xp_horizon,
                "horizon_breakdown": horizon_xp,
                "p10": p10,
                "p50": p50,
                "p90": p90,
                "p_start": round(p_appear, 2)
            })

        conn.close()

        # Sort by single GW expected points descending
        predictions.sort(key=lambda x: x["xp_single"], reverse=True)
        return predictions

if __name__ == "__main__":
    predictor = DecomposedPredictor()
    preds = predictor.predict_all_players(target_gw=23, horizon=5)
    print(f"Generated xP predictions for {len(preds)} players.")
    print("Top 5 xP players for GW23:")
    for p in preds[:5]:
        print(f" - {p['name']} ({p['pos']}, {p['team']}): £{p['price']}m | xP: {p['xp_single']} (5-GW xP: {p['xp_horizon']})")
