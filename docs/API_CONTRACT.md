# FPL Research Engine — API contract

Base URL in development: `http://127.0.0.1:8010`. The Vite dev server proxies
`/api` there, so the frontend always calls relative paths (`/api/...`).

Every response that carries derived numbers also carries provenance: which model
run produced it, which snapshot that run read, and when that snapshot was
captured. The UI is expected to surface this rather than present numbers as
timeless.

## Conventions

- Money is in £m as a float (`4.5`), never in tenths.
- Positions are `GKP | DEF | MID | FWD`.
- `event` always means an FPL gameweek id (1–38).
- Probabilities are floats in `[0, 1]`.
- Absent data is `null`. It is never a zero, an em-dash, or a plausible-looking
  number. The frontend must render `null` as an explicit "no data" state.

## `GET /api/meta`

```ts
type Meta = {
  season: string;                 // "2026/27"
  prior_season: string;           // season the priors were learned from
  current_event: number | null;   // in-progress GW, null pre-season
  next_event: number | null;
  next_deadline: string | null;   // ISO 8601
  events: { id: number; name: string; deadline_time: string | null;
            finished: boolean; is_current: boolean; is_next: boolean;
            average_entry_score: number | null }[];
  counts: { players: number; teams: number; fixtures: number;
            gameweek_rows: number; predictions: number };
  data_freshness: {              // one entry per ingest source
    source: string;
    status: "ok" | "error" | "unreachable" | "unconfigured" | "never" | "partial" | "running";
    last_success: string | null;
    rows: number;
    message: string | null;
  }[];
  active_run: RunInfo | null;
  total_fpl_players: number | null; // "total_players" from bootstrap
};

type RunInfo = {
  run_id: string;
  created_at: string;
  target_event: number;
  horizon: number;
  snapshot_captured_at: string | null;
  n_players: number;
  n_train_rows: number;
  models: string[];
  season_source: string;    // e.g. "2025/26 season aggregates"
  history_rows: number;     // 0 => per-GW history not ingested
};
```

## `GET /api/teams`

```ts
type Team = {
  id: number; code: number; name: string; short_name: string;
  badge_url: string; shirt_url: string;
  primary_hex: string; secondary_hex: string;
  strength: number | null;
  strength_overall_home: number | null; strength_overall_away: number | null;
  strength_attack_home: number | null;  strength_attack_away: number | null;
  strength_defence_home: number | null; strength_defence_away: number | null;
  strength_source: "api" | "derived";  // derived => computed from squad xG/xGC
  xg_per_match: number | null; xgc_per_match: number | null;
};
```

## `GET /api/players`

Query: `event` (default = target event of active run), `position`, `team`,
`max_cost`, `min_minutes`, `search`, `sort` (`xp|xp_horizon|value|price|
ownership|form|xgi90|minutes`), `order`, `limit` (default 750), `offset`,
`model` (default `ensemble`), `horizon`.

```ts
type PlayerRow = {
  id: number; code: number; web_name: string; full_name: string;
  team_id: number; team: string; team_name: string;
  position: "GKP" | "DEF" | "MID" | "FWD"; element_type: number;
  price: number; price_change_start: number;
  photo: { sm: string; md: string; candidates: string[] }; // ordered fallbacks
  status: string; news: string | null;
  chance_of_playing: number | null;
  availability: {                       // merged FPL flag + news override
    p_start: number | null;
    source: "fpl" | "news_agent" | "none";
    injury_status: string | null;
    rationale: string | null;
  };
  ownership: number | null; form: number | null;
  points_per_game: number | null; total_points: number | null;
  ep_next: number | null;                // FPL's own published forecast
  season: {                              // observed, from player_season_stats
    season: string; minutes: number; starts: number;
    goals: number; assists: number; clean_sheets: number;
    bonus: number; bps: number; saves: number;
    xg: number; xa: number; xgi: number; xgc: number;
    xg90: number; xa90: number; xgi90: number; xgc90: number;
    defcon90: number; bps90: number; pts90: number;
    ict_index: number; threat: number; creativity: number; influence: number;
  } | null;
  set_pieces: { penalties: number | null; corners: number | null; freekicks: number | null };
  prediction: Prediction | null;   // for `event`
  horizon: {                       // sum over the run horizon
    from_event: number; to_event: number;
    xp_total: number; per_event: { event: number; xp: number;
                                   opponent: string | null; is_home: boolean | null;
                                   difficulty: number | null }[];
  } | null;
  value_per_million: number | null;
};

type Prediction = {
  model_id: string; event: number;
  xp: number; p10: number; p25: number; p50: number; p75: number; p90: number;
  std: number;
  p_appear: number; p_start: number; exp_minutes: number;
  exp_goals: number; exp_assists: number;
  p_clean_sheet: number; p_goal: number; p_assist: number;
  p_return: number; p_haul: number; p_blank: number;
  exp_bonus: number; exp_saves: number; exp_defcon: number;
  components: {                 // sums to xp
    appearance: number; goals: number; assists: number; clean_sheet: number;
    saves: number; defcon: number; bonus: number; negative: number;
  };
  fixture: { opponent: string | null; opponent_id: number | null;
             is_home: boolean | null; difficulty: number | null;
             kickoff: string | null; count: number } // count>1 => double GW
};
```

