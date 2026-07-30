import sys
import http.server
import socketserver
import json
import urllib.parse
from pathlib import Path
import re

ROOT_DIR = Path(__file__).parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from models.decomposed_predictor import DecomposedPredictor
from solver.milp_solver import MILPSolver

PORT = 8000
ROOT_DIR = Path(__file__).parent.parent
predictor = DecomposedPredictor()
solver = MILPSolver(predictor)

class FPLAPIHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve root files from ROOT_DIR
        parsed = urllib.parse.urlparse(path).path
        return str(ROOT_DIR / parsed.lstrip("/"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        
        if path == "/" or path == "" or path == "/FPL%20Research%20Console.dc.html" or path == "/FPL Research Console.dc.html":
            html_path = ROOT_DIR / "FPL Research Console.dc.html"
            with open(html_path, "r", encoding="utf-8") as f:
                html = f.read()
            
            # Fetch real data for injection
            horizon = 5
            try:
                # Attempt to read horizon from query params if requested
                if 'horizon' in query:
                    horizon = int(query['horizon'][0])
            except:
                pass
                
            solve_res = solver.solve(budget=100.0, horizon=horizon, target_gw=23)
            players = predictor.predict_all_players(target_gw=23, horizon=horizon)
            
            raw_js = "RAW = [\n"
            for p in players:
                raw_js += f"    [{json.dumps(p['name'])}, {json.dumps(p['team'])}, {json.dumps(p['pos'])}, {p['price']}, {p['xp_single']}, {p['code']}],\n"
            raw_js += "  ];"
            
            squad_ids = [str(p['name']).lower().replace(' ', '-') for p in solve_res['squad_full']]
            squad_js = f"SQUAD = {json.dumps(squad_ids)};"
            
            html = re.sub(r'RAW\s*=\s*\[.*?\];', lambda m: raw_js, html, flags=re.DOTALL)
            html = re.sub(r'SQUAD\s*=\s*\[.*?\];', lambda m: squad_js, html, flags=re.DOTALL)
            
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/bootstrap":
            self.send_json_response({
                "status": "ok",
                "gw": 23,
                "deadline": "Sat 2 Jan 11:00 UK",
                "run_id": "r-2026-gw23-01",
                "snapshot": "snap-20260730-utc"
            })
            return

        elif path == "/api/squad/consensus":
            horizon = int(query.get("horizon", [5])[0])
            budget = float(query.get("budget", [100.0])[0])
            solve_res = solver.solve(budget=budget, horizon=horizon, target_gw=23)
            self.send_json_response(solve_res)
            return

        elif path == "/api/models/leaderboard":
            self.send_json_response({
                "models": [
                    {"id": "stack", "name": "Stacking Meta-Learner", "spearman": 0.642, "crps": 1.12, "pts_gw": 62.4, "color": "oklch(.82 .12 196)"},
                    {"id": "lgbm", "name": "LightGBM Quantile", "spearman": 0.618, "crps": 1.21, "pts_gw": 59.8, "color": "oklch(.78 .14 140)"},
                    {"id": "bayes", "name": "Hierarchical Bayesian", "spearman": 0.605, "crps": 1.18, "pts_gw": 58.9, "color": "oklch(.75 .13 50)"},
                    {"id": "chronos", "name": "TimesFM / Chronos-2", "spearman": 0.542, "crps": 1.45, "pts_gw": 52.1, "color": "oklch(.72 .13 250)"},
                    {"id": "ep_next", "name": "FPL API ep_next (Baseline)", "spearman": 0.510, "crps": 1.52, "pts_gw": 49.3, "color": "oklch(.60 .05 0)"}
                ]
            })
            return

        # Default static file handler
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/planner/solve":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8')) if body else {}
            horizon = data.get("horizon", 5)
            budget = data.get("budget", 100.0)
            solve_res = solver.solve(budget=budget, horizon=horizon, target_gw=23)
            self.send_json_response(solve_res)
            return
        
        self.send_error(404, "Endpoint not found")

    def send_json_response(self, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

def main():
    print(f"Starting FPL 2026/27 Engine Server on http://localhost:{PORT}...")
    with socketserver.TCPServer(("", PORT), FPLAPIHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    main()
