"""Runtime configuration.

Everything that could differ between a laptop and a deployment lives here and is
overridable by environment variable. No secret has a default value: a missing
key makes the corresponding data source report `unconfigured` to the UI rather
than silently producing numbers.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

DB_PATH = Path(os.environ.get("FPL_DB_PATH", ROOT_DIR / "fpl_engine.db"))
SCHEMA_PATH = BACKEND_DIR / "db" / "schema.sql"
CACHE_DIR = Path(os.environ.get("FPL_CACHE_DIR", ROOT_DIR / ".cache"))
PHOTO_CACHE_DIR = CACHE_DIR / "photos"

CURRENT_SEASON = os.environ.get("FPL_SEASON", "2026/27")
# The season whose completed aggregates the priors are learned from.
PRIOR_SEASON = os.environ.get("FPL_PRIOR_SEASON", "2025/26")

# --- FPL public API ---------------------------------------------------------
FPL_BASE = "https://fantasy.premierleague.com/api"
FPL_BOOTSTRAP_URL = f"{FPL_BASE}/bootstrap-static/"
FPL_FIXTURES_URL = f"{FPL_BASE}/fixtures/"
FPL_ELEMENT_SUMMARY_URL = f"{FPL_BASE}/element-summary/{{player_id}}/"
FPL_ENTRY_URL = f"{FPL_BASE}/entry/{{entry_id}}/"
FPL_ENTRY_PICKS_URL = f"{FPL_BASE}/entry/{{entry_id}}/event/{{event_id}}/picks/"
FPL_USER_AGENT = os.environ.get(
    "FPL_USER_AGENT",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
)
HTTP_TIMEOUT = float(os.environ.get("FPL_HTTP_TIMEOUT", "20"))

# --- Player imagery ---------------------------------------------------------
# The Premier League photo CDN has changed its path scheme several times. Rather
# than guess one, the resolver walks these in order and caches the first hit;
# the client-side component walks the same list so images render even when the
# backend has no outbound network.
PHOTO_CANDIDATES = (
    "https://resources.premierleague.com/premierleague26/photos/players/{size}/{code}.png",
    "https://resources.premierleague.com/premierleague25/photos/players/{size}/{code}.png",
    "https://resources.premierleague.com/premierleague/photos/players/{size}/p{code}.png",
    "https://resources.premierleague.com/premierleague/photos/players/{size}/{code}.png",
)
PHOTO_SIZES = {"sm": "110x140", "md": "250x250", "lg": "250x250"}
BADGE_CANDIDATES = (
    "https://resources.premierleague.com/premierleague26/badges/{size}/t{code}.png",
    "https://resources.premierleague.com/premierleague25/badges/{size}/t{code}.png",
    "https://resources.premierleague.com/premierleague/badges/{size}/t{code}.png",
)

# --- Advanced sources (opt-in via env) --------------------------------------
ODDS_API_KEY = os.environ.get("ODDS_API_KEY")
ODDS_API_BASE = os.environ.get("ODDS_API_BASE", "https://api.the-odds-api.com/v4")
ODDS_REGIONS = os.environ.get("ODDS_REGIONS", "uk,eu")
ODDS_BOOKMAKERS = os.environ.get("ODDS_BOOKMAKERS", "pinnacle,betfair_ex_uk")
ODDS_SPORT_KEY = os.environ.get("ODDS_SPORT_KEY", "soccer_epl")

FBREF_LEAGUE = os.environ.get("FBREF_LEAGUE", "ENG-Premier League")
FBREF_SEASONS = os.environ.get("FBREF_SEASONS", "2526")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
NEWS_MODEL = os.environ.get("FPL_NEWS_MODEL", "claude-opus-5")
X_BEARER_TOKEN = os.environ.get("X_BEARER_TOKEN")
NEWS_SOURCES = [
    s.strip()
    for s in os.environ.get(
        "FPL_NEWS_SOURCES",
        "BenDinnery,PhysioRoom,FPLHarry,OfficialFPL",
    ).split(",")
    if s.strip()
]

# --- Modelling defaults -----------------------------------------------------
DEFAULT_HORIZON = int(os.environ.get("FPL_DEFAULT_HORIZON", "5"))
MAX_HORIZON = 12
BENCH_WEIGHTS = (0.28, 0.14, 0.06, 0.02)  # bench order 1..3 + reserve GK
SOLVER_TIME_LIMIT = int(os.environ.get("FPL_SOLVER_TIME_LIMIT", "25"))

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "FPL_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
    ).split(",")
    if o.strip()
]

FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