## `GET /api/players/{id}`

`PlayerRow` plus:

```ts
type PlayerDetail = PlayerRow & {
  pmf: { points: number; prob: number }[];       // discrete points distribution
  explain: { feature: string; contribution: number; value: number }[]; // LightGBM
  model_spread: { model_id: string; name: string; xp: number }[];
  fixtures: { event: number; opponent: string; opponent_id: number;
              is_home: boolean; difficulty: number; kickoff: string | null;
              xp: number | null }[];
  fbref: Record<string, number> | null;   // null when FBref not ingested
  odds: { market: string; selection: string; price: number;
          implied_prob: number; provider: string; captured_at: string }[];
  news: { source: string; author: string | null; published_at: string | null;
          text: string; url: string | null }[];
  gameweek_history: { event: number; minutes: number; total_points: number;
                      opponent: string | null; was_home: boolean | null;
                      xg: number; xa: number; bps: number }[]; // [] when not ingested
};
```

## `GET /api/fixtures` and `GET /api/fdr`

```ts
type FixtureRow = { id: number; event: number | null; kickoff: string | null;
  home: TeamRef; away: TeamRef; home_difficulty: number; away_difficulty: number;
  finished: boolean; home_score: number | null; away_score: number | null };

type FdrGrid = {   // GET /api/fdr?from=1&to=8
  from_event: number; to_event: number;
  teams: { team_id: number; short_name: string; primary_hex: string;
           cells: { event: number;
                    fixtures: { opponent: string; opponent_id: number;
                                is_home: boolean; difficulty: number;
                                attack_index: number; defence_index: number }[] }[];
           attack_score: number;   // mean fixture-adjusted attacking outlook
           defence_score: number }[];
};
```

## `GET /api/models/leaderboard`

Only models that were actually fitted and evaluated in the active run appear.
Metric values are measured out-of-fold; `scope` says how.

```ts
type Leaderboard = {
  run: RunInfo;
  evaluation: { target: string; scheme: string; n: number; note: string };
  models: { model_id: string; name: string; family: string; description: string;
            hue: number;
            metrics: Record<string, number>;     // spearman, mae, rmse, r2, crps...
            available: boolean }[];
  calibration: { model_id: string;
                 bins: { pred_mean: number; actual_mean: number; n: number }[] }[];
  importance: { model_id: string; features: { feature: string; gain: number }[] }[];
  disagreement: { player_id: number; web_name: string; team: string;
                  position: string; spread: number;
                  by_model: Record<string, number> }[];
};
```

## `POST /api/optimize`

```ts
type OptimizeRequest = {
  budget?: number;            // default 100.0
  horizon?: number;           // default run horizon
  model?: string;             // default "ensemble"
  formation?: string | null;  // e.g. "3-4-3"; null = solver chooses
  bench_weights?: number[];
  max_per_team?: number;      // default 3
  locked_in?: number[];       // player ids that must be selected
  locked_out?: number[];
  existing_squad?: number[];  // enables transfer planning
  free_transfers?: number;
  transfer_penalty?: number;  // default 4 points per extra transfer
  chip?: "none" | "wildcard" | "freehit" | "bboost" | "3xc";
};

type OptimizeResponse = {
  solve_id: string; run_id: string; model_id: string;
  status: string;             // CBC status, e.g. "Optimal"
  solve_ms: number;
  objective: number;
  squad_cost: number; bank: number;
  xi: SquadPlayer[]; bench: SquadPlayer[];
  captain_id: number; vice_id: number;
  formation: string;
  xi_xp: number; bench_xp: number; total_xp: number;
  transfers: { out: SquadPlayer; in: SquadPlayer; delta_xp: number }[] | null;
  hits: number;
  binding: { constraint: string; slack: number; note: string }[];
  per_event: { event: number; xi_xp: number; captain: string }[];
};

type SquadPlayer = PlayerRow & {
  role: "xi" | "bench";
  bench_order: number | null;
  is_captain: boolean; is_vice: boolean;
  pitch_slot: { row: number; col: number };  // solver-assigned layout position
};
```

## Other endpoints

- `GET /api/captaincy?event=&model=` → ranked captain candidates with
  `xp`, `p_haul`, `p_blank`, `ceiling`, `eo` (effective ownership), `risk_adjusted`.
- `GET /api/differentials?max_ownership=&event=` → high-xP, low-ownership players.
- `GET /api/chips` → chip windows from the FPL API plus, per chip, the solver's
  best scoring gameweek over the horizon.
- `GET /api/news` → ingested news items with their structured extractions.
- `GET /api/odds` → ingested markets grouped by fixture. `[]` when unconfigured.
- `GET /api/sources` → detailed per-source status, config requirements, and the
  exact env var each source needs. Drives the Data Sources page.
- `POST /api/ingest/{source}` → run one ingest adapter now; returns its log row.
- `POST /api/run` → fit models and write a new run; returns `RunInfo`.
- `GET /api/photo/{code}?size=md` → 302 to the first CDN URL that resolves, or a
  generated SVG monogram when none do. Always returns an image.

## Error shape

```ts
type ApiError = { error: string; detail: string; hint?: string };
```

HTTP 503 with this shape is used for "the engine has no run yet" and for
"this source is not configured" — both are states the UI renders explicitly.
