import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiUrl, fetchJson, postJson } from '@/lib/api';
import type {
  FdrGrid,
  FixtureRow,
  Leaderboard,
  Meta,
  OptimizeRequest,
  OptimizeResponse,
  PlayerDetail,
  PlayerRow,
  Team,
} from '@/types/api';

/**
 * One hook per endpoint. Every query keeps the engine's own `run_id` out of the
 * key deliberately: a new model run should invalidate everything at once, which
 * `useRefreshRun` does explicitly, rather than silently forking the cache.
 */

const MINUTE = 60_000;

export type PlayerQuery = {
  model?: string;
  event?: number;
  horizon?: number;
  position?: string;
  team?: number;
  maxCost?: number;
  minMinutes?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  onlyAvailable?: boolean;
};

export type PlayersResponse = {
  run: Meta['active_run'];
  event: number;
  horizon: number;
  model: string;
  total: number;
  players: PlayerRow[];
};

export function useMeta(): UseQueryResult<Meta> {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => fetchJson<Meta>('/meta'),
    staleTime: 5 * MINUTE,
  });
}

export function useTeams(): UseQueryResult<Team[]> {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => fetchJson<Team[]>('/teams'),
    staleTime: 30 * MINUTE,
  });
}

export function usePlayers(query: PlayerQuery = {}): UseQueryResult<PlayersResponse> {
  const params = {
    model: query.model,
    event: query.event,
    horizon: query.horizon,
    position: query.position,
    team: query.team,
    max_cost: query.maxCost,
    min_minutes: query.minMinutes,
    search: query.search,
    sort: query.sort,
    order: query.order,
    limit: query.limit,
    offset: query.offset,
    only_available: query.onlyAvailable,
  };
  return useQuery({
    queryKey: ['players', params],
    queryFn: () => fetchJson<PlayersResponse>(apiUrl('/players', params)),
    staleTime: 5 * MINUTE,
  });
}

export function usePlayer(
  playerId: number | null,
  options: { model?: string; event?: number; horizon?: number } = {},
): UseQueryResult<PlayerDetail> {
  return useQuery({
    queryKey: ['player', playerId, options],
    queryFn: () =>
      fetchJson<PlayerDetail>(
        apiUrl(`/players/${playerId}`, {
          model: options.model,
          event: options.event,
          horizon: options.horizon,
        }),
      ),
    enabled: playerId !== null,
    staleTime: 5 * MINUTE,
  });
}

export function useFixtures(from?: number, to?: number): UseQueryResult<FixtureRow[]> {
  return useQuery({
    queryKey: ['fixtures', from, to],
    queryFn: () => fetchJson<FixtureRow[]>(apiUrl('/fixtures', { from, to })),
    staleTime: 30 * MINUTE,
  });
}

export function useFdr(from: number, to: number): UseQueryResult<FdrGrid> {
  return useQuery({
    queryKey: ['fdr', from, to],
    queryFn: () => fetchJson<FdrGrid>(apiUrl('/fdr', { from, to })),
    enabled: Number.isFinite(from) && Number.isFinite(to) && to >= from,
    staleTime: 30 * MINUTE,
  });
}

export function useLeaderboard(): UseQueryResult<Leaderboard> {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => fetchJson<Leaderboard>('/models/leaderboard'),
    staleTime: 10 * MINUTE,
  });
}

export type CaptaincyRow = PlayerRow & {
  xp: number;
  captain_xp: number;
  p_haul: number;
  p_blank: number;
  p_return: number;
  ceiling: number;
  floor: number;
  std: number;
  risk_adjusted: number;
  exp_minutes: number;
  opponent: string | null;
  is_home: boolean | null;
  difficulty: number | null;
  effective_ownership: number | null;
};

