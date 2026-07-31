-- =============================================================================
--  FPL Research Engine — relational schema
--  Point-in-time, append-only provenance. Every derived row is traceable to the
--  raw snapshot it was computed from, so nothing in the UI is unsourced.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 0. Provenance
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT    NOT NULL DEFAULT 'fpl',   -- fpl | fbref | odds | news
    endpoint    TEXT    NOT NULL,
    payload     TEXT    NOT NULL,                 -- verbatim JSON as received
    sha256      TEXT,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_snap_endpoint ON raw_snapshots(endpoint, captured_at DESC);

-- Every ingest attempt is logged, success or failure. The Data Sources page
-- reads this table directly: a source that has never landed shows as such
-- instead of being back-filled with invented numbers.
CREATE TABLE IF NOT EXISTS ingest_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT    NOT NULL,   -- fpl_bootstrap | fpl_fixtures | fpl_history | fbref | odds | news
    status       TEXT    NOT NULL,   -- ok | error | skipped | unconfigured | unreachable
    rows_written INTEGER DEFAULT 0,
    message      TEXT,
    started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ingest_source ON ingest_runs(source, started_at DESC);

-- -----------------------------------------------------------------------------
-- 1. Reference data
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id                     INTEGER PRIMARY KEY,
    code                   INTEGER UNIQUE NOT NULL,
    name                   TEXT NOT NULL,
    short_name             TEXT NOT NULL,
    pulse_id               INTEGER,
    strength               INTEGER,
    strength_overall_home  INTEGER,
    strength_overall_away  INTEGER,
    strength_attack_home   INTEGER,
    strength_attack_away   INTEGER,
    strength_defence_home  INTEGER,
    strength_defence_away  INTEGER,
    badge_url              TEXT,
    shirt_url              TEXT,
    primary_hex            TEXT,
    secondary_hex          TEXT,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS element_types (
    id                 INTEGER PRIMARY KEY,
    singular_name      TEXT NOT NULL,
    singular_name_short TEXT NOT NULL,
    plural_name        TEXT NOT NULL,
    squad_select       INTEGER,
    squad_min_play     INTEGER,
    squad_max_play     INTEGER,
    element_count      INTEGER
);

CREATE TABLE IF NOT EXISTS events (
    id                  INTEGER PRIMARY KEY,
    name                TEXT NOT NULL,
    deadline_time       TIMESTAMP,
    deadline_epoch      INTEGER,
    finished            BOOLEAN DEFAULT 0,
    data_checked        BOOLEAN DEFAULT 0,
    is_previous         BOOLEAN DEFAULT 0,
    is_current          BOOLEAN DEFAULT 0,
    is_next             BOOLEAN DEFAULT 0,
    average_entry_score INTEGER,
    highest_score       INTEGER,
    most_selected       INTEGER,
    most_captained      INTEGER,
    top_element         INTEGER,
    transfers_made      INTEGER,
    chip_plays_json     TEXT
);

CREATE TABLE IF NOT EXISTS chips (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    number       INTEGER,
    chip_type    TEXT,
    start_event  INTEGER,
    stop_event   INTEGER
);

