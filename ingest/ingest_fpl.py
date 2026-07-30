import sqlite3
import urllib.request
import json
import os
import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "fpl_engine.db"
SCHEMA_PATH = Path(__file__).parent.parent / "db" / "schema.sql"

FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
FPL_FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/"

def init_db(conn):
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    conn.executescript(schema_sql)
    conn.commit()
    print("Database initialized successfully.")

def fetch_json(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))

def store_raw_snapshot(conn, endpoint, payload):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO raw_snapshots (endpoint, payload, captured_at) VALUES (?, ?, ?)",
        (endpoint, json.dumps(payload), datetime.datetime.utcnow().isoformat())
    )
    conn.commit()

def sync_teams(conn, teams_data):
    cur = conn.cursor()
    for t in teams_data:
        team_code = t["code"]
        badge_url = f"https://resources.premierleague.com/premierleague/badges/70/t{team_code}.png"
        cur.execute("""
            INSERT INTO teams (
                id, code, name, short_name, strength,
                strength_overall_home, strength_overall_away,
                strength_attack_home, strength_attack_away,
                strength_defence_home, strength_defence_away, badge_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                name=excluded.name,
                short_name=excluded.short_name,
                strength=excluded.strength,
                badge_url=excluded.badge_url
        """, (
            t["id"], t["code"], t["name"], t["short_name"], t["strength"],
            t.get("strength_overall_home", 0), t.get("strength_overall_away", 0),
            t.get("strength_attack_home", 0), t.get("strength_attack_away", 0),
            t.get("strength_defence_home", 0), t.get("strength_defence_away", 0),
            badge_url
        ))
    conn.commit()
    print(f"Synced {len(teams_data)} teams with badge URLs.")

def sync_players(conn, elements_data):
    cur = conn.cursor()
    for p in elements_data:
        code = p["code"]
        photo_name = p.get("photo", "").replace(".jpg", ".png")
        photo_url = f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{code}.png"
        photo_hd_url = f"https://resources.premierleague.com/premierleague/photos/players/250x250/p{code}.png"
        
        cur.execute("""
            INSERT INTO players (
                id, code, first_name, second_name, web_name,
                team_code, element_type, now_cost, photo_url, photo_hd_url,
                status, chance_of_playing_next_round
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                web_name=excluded.web_name,
                team_code=excluded.team_code,
                element_type=excluded.element_type,
                now_cost=excluded.now_cost,
                photo_url=excluded.photo_url,
                photo_hd_url=excluded.photo_hd_url,
                status=excluded.status,
                chance_of_playing_next_round=excluded.chance_of_playing_next_round
        """, (
            p["id"], p["code"], p["first_name"], p["second_name"], p["web_name"],
            p["team_code"], p["element_type"], p["now_cost"],
            photo_url, photo_hd_url, p.get("status"), p.get("chance_of_playing_next_round")
        ))
    conn.commit()
    print(f"Synced {len(elements_data)} players with HD asset URLs.")

def sync_fixtures(conn, fixtures_data):
    cur = conn.cursor()
    for f in fixtures_data:
        cur.execute("""
            INSERT INTO fixtures (
                id, event, team_h, team_a, team_h_difficulty, team_a_difficulty,
                kickoff_time, finished, team_h_score, team_a_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                event=excluded.event,
                finished=excluded.finished,
                team_h_score=excluded.team_h_score,
                team_a_score=excluded.team_a_score
        """, (
            f["id"], f.get("event"), f["team_h"], f["team_a"],
            f.get("team_h_difficulty"), f.get("team_a_difficulty"),
            f.get("kickoff_time"), f.get("finished", False),
            f.get("team_h_score"), f.get("team_a_score")
        ))
    conn.commit()
    print(f"Synced {len(fixtures_data)} fixtures.")

def main():
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    print("Fetching live bootstrap-static from FPL API...")
    bootstrap = fetch_json(FPL_BOOTSTRAP_URL)
    store_raw_snapshot(conn, "bootstrap-static", bootstrap)
    
    sync_teams(conn, bootstrap["teams"])
    sync_players(conn, bootstrap["elements"])

    print("Fetching live fixtures from FPL API...")
    fixtures = fetch_json(FPL_FIXTURES_URL)
    store_raw_snapshot(conn, "fixtures", fixtures)
    sync_fixtures(conn, fixtures)

    conn.close()
    print("Ingestion complete.")

if __name__ == "__main__":
    main()
