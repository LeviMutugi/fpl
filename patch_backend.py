import re
import json

app_path = r'd:\Shi\my_shi\Skepsi\fpl\fpl\server\app.py'
with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

injection_code = """
        if parsed == "/" or parsed == "" or parsed == "/FPL%20Research%20Console.dc.html" or parsed == "/FPL Research Console.dc.html":
            html_path = ROOT_DIR / "FPL Research Console.dc.html"
            with open(html_path, "r", encoding="utf-8") as f:
                html = f.read()
            
            # Fetch real data for injection
            horizon = 5
            try:
                # Attempt to read horizon from query params if requested
                query_horizon = urllib.parse.parse_qs(parsed).get('horizon', [5])[0]
                horizon = int(query_horizon)
            except:
                pass
                
            solve_res = solver.solve(budget=100.0, horizon=horizon, target_gw=23)
            players = predictor.predict_all_players(target_gw=23, horizon=horizon)
            
            raw_js = "RAW = [\\n"
            for p in players[:150]:
                raw_js += f"    [{json.dumps(p['name'])}, {json.dumps(p['team'])}, {json.dumps(p['pos'])}, {p['price']}, {p['xp_single']}, {p['code']}],\\n"
            raw_js += "  ];"
            
            squad_ids = [str(p['name']).lower().replace(' ', '-') for p in solve_res['squad_full']]
            squad_js = f"SQUAD = {json.dumps(squad_ids)};"
            
            html = re.sub(r'RAW\s*=\s*\[.*?\];', raw_js, html, flags=re.DOTALL)
            html = re.sub(r'SQUAD\s*=\s*\[.*?\];', squad_js, html, flags=re.DOTALL)
            
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
"""

# Replace the existing handler for the root path
target_code = """
        if parsed == "/" or parsed == "":
            return str(ROOT_DIR / "FPL Research Console.dc.html")
"""

content = content.replace(target_code, injection_code.lstrip('\n'))

# Ensure we import re if it's not already imported in app.py
if 'import re' not in content:
    content = content.replace('import sys\n', 'import sys\nimport re\n')

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("app.py updated to inject real API data via SSR.")
