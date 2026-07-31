# Data sources

Six ingest adapters feed the engine. Each one either lands real data or records
an honest status; none of them substitute an estimate for a source it could not
reach. `python -m backend.ingest.runner status` prints the live state of all six.

## Why an unavailable source stays unavailable

It would be easy to interpolate a missing clean-sheet probability, or to carry a
stale odds line forward, and the UI would look complete. It would also be wrong
in a way that is invisible: a number on a screen carries no marker saying
"this one was guessed". So every adapter writes rows only when it has data, the
API passes absences through as `null`, and the UI renders them as an explicit
"no data" state. A model that cannot see a signal reports that it cannot see it —
the Model Lab lists `defensive_contribution_available: false` rather than
silently scoring defensive returns at zero and calling it a forecast.

The statuses in `ingest_runs` are:

| Status | Meaning |
|---|---|
| `ok` | The source was reached and rows were written. |
| `partial` | Some rows landed; the message says what did not. |
| `unreachable` | Transport failed (DNS, proxy, TLS, timeout). Nothing written. |
| `unconfigured` | A required credential or optional package is absent. Nothing written. |
| `error` | The source answered with an error. Nothing written. |
| `never` | This source has never been attempted. |

---

## 1. `fpl_bootstrap` — the FPL API

**Provides** players, teams, gameweeks, prices, ownership, availability flags,
set-piece orders, season aggregates (including expected goals and assists), and
the game's own scoring rules.

**Consumed by** everything. The structural model reads the scoring rules from
here rather than hardcoding a rulebook, so a mid-season rule change propagates on
the next ingest.

**Credentials** none.

```
python -m backend.ingest.runner bootstrap
```

The adapter fetches live and, if the host is unreachable, projects the most
recent stored snapshot instead — logging `unreachable` with the snapshot's
capture time so the UI can show exactly how stale the data is. Nothing downstream
has to know which path was taken.

**Rate limits** none published; be considerate — one call per refresh is enough.

## 2. `fpl_fixtures` — the fixture calendar

**Provides** all 380 fixtures with kickoff times and the game's 1–5 difficulty
ratings.

**Consumed by** the fixture adjustment in the structural model, the difficulty
grid, and blank/double gameweek detection.

**Credentials** none. Same live-then-snapshot behaviour as bootstrap.

```
python -m backend.ingest.runner fixtures
```

## 3. `fpl_history` — per-gameweek player history

**Provides** match-by-match minutes, returns, and BPS per player.

**Consumed by** the evaluation loop. Without it the models are scored against
season aggregates, which measures how well the rate-to-points mapping is
recovered rather than out-of-season forecasting skill; CRPS and per-gameweek
calibration are unavailable and reported as such in the Model Lab.

**Credentials** none, but it needs live access — there is no aggregate endpoint
that carries it, so a stored snapshot cannot stand in.

```
python -m backend.ingest.runner history --limit 200
```

**Rate limits** one request per player. Use `--limit` to fetch the most expensive
players first rather than all ~600 in one pass.

## 4. `fbref` — underlying metrics

**Provides** non-penalty xG, shot- and goal-creating actions, key passes, shots,
touches in the box, progressive carries and passes received, and defensive
actions — all per 90.

**Consumed by** the gradient-boosted model, as volume signals behind a player's
returns.

**Credentials** none, but requires the optional `soccerdata` package:

```
pip install soccerdata
python -m backend.ingest.runner fbref
```

Per-90 figures are computed from totals and 90s played rather than trusting
mixed column conventions across FBref's tables. Players are matched to FPL ids by
normalised name with a recorded `match_confidence`.

**Rate limits** FBref asks scrapers to be gentle; `soccerdata` caches locally.
Once a week is plenty — underlying rates do not move fast.

## 5. `odds` — bookmaker markets

**Provides** de-vigged clean-sheet and anytime-goalscorer probabilities, plus
match odds and totals.

**Consumed by** `derive_priors()`, which returns them in the shape the points
model consumes as priors. Market prices aggregate far more information about a
single fixture than a season of xG does, which is why they are worth ingesting
for exactly the two quantities historical data pins down worst.

**Credentials** `ODDS_API_KEY` (from the-odds-api.com). Optional:
`ODDS_REGIONS`, `ODDS_BOOKMAKERS`, `ODDS_SPORT_KEY`.

```
export ODDS_API_KEY=...
python -m backend.ingest.runner odds
```

**De-vigging** for a complete market, implied probabilities are renormalised to
sum to one and `devigged` is set. When only part of the book is returned the raw
`1/price` is stored with `devigged` clear, so a consumer can always tell an
over-round price from a probability.

**Fixture matching** bookmaker fixtures are matched to FPL fixtures by team name
and a kickoff within ±36 hours. Unmatched fixtures are skipped and counted in the
run message, never guessed.

**Rate limits and cost** the free tier is around 500 requests a month and one
call covers every fixture in the window, so a weekly pull is comfortable.
Player-level markets need a paid plan; the adapter detects a rejection and
retries with the core markets rather than failing the run.

## 6. `news` — the availability agent

**Provides** a start probability, minutes estimate, and injury status per player,
with the rationale and the source text behind it.

**Consumed by** the minutes model, overriding `chance_of_playing_next_round` —
the slowest-moving field in the FPL API, and often a day behind a press
conference.

Two collection paths:

- **Official FPL notes** — already in the database, no network and no key needed.
  Every flagged player carries a short note ("Knee injury - 75% chance of
  playing"). This path always works and is where the adapter's rows come from on
  a fresh clone.
- **Beat reporters on X** — needs `X_BEARER_TOKEN`. Handles are configurable via
  `FPL_NEWS_SOURCES` because which reporters are worth reading changes season to
  season.

Extraction runs through the Anthropic Messages API with a JSON schema, so the
model returns a validated object rather than prose to be parsed. An override is
written only when the player name matches with confidence ≥ 0.8; looser matches
are counted in the run message and discarded.

**Credentials** `ANTHROPIC_API_KEY` (required for extraction), `X_BEARER_TOKEN`
(optional, for the reporter feed), `FPL_NEWS_MODEL` (defaults to `claude-opus-5`),
`FPL_NEWS_SOURCES`. Requires the optional `anthropic` package.

```
pip install anthropic
export ANTHROPIC_API_KEY=...
python -m backend.ingest.runner news
```

Without the API key the adapter still collects and stores the news items, then
reports `unconfigured` — it writes no override it did not actually extract.

**Rate limits and cost** one request per run, batching every collected report
into a single extraction. X's recent-search endpoint is the tighter constraint;
the adapter looks back 72 hours and caps at 100 posts.

---

## Running everything

```
python -m backend.ingest.runner all
python -m backend.cli run --horizon 5      # refit models on the new data
```

The runner exits non-zero only if a source reports `error`. `unconfigured` and
`unreachable` are expected states on a machine without keys or outbound network,
not failures.