export function useCaptaincy(
  model = 'ensemble',
  event?: number,
): UseQueryResult<{ run: Meta['active_run']; event: number; note: string; candidates: CaptaincyRow[] }> {
  return useQuery({
    queryKey: ['captaincy', model, event],
    queryFn: () =>
      fetchJson<{ run: Meta['active_run']; event: number; note: string; candidates: CaptaincyRow[] }>(
        apiUrl('/captaincy', { model, event, limit: 40 }),
      ),
    staleTime: 5 * MINUTE,
  });
}

export type DifferentialRow = PlayerRow & {
  xp: number;
  xp_horizon: number | null;
  p_haul: number;
  opponent: string | null;
  is_home: boolean | null;
};

export function useDifferentials(
  maxOwnership = 8,
  model = 'ensemble',
): UseQueryResult<{ max_ownership: number; min_xp: number; players: DifferentialRow[] }> {
  return useQuery({
    queryKey: ['differentials', maxOwnership, model],
    queryFn: () =>
      fetchJson<{ max_ownership: number; min_xp: number; players: DifferentialRow[] }>(
        apiUrl('/differentials', { max_ownership: maxOwnership, model, limit: 60 }),
      ),
    staleTime: 5 * MINUTE,
  });
}

export type ChipWindow = {
  id: number;
  name: string;
  number: number | null;
  chip_type: string | null;
  start_event: number | null;
  stop_event: number | null;
};

export type ChipsResponse = {
  windows: ChipWindow[];
  per_event: { event: number; mean_xp: number; players: number; strong_options: number }[];
  fixture_shape: { event: number; fixtures: number }[];
  blank_gameweeks: number[];
  double_gameweeks: number[];
  note: string;
};

export function useChips(model = 'ensemble'): UseQueryResult<ChipsResponse> {
  return useQuery({
    queryKey: ['chips', model],
    queryFn: () => fetchJson<ChipsResponse>(apiUrl('/chips', { model })),
    staleTime: 30 * MINUTE,
  });
}

export type NewsResponse = {
  items: {
    id: number;
    source: string;
    author: string | null;
    url: string | null;
    published_at: string | null;
    text: string;
    player_ids: number[];
  }[];
  overrides: {
    player_id: number;
    web_name: string;
    team: string;
    code: number;
    event_id: number;
    start_probability: number;
    minutes_estimate: number | null;
    injury_status: string | null;
    confidence: number | null;
    rationale: string | null;
    model: string | null;
    created_at: string;
  }[];
  official_flags: {
    id: number;
    code: number;
    web_name: string;
    team: string;
    status: string | null;
    news: string | null;
    news_added: string | null;
    chance_of_playing_next_round: number | null;
  }[];
};

export function useNews(): UseQueryResult<NewsResponse> {
  return useQuery({
    queryKey: ['news'],
    queryFn: () => fetchJson<NewsResponse>('/news'),
    staleTime: 5 * MINUTE,
  });
}

export type SourceRow = {
  source: string;
  label: string;
  purpose: string;
  status: string;
  last_success: string | null;
  last_attempt: string | null;
  rows: number;
  message: string | null;
  requires: string[];
  optional_requires?: string[];
  extras?: string[];
  configured: boolean;
  missing_env?: string[];
  table?: string;
  table_rows?: number;
  docs_url?: string;
};

export function useSources(): UseQueryResult<SourceRow[]> {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => fetchJson<SourceRow[]>('/sources'),
    staleTime: MINUTE,
  });
}

export function useOptimize() {
  return useMutation({
    mutationFn: (request: OptimizeRequest) => postJson<OptimizeResponse>('/optimize', request),
  });
}

/** Refit the models, then drop every cached query so the UI reads the new run. */
export function useRefreshRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { horizon?: number; event?: number }) => postJson('/run', body),
    onSuccess: () => client.invalidateQueries(),
  });
}

/** Re-run one ingest adapter, then refresh the source table and metadata. */
export function useRunIngest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (source: string) => postJson(`/ingest/${source}`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sources'] });
      void client.invalidateQueries({ queryKey: ['meta'] });
      void client.invalidateQueries({ queryKey: ['news'] });
    },
  });
}
