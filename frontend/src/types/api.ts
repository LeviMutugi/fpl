/**
 * Types transcribed from docs/API_CONTRACT.md.
 *
 * Conventions that matter to every component in this codebase:
 *  - money is £m as a float (4.5), never tenths;
 *  - `null` means "absent" and must render as an explicit no-data state —
 *    never 0, never an em-dash standing in for a number.
 */

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type ApiError = { error: string; detail: string; hint?: string };

/* -------------------------------------------------------------- meta ------ */

export type SourceStatus =
  | 'ok'
  | 'error'
  | 'unreachable'
  | 'unconfigured'
  | 'never'
  | 'partial'
  | 'running';

export type DataFreshness = {
  source: string;
  status: SourceStatus;
  last_success: string | null;
  rows: number;
  message: string | null;
};

export type RunInfo = {
  run_id: string;
  created_at: string;
  target_event: number;
  horizon: number;
  snapshot_captured_at: string | null;
  n_players: number;
  n_train_rows: number;
  models: string[];
  season: string | null;
  season_source: string;
  history_rows: number;
  duration_ms: number | null;
  /** Non-negative least squares blend weights, keyed by model id. */
  stack_weights: Record<string, number>;
  /** Stated modelling assumptions — home/away factors, priors, scoring rules. */
  assumptions: Record<string, unknown>;
  /** Gradient-boosted model config: features used, features excluded and why. */
  gbm: Record<string, unknown>;
  /** Target, scheme, n, and the notes on what the metrics do and don't measure. */
  evaluation: Record<string, unknown>;
  defensive_contribution_available: boolean | null;
};

export type EventInfo = {
  id: number;
  name: string;
  deadline_time: string | null;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  average_entry_score: number | null;
};

export type Meta = {
  season: string;
  prior_season: string;
  current_event: number | null;
  next_event: number | null;
  next_deadline: string | null;
  events: EventInfo[];
  counts: {
    players: number;
    teams: number;
    fixtures: number;
    gameweek_rows: number;
    predictions: number;
  };
  data_freshness: DataFreshness[];
  active_run: RunInfo | null;
  total_fpl_players: number | null;
};

/* ------------------------------------------------------------- teams ------ */

export type Team = {
  id: number;
  code: number;
  name: string;
  short_name: string;
  badge_url: string;
  shirt_url: string;
  primary_hex: string;
  secondary_hex: string;
  strength: number | null;
  strength_overall_home: number | null;
  strength_overall_away: number | null;
  strength_attack_home: number | null;
  strength_attack_away: number | null;
  strength_defence_home: number | null;
  strength_defence_away: number | null;
  strength_source: 'api' | 'derived';
  xg_per_match: number | null;
  xgc_per_match: number | null;
};

export type TeamRef = {
  id: number;
  code?: number;
  name?: string;
  short_name: string;
};

/* ----------------------------------------------------------- players ------ */

export type PlayerPhoto = { sm: string; md: string; candidates: string[] };

export type Availability = {
  p_start: number | null;
  source: 'fpl' | 'news_agent' | 'none';
  injury_status: string | null;
  rationale: string | null;
};

export type SeasonStats = {
  season: string;
  minutes: number;
  starts: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  bps: number;
  saves: number;
  xg: number;
  xa: number;
  xgi: number;
  xgc: number;
  xg90: number;
  xa90: number;
  xgi90: number;
  xgc90: number;
  defcon90: number;
  bps90: number;
  pts90: number;
  total_points: number;
  goals_conceded: number;
  yellow_cards: number;
  red_cards: number;
  defensive_contribution: number;
  ict_index: number;
  threat: number;
  creativity: number;
  influence: number;
};

export type PredictionComponents = {
  appearance: number;
  goals: number;
  assists: number;
  clean_sheet: number;
  saves: number;
  defcon: number;
  bonus: number;
  negative: number;
};

export type PredictionFixture = {
  opponent: string | null;
  opponent_id: number | null;
  is_home: boolean | null;
  difficulty: number | null;
  kickoff: string | null;
  count: number;
};

export type Prediction = {
  model_id: string;
  event: number;
  xp: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  std: number;
  p_appear: number;
  p_start: number;
  exp_minutes: number;
  exp_goals: number;
  exp_assists: number;
  p_clean_sheet: number;
  p_goal: number;
  p_assist: number;
  p_return: number;
  p_haul: number;
  p_blank: number;
  exp_bonus: number;
  exp_saves: number;
  exp_defcon: number;
  components: PredictionComponents;
  fixture: PredictionFixture;
};

export type HorizonEvent = {
  event: number;
  xp: number;
  opponent: string | null;
  is_home: boolean | null;
  difficulty: number | null;
};

export type PlayerHorizon = {
  from_event: number;
  to_event: number;
  xp_total: number;
  per_event: HorizonEvent[];
};