-- Scoring rules and squad rules exactly as published by the game. The points
-- model reads these rather than hardcoding a rulebook, so a mid-season rule
-- change propagates on the next ingest.
CREATE TABLE IF NOT EXISTS game_config (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id                            INTEGER PRIMARY KEY,
    code                          INTEGER UNIQUE NOT NULL,
    first_name                    TEXT NOT NULL,
    second_name                   TEXT NOT NULL,
    web_name                      TEXT NOT NULL,
    known_name                    TEXT,
    team_id                       INTEGER NOT NULL,
    team_code                     INTEGER NOT NULL,
    element_type                  INTEGER NOT NULL,   -- 1 GKP 2 DEF 3 MID 4 FWD
    now_cost                      INTEGER NOT NULL,   -- tenths of £m
    cost_change_start             INTEGER DEFAULT 0,
    cost_change_event             INTEGER DEFAULT 0,
    status                        TEXT,               -- a d i n s u
    chance_of_playing_this_round  INTEGER,
    chance_of_playing_next_round  INTEGER,
    news                          TEXT,
    news_added                    TIMESTAMP,
    selected_by_percent           REAL,
    form                          REAL,
    points_per_game               REAL,
    ep_next                       REAL,
    ep_this                       REAL,
    transfers_in_event            INTEGER DEFAULT 0,
    transfers_out_event           INTEGER DEFAULT 0,
    dreamteam_count               INTEGER DEFAULT 0,
    birth_date                    TEXT,
    region                        INTEGER,
    squad_number                  INTEGER,
    opta_code                     TEXT,
    photo                         TEXT,               -- "154561.jpg" as served by FPL
    photo_url                     TEXT,               -- resolved 110x140
    photo_hd_url                  TEXT,               -- resolved 250x250
    penalties_order               INTEGER,
    corners_order                 INTEGER,
    direct_fk_order               INTEGER,
    can_select                    BOOLEAN DEFAULT 1,
    updated_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS ix_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS ix_players_type ON players(element_type);

-- -----------------------------------------------------------------------------
-- 2. Observed performance
-- -----------------------------------------------------------------------------
-- Season aggregates exactly as reported by the FPL API, plus per-90 rates
-- derived from them (minutes-normalised, no smoothing applied here).
CREATE TABLE IF NOT EXISTS player_season_stats (
    player_id                    INTEGER NOT NULL,
    season                       TEXT NOT NULL,
    minutes                      INTEGER DEFAULT 0,
    starts                       INTEGER DEFAULT 0,
    total_points                 INTEGER DEFAULT 0,
    goals_scored                 INTEGER DEFAULT 0,
    assists                      INTEGER DEFAULT 0,
    clean_sheets                 INTEGER DEFAULT 0,
    goals_conceded               INTEGER DEFAULT 0,
    own_goals                    INTEGER DEFAULT 0,
    penalties_saved              INTEGER DEFAULT 0,
    penalties_missed             INTEGER DEFAULT 0,
    yellow_cards                 INTEGER DEFAULT 0,
    red_cards                    INTEGER DEFAULT 0,
    saves                        INTEGER DEFAULT 0,
    bonus                        INTEGER DEFAULT 0,
    bps                          INTEGER DEFAULT 0,
    influence                    REAL DEFAULT 0,
    creativity                   REAL DEFAULT 0,
    threat                       REAL DEFAULT 0,
    ict_index                    REAL DEFAULT 0,
    defensive_contribution       INTEGER DEFAULT 0,
    clearances_blocks_interceptions INTEGER DEFAULT 0,
    recoveries                   INTEGER DEFAULT 0,
    tackles                      INTEGER DEFAULT 0,
    expected_goals               REAL DEFAULT 0,
    expected_assists             REAL DEFAULT 0,
    expected_goal_involvements   REAL DEFAULT 0,
    expected_goals_conceded      REAL DEFAULT 0,
    xg90                         REAL DEFAULT 0,
    xa90                         REAL DEFAULT 0,
    xgi90                        REAL DEFAULT 0,
    xgc90                        REAL DEFAULT 0,
    saves90                      REAL DEFAULT 0,
    cs90                         REAL DEFAULT 0,
    defcon90                     REAL DEFAULT 0,
    bps90                        REAL DEFAULT 0,
    pts90                        REAL DEFAULT 0,
    starts_per_90                REAL DEFAULT 0,
    PRIMARY KEY (player_id, season),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS fixtures (
    id                 INTEGER PRIMARY KEY,
    code               INTEGER,
    event              INTEGER,
    team_h             INTEGER NOT NULL,
    team_a             INTEGER NOT NULL,
    team_h_difficulty  INTEGER,
    team_a_difficulty  INTEGER,
    kickoff_time       TIMESTAMP,
    started            BOOLEAN DEFAULT 0,
    finished           BOOLEAN DEFAULT 0,
    minutes            INTEGER DEFAULT 0,
    team_h_score       INTEGER,
    team_a_score       INTEGER,
    stats_json         TEXT,
    FOREIGN KEY (team_h) REFERENCES teams(id),
    FOREIGN KEY (team_a) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS ix_fixtures_event ON fixtures(event);
CREATE INDEX IF NOT EXISTS ix_fixtures_teams ON fixtures(team_h, team_a);

-- Per-gameweek player history (FPL element-summary). Empty until a season is
-- under way; the models detect row count and fall back to season aggregates.
CREATE TABLE IF NOT EXISTS element_gameweeks (
    player_id       INTEGER NOT NULL,
    event_id        INTEGER NOT NULL,
    fixture_id      INTEGER,
    opponent_team   INTEGER,
    was_home        BOOLEAN,
    minutes         INTEGER DEFAULT 0,
    starts          INTEGER DEFAULT 0,
    goals_scored    INTEGER DEFAULT 0,
    assists         INTEGER DEFAULT 0,
    clean_sheets    INTEGER DEFAULT 0,
    goals_conceded  INTEGER DEFAULT 0,
    own_goals       INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,
    yellow_cards    INTEGER DEFAULT 0,
    red_cards       INTEGER DEFAULT 0,
    saves           INTEGER DEFAULT 0,
    bonus           INTEGER DEFAULT 0,
    bps             INTEGER DEFAULT 0,
    influence       REAL DEFAULT 0,
    creativity      REAL DEFAULT 0,
    threat          REAL DEFAULT 0,
    ict_index       REAL DEFAULT 0,
    expected_goals  REAL DEFAULT 0,
    expected_assists REAL DEFAULT 0,
    expected_goal_involvements REAL DEFAULT 0,
    expected_goals_conceded REAL DEFAULT 0,
    defensive_contribution INTEGER DEFAULT 0,
    value           INTEGER,
    selected        INTEGER,
    total_points    INTEGER DEFAULT 0,
    as_of           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, event_id, fixture_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- -----------------------------------------------------------------------------
-- 3. Advanced external sources
-- -----------------------------------------------------------------------------
-- FBref / Understat underlying metrics via the `soccerdata` library.
CREATE TABLE IF NOT EXISTS fbref_player_stats (
    player_id        INTEGER,
    fbref_name       TEXT NOT NULL,
    fbref_id         TEXT,
    season           TEXT NOT NULL,
    league           TEXT NOT NULL,
    team             TEXT,
    position         TEXT,
    minutes_90s      REAL,
    npxg             REAL,
    npxg_per_90      REAL,
    xa               REAL,
    xa_per_90        REAL,
    sca_per_90       REAL,   -- shot-creating actions
    gca_per_90       REAL,   -- goal-creating actions
    key_passes_per_90 REAL,
    shots_per_90     REAL,
    shots_on_target_per_90 REAL,
    touches_att_pen_per_90 REAL,
    prog_carries_per_90 REAL,
    prog_passes_rec_per_90 REAL,
    tackles_per_90   REAL,
    interceptions_per_90 REAL,
    blocks_per_90    REAL,
    clearances_per_90 REAL,
    match_confidence REAL,   -- name-match confidence 0..1
    captured_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fbref_name, season, league)
);
CREATE INDEX IF NOT EXISTS ix_fbref_player ON fbref_player_stats(player_id);

-- Bookmaker markets. `implied_prob` is de-vigged across the market where the
-- full book is available, otherwise it is the raw 1/price.
CREATE TABLE IF NOT EXISTS odds_markets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    provider      TEXT NOT NULL,      -- pinnacle | betfair_ex_uk | ...
    aggregator    TEXT NOT NULL,      -- the-odds-api
    market        TEXT NOT NULL,      -- h2h | totals | clean_sheet | anytime_goalscorer
    event_id      INTEGER,            -- FPL gameweek
    fixture_id    INTEGER,
    team_id       INTEGER,
    player_id     INTEGER,
    selection     TEXT NOT NULL,
    line          REAL,
    price_decimal REAL NOT NULL,
    implied_prob  REAL,
    devigged      BOOLEAN DEFAULT 0,
    commence_time TIMESTAMP,
    captured_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_odds_lookup ON odds_markets(market, event_id, player_id, team_id, captured_at DESC);

-- Raw beat-reporter / press-conference text kept verbatim next to the
-- structured extraction so any override can be audited back to its source.
CREATE TABLE IF NOT EXISTS news_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT NOT NULL,       -- x/twitter handle, club site, presser
    author       TEXT,
    url          TEXT,
    published_at TIMESTAMP,
    text         TEXT NOT NULL,
    sha256       TEXT UNIQUE,
    captured_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_player_links (
    news_id   INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    PRIMARY KEY (news_id, player_id),
    FOREIGN KEY (news_id) REFERENCES news_items(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- LLM-extracted availability, overriding the (often stale) FPL flag.
CREATE TABLE IF NOT EXISTS availability_overrides (
    player_id         INTEGER NOT NULL,
    event_id          INTEGER NOT NULL,
    start_probability REAL NOT NULL,     -- 0..1
    minutes_estimate  REAL,
    injury_status     TEXT,
    confidence        REAL,              -- 0..1 self-reported by extractor
    rationale         TEXT,
    model             TEXT,              -- e.g. claude-*
    source_news_ids   TEXT,              -- JSON array of news_items.id
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, event_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- -----------------------------------------------------------------------------
-- 4. Modelling
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_registry (
    model_id    TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    family      TEXT NOT NULL,      -- gbm | bayes | baseline | ensemble | market
    description TEXT,
    hue         REAL                -- OKLCH hue used consistently in the UI
);

CREATE TABLE IF NOT EXISTS model_runs (
    run_id        TEXT PRIMARY KEY,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    target_event  INTEGER NOT NULL,
    horizon       INTEGER NOT NULL,
    season        TEXT,
    snapshot_id   INTEGER,
    n_players     INTEGER,
    n_train_rows  INTEGER,
    config_json   TEXT,
    status        TEXT DEFAULT 'ok',
    duration_ms   INTEGER,
    FOREIGN KEY (snapshot_id) REFERENCES raw_snapshots(id)
);

-- Measured only. Every row here is the output of an actual evaluation loop on
-- held-out folds; nothing is hand-entered.
CREATE TABLE IF NOT EXISTS model_metrics (
    run_id   TEXT NOT NULL,
    model_id TEXT NOT NULL,
    metric   TEXT NOT NULL,      -- spearman | mae | rmse | crps | r2 | pinball_p10 ...
    scope    TEXT NOT NULL,      -- cv | fold_0 | holdout | position:MID ...
    value    REAL NOT NULL,
    n        INTEGER,
    PRIMARY KEY (run_id, model_id, metric, scope),
    FOREIGN KEY (run_id) REFERENCES model_runs(run_id)
);

CREATE TABLE IF NOT EXISTS calibration_bins (
    run_id      TEXT NOT NULL,
    model_id    TEXT NOT NULL,
    bin_index   INTEGER NOT NULL,
    pred_lo     REAL,
    pred_hi     REAL,
    pred_mean   REAL,
    actual_mean REAL,
    n           INTEGER,
    PRIMARY KEY (run_id, model_id, bin_index)
);

CREATE TABLE IF NOT EXISTS feature_importance (
    run_id   TEXT NOT NULL,
    model_id TEXT NOT NULL,
    feature  TEXT NOT NULL,
    gain     REAL,
    split    INTEGER,
    PRIMARY KEY (run_id, model_id, feature)
);

-- One row per (player, gameweek, model). Component columns make the xP
-- decomposition in the UI a read rather than a re-derivation.
CREATE TABLE IF NOT EXISTS predictions (
    run_id        TEXT NOT NULL,
    model_id      TEXT NOT NULL,
    player_id     INTEGER NOT NULL,
    event_id      INTEGER NOT NULL,
    fixture_id    INTEGER,
    opponent_id   INTEGER,
    was_home      BOOLEAN,
    difficulty    INTEGER,
    xp_mean       REAL NOT NULL,
    xp_p10        REAL,
    xp_p25        REAL,
    xp_p50        REAL,
    xp_p75        REAL,
    xp_p90        REAL,
    xp_std        REAL,
    p_appear      REAL,
    p_start       REAL,
    exp_minutes   REAL,
    exp_goals     REAL,
    exp_assists   REAL,
    p_clean_sheet REAL,
    p_goal        REAL,
    p_assist      REAL,
    p_return      REAL,          -- P(>=1 goal or assist)
    p_haul        REAL,          -- P(points >= 10)
    p_blank       REAL,          -- P(points <= 2)
    exp_bonus     REAL,
    exp_saves     REAL,
    exp_defcon    REAL,
    pts_appearance REAL,
    pts_goals     REAL,
    pts_assists   REAL,
    pts_clean_sheet REAL,
    pts_saves     REAL,
    pts_defcon    REAL,
    pts_bonus     REAL,
    pts_negative  REAL,
    pmf_json      TEXT,          -- discrete points distribution
    explain_json  TEXT,          -- per-feature contributions (LightGBM)
    PRIMARY KEY (run_id, model_id, player_id, event_id),
    FOREIGN KEY (run_id) REFERENCES model_runs(run_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);
CREATE INDEX IF NOT EXISTS ix_pred_lookup ON predictions(run_id, model_id, event_id, xp_mean DESC);
CREATE INDEX IF NOT EXISTS ix_pred_player ON predictions(player_id, run_id, model_id);

CREATE TABLE IF NOT EXISTS feature_rows (
    run_id     TEXT NOT NULL,
    player_id  INTEGER NOT NULL,
    event_id   INTEGER NOT NULL,
    features_json TEXT NOT NULL,
    PRIMARY KEY (run_id, player_id, event_id)
);

-- -----------------------------------------------------------------------------
-- 5. Optimisation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimization_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    solve_id       TEXT UNIQUE NOT NULL,
    run_id         TEXT NOT NULL,
    model_id       TEXT NOT NULL,
    target_event   INTEGER NOT NULL,
    horizon        INTEGER NOT NULL,
    budget         REAL NOT NULL,
    free_transfers INTEGER DEFAULT 1,
    bench_weights  TEXT,
    chips_allowed  TEXT,
    objective      REAL NOT NULL,
    squad_json     TEXT NOT NULL,
    xi_json        TEXT NOT NULL,
    bench_json     TEXT NOT NULL,
    captain_id     INTEGER,
    vice_id        INTEGER,
    transfers_json TEXT,
    binding_json   TEXT,          -- constraint slack / shadow prices
    solver_status  TEXT,
    solve_ms       INTEGER,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES model_runs(run_id)
);

CREATE TABLE IF NOT EXISTS user_squads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,
    entry_id    INTEGER,
    event_id    INTEGER,
    squad_json  TEXT NOT NULL,
    bank        REAL DEFAULT 0,
    free_transfers INTEGER DEFAULT 1,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
