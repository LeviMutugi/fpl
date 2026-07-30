-- FPL 2026/27 Point-in-Time Relational Database Schema

-- 1. Raw Snapshots (Append-Only for Data Leakage Prevention)
CREATE TABLE IF NOT EXISTS raw_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    payload TEXT NOT NULL,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Teams Reference Table
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    code INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    strength INTEGER,
    strength_overall_home INTEGER,
    strength_overall_away INTEGER,
    strength_attack_home INTEGER,
    strength_attack_away INTEGER,
    strength_defence_home INTEGER,
    strength_defence_away INTEGER,
    badge_url TEXT NOT NULL
);

-- 3. Players Reference Table
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    code INTEGER UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    second_name TEXT NOT NULL,
    web_name TEXT NOT NULL,
    team_code INTEGER NOT NULL,
    element_type INTEGER NOT NULL, -- 1: GKP, 2: DEF, 3: MID, 4: FWD
    now_cost INTEGER NOT NULL, -- in tenths (e.g. 100 = £10.0m)
    photo_url TEXT NOT NULL,
    photo_hd_url TEXT NOT NULL,
    status TEXT,
    chance_of_playing_next_round INTEGER,
    FOREIGN KEY (team_code) REFERENCES teams(code)
);

-- 4. Fixtures Table
CREATE TABLE IF NOT EXISTS fixtures (
    id INTEGER PRIMARY KEY,
    event INTEGER,
    team_h INTEGER NOT NULL,
    team_a INTEGER NOT NULL,
    team_h_difficulty INTEGER,
    team_a_difficulty INTEGER,
    kickoff_time TIMESTAMP,
    finished BOOLEAN DEFAULT FALSE,
    team_h_score INTEGER,
    team_a_score INTEGER,
    FOREIGN KEY (team_h) REFERENCES teams(id),
    FOREIGN KEY (team_a) REFERENCES teams(id)
);

-- 5. Gameweek Historical Stats (Point-in-Time)
CREATE TABLE IF NOT EXISTS element_gameweeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    element_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,
    influence REAL DEFAULT 0.0,
    creativity REAL DEFAULT 0.0,
    threat REAL DEFAULT 0.0,
    ict_index REAL DEFAULT 0.0,
    total_points INTEGER DEFAULT 0,
    as_of TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (element_id) REFERENCES players(id)
);

-- 6. Model Predictions Registry Table
CREATE TABLE IF NOT EXISTS model_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    element_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    model_id TEXT NOT NULL, -- e.g. 'lgbm_quantile', 'bayes_hierarchical', 'tsfm_ensemble'
    xp_mean REAL NOT NULL,
    xp_p10 REAL,
    xp_p50 REAL,
    xp_p90 REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (element_id) REFERENCES players(id)
);

-- 7. Optimization Solves & Decision Log
CREATE TABLE IF NOT EXISTS optimization_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT UNIQUE NOT NULL,
    horizon INTEGER NOT NULL, -- planning horizon (1-8 GWs)
    budget REAL NOT NULL,
    free_transfers INTEGER DEFAULT 1,
    chips_active TEXT, -- JSON array of active chips
    squad_json TEXT NOT NULL, -- JSON array of 15 players selected
    xi_json TEXT NOT NULL, -- JSON array of 11 starting players
    captain_id INTEGER NOT NULL,
    vice_captain_id INTEGER NOT NULL,
    total_xp REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