export type PlayerRow = {
  id: number;
  code: number;
  web_name: string;
  full_name: string;
  team_id: number;
  team: string;
  team_name: string;
  team_code: number;
  team_primary_hex: string | null;
  team_secondary_hex: string | null;
  position: Position;
  element_type: number;
  price: number;
  price_change_start: number;
  photo: PlayerPhoto;
  status: string;
  news: string | null;
  chance_of_playing: number | null;
  availability: Availability;
  ownership: number | null;
  form: number | null;
  points_per_game: number | null;
  total_points: number | null;
  ep_next: number | null;
  news_added: string | null;
  dreamteam_count: number;
  transfers_in_event: number;
  transfers_out_event: number;
  season: SeasonStats | null;
  set_pieces: {
    penalties: number | null;
    corners: number | null;
    freekicks: number | null;
  };
  prediction: Prediction | null;
  horizon: PlayerHorizon | null;
  value_per_million: number | null;
};

export type PlayerFixture = {
  event: number;
  opponent: string;
  opponent_id: number;
  is_home: boolean;
  difficulty: number;
  kickoff: string | null;
  xp: number | null;
};

export type PlayerDetail = PlayerRow & {
  pmf: { points: number; prob: number }[];
  explain: { feature: string; contribution: number; value: number }[];
  model_spread: { model_id: string; name: string; xp: number }[];
  fixtures: PlayerFixture[];
  fbref: Record<string, number> | null;
  odds: {
    market: string;
    selection: string;
    price: number;
    implied_prob: number;
    provider: string;
    captured_at: string;
  }[];
  /** Named apart from `news`, which is the FPL flag text on every player row. */
  news_reports: {
    source: string;
    author: string | null;
    published_at: string | null;
    text: string;
    url: string | null;
  }[];
  gameweek_history: {
    event: number;
    minutes: number;
    total_points: number;
    opponent: string | null;
    was_home: boolean | null;
    xg: number;
    xa: number;
    bps: number;
  }[];
};

/* ---------------------------------------------------------- fixtures ------ */

export type FixtureRow = {
  id: number;
  event: number | null;
  kickoff: string | null;
  home: TeamRef;
  away: TeamRef;
  home_difficulty: number;
  away_difficulty: number;
  finished: boolean;
  home_score: number | null;
  away_score: number | null;
};

export type FdrCellFixture = {
  opponent: string;
  opponent_id: number;
  is_home: boolean;
  difficulty: number;
  attack_index: number;
  defence_index: number;
};

export type FdrTeamRow = {
  team_id: number;
  short_name: string;
  primary_hex: string;
  cells: { event: number; fixtures: FdrCellFixture[] }[];
  attack_score: number;
  defence_score: number;
};

export type FdrGrid = {
  from_event: number;
  to_event: number;
  teams: FdrTeamRow[];
};

/* ------------------------------------------------------------ models ------ */

export type LeaderboardModel = {
  model_id: string;
  name: string;
  family: string;
  description: string;
  hue: number;
  metrics: Record<string, number>;
  available: boolean;
  /** Why this model has no metrics — shown instead of hiding the row. */
  unavailable_reason: string | null;
  /** Its share of the non-negative least squares blend, when it has one. */
  stack_weight: number | null;
};

export type Leaderboard = {
  run: RunInfo;
  evaluation: { target: string; scheme: string; n: number; note: string };
  models: LeaderboardModel[];
  calibration: {
    model_id: string;
    bins: { pred_mean: number; actual_mean: number; n: number }[];
  }[];
  importance: { model_id: string; features: { feature: string; gain: number }[] }[];
  disagreement: {
    player_id: number;
    web_name: string;
    team: string;
    position: string;
    spread: number;
    by_model: Record<string, number>;
  }[];
};

/* ---------------------------------------------------------- optimize ------ */

export type ChipName = 'none' | 'wildcard' | 'freehit' | 'bboost' | '3xc';

export type OptimizeRequest = {
  budget?: number;
  horizon?: number;
  model?: string;
  formation?: string | null;
  bench_weights?: number[];
  max_per_team?: number;
  locked_in?: number[];
  locked_out?: number[];
  existing_squad?: number[];
  free_transfers?: number;
  transfer_penalty?: number;
  chip?: ChipName;
};

export type SquadPlayer = PlayerRow & {
  role: 'xi' | 'bench';
  bench_order: number | null;
  is_captain: boolean;
  is_vice: boolean;
  pitch_slot: { row: number; col: number; of: number } | null;
};

export type OptimizeResponse = {
  solve_id: string;
  run_id: string;
  model_id: string;
  status: string;
  solve_ms: number;
  objective: number;
  squad_cost: number;
  bank: number;
  xi: SquadPlayer[];
  bench: SquadPlayer[];
  captain_id: number;
  vice_id: number;
  formation: string;
  xi_xp: number;
  bench_xp: number;
  total_xp: number;
  transfers: { out: SquadPlayer; in: SquadPlayer; delta_xp: number }[] | null;
  hits: number;
  binding: { constraint: string; slack: number; note: string }[];
  per_event: {
    event: number;
    xi_xp: number;
    captain: string | null;
    captain_code: number | null;
    captain_id: number;
    captain_bonus: number;
    bench_xp: number;
  }[];
  event: number;
  events: number[];
  pool_size: number;
  chip: ChipName;
  /** Solver caveats — candidate pool size, bench weights, sequencing limits. */
  notes: string[];
};
