import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { BarChart } from '@/components/charts';
import { FixtureTicker, PlayerImage, TeamBadge } from '@/components/football';
import { AnimatedNumber, BentoGrid, BentoItem, GlowCard, StatTile } from '@/components/kokonut';
import { QueryError } from '@/components/QueryState';
import { MetricRow, PageHeader, Section } from '@/components/layout';
import { Badge, Button, Card, CardBody, EmptyState, SkeletonRows } from '@/components/ui';
import { money, num, pct } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useCaptaincy, useDifferentials, useMeta, usePlayers } from '@/hooks/useEngine';

/** Countdown to the next deadline, in whole days and hours. */
function deadlineIn(iso: string | null): string {
  if (!iso) return 'no deadline published';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 'no deadline published';
  if (ms <= 0) return 'deadline passed';
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h away` : `${hours}h away`;
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const meta = useMeta();
  const players = usePlayers({ model: prefs.model, horizon: prefs.horizon, sort: 'xp', limit: 8 });
  const captaincy = useCaptaincy(prefs.model);
  const differentials = useDifferentials(6, prefs.model);

  const event = meta.data?.next_event ?? meta.data?.current_event ?? null;
  const top = players.data?.players ?? [];
  const captain = captaincy.data?.candidates?.[0] ?? null;

  if (meta.isError) return <QueryError error={meta.error} onRetry={() => void meta.refetch()} />;

  return (
    <>
      <PageHeader
        title="Gameweek overview"
        animate
        subtitle={
          event
            ? `GW${event} · ${deadlineIn(meta.data?.next_deadline ?? null)}`
            : 'Waiting for the season to open'
        }
        actions={
          <Button onClick={() => navigate('/pitch')}>
            Open Squad Studio <ArrowRight className="size-4" />
          </Button>
        }
      />

      <MetricRow>
        <StatTile
          label="Players scored"
          value={meta.data?.active_run?.n_players ?? null}
          hint="Every player with a prediction in the active run"
        />
        <StatTile
          label="Top single-gameweek xP"
          value={top[0]?.prediction?.xp ?? null}
          decimals={2}
          hint={top[0] ? `${top[0].web_name} · ${top[0].team}` : undefined}
        />
        <StatTile
          label="Fixtures scheduled"
          value={meta.data?.counts.fixtures ?? null}
          hint="Full published calendar"
        />
        <StatTile
          label="FPL managers"
          value={meta.data?.total_fpl_players ?? null}
          hint="Total entries, from the game's own bootstrap"
        />
      </MetricRow>

      <Section
        title="Highest expected points"
        description={`Ranked by the ${prefs.model} model for GW${event ?? '—'}, with the p10–p90 range behind each estimate.`}
      >
        {players.isLoading && <SkeletonRows rows={4} />}
        {players.isError && <QueryError error={players.error} onRetry={() => void players.refetch()} />}
        {players.data && top.length === 0 && (
          <EmptyState
            title="No predictions yet"
            description="The engine has not completed a model run. Refit from the Data Sources page."
          />
        )}
        {top.length > 0 && (
          <BentoGrid>
            {top.slice(0, 6).map((player, index) => (
              <BentoItem key={player.id} colSpan={index === 0 ? 2 : 1}>
                <Link to={`/players/${player.id}`} className="block h-full focus-visible:outline-none">
                  <GlowCard className="h-full">
                    <div className="flex h-full items-center gap-4 p-4">
                      <PlayerImage
                        code={player.code}
                        name={player.web_name}
                        candidates={player.photo.candidates}
                        size={index === 0 ? 'lg' : 'md'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <TeamBadge code={player.team_code} name={player.team} size="sm" />
                          <span className="truncate font-display text-[15px] font-semibold">
                            {player.web_name}
                          </span>
                          <Badge tone="neutral">
                            {player.position}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-text-muted">
                          <span className="tabular-nums">{money(player.price)}</span>
                          <span className="tabular-nums">{pct(player.ownership)} owned</span>
                          {player.prediction?.fixture.opponent && (
                            <span>
                              vs {player.prediction.fixture.opponent}
                              {player.prediction.fixture.is_home ? ' (H)' : ' (A)'}
                            </span>
                          )}
                        </div>
                        {player.prediction && (
                          <div className="mt-2.5 flex items-baseline gap-2">
                            <AnimatedNumber
                              value={player.prediction.xp}
                              decimals={2}
                              className="font-display text-[22px] font-semibold tabular-nums"
                            />
                            <span className="text-[12px] text-text-faint">
                              xP · p10 {num(player.prediction.p10, 0)} – p90 {num(player.prediction.p90, 0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </GlowCard>
                </Link>
              </BentoItem>
            ))}
          </BentoGrid>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Captaincy shortlist"
          description="Ranked on mean expected points; the haul probability is what the armband is really buying."
        >
          {captaincy.isLoading && <SkeletonRows rows={3} />}
          {captaincy.data && captain && (
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-4">
                  <PlayerImage
                    code={captain.code}
                    name={captain.web_name}
                    candidates={captain.photo.candidates}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="font-display text-[17px] font-semibold">{captain.web_name}</p>
                    <p className="text-[12.5px] text-text-muted">
                      {captain.team} · {captain.opponent ? `vs ${captain.opponent}` : 'no fixture'}
                    </p>
                    <p className="mt-1.5 text-[13px]">
                      <span className="font-semibold tabular-nums">{num(captain.captain_xp, 2)}</span>{' '}
                      <span className="text-text-faint">xP with the armband</span>
                    </p>
                  </div>
                </div>
                <BarChart
                  orientation="horizontal"
                  height={190}
                  ariaLabel="Captaincy candidates by expected points"
                  data={captaincy.data.candidates.slice(0, 6).map((row) => ({
                    key: String(row.id),
                    label: row.web_name,
                    value: row.xp,
                  }))}
                />
                <Button variant="ghost" size="sm" onClick={() => navigate('/captain')}>
                  All candidates <ArrowRight className="size-3.5" />
                </Button>
              </CardBody>
            </Card>
          )}
        </Section>

        <Section
          title="Differentials"
          description="High expected points at low ownership — where a rank move actually comes from."
        >
          {differentials.isLoading && <SkeletonRows rows={3} />}
          {differentials.data && (
            <Card>
              <CardBody className="space-y-3">
                {differentials.data.players.slice(0, 6).map((player) => (
                  <Link
                    key={player.id}
                    to={`/players/${player.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <PlayerImage
                      code={player.code}
                      name={player.web_name}
                      candidates={player.photo.candidates}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{player.web_name}</p>
                      <p className="text-[12px] text-text-faint">
                        {player.team} · {money(player.price)} · {pct(player.ownership)} owned
                      </p>
                    </div>
                    <span className="font-display text-[15px] font-semibold tabular-nums">
                      {num(player.xp, 2)}
                    </span>
                  </Link>
                ))}
                <Button variant="ghost" size="sm" onClick={() => navigate('/differentials')}>
                  Full differential board <ArrowRight className="size-3.5" />
                </Button>
              </CardBody>
            </Card>
          )}
        </Section>
      </div>

      <Section
        title="Where the model is looking next"
        description="The fixture run behind the top-rated players over the planning horizon."
      >
        <Card>
          <CardBody className="space-y-3">
            {top.slice(0, 6).map((player) => (
              <div key={player.id} className="flex flex-wrap items-center gap-3">
                <span className="w-32 shrink-0 truncate text-[13px] font-medium">{player.web_name}</span>
                <FixtureTicker
                  fixtures={player.horizon?.per_event ?? []}
                  showXp
                />
                <span className="ml-auto text-[13px] font-semibold tabular-nums">
                  {num(player.horizon?.xp_total ?? null, 1)}
                  <span className="ml-1 text-[11.5px] font-normal text-text-faint">
                    xP over {prefs.horizon}
                  </span>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </Section>

      <Section title="Engine provenance">
        <Card>
          <CardBody className="text-[13px] leading-relaxed text-text-muted">
            {meta.data?.active_run ? (
              <>
                Run <code className="font-mono text-[12px] text-text">{meta.data.active_run.run_id}</code>{' '}
                scored {meta.data.active_run.n_players} players for GW
                {meta.data.active_run.target_event} over a {meta.data.active_run.horizon}-gameweek horizon,
                from {meta.data.active_run.season_source ?? 'the stored snapshot'}. Blend weights:{' '}
                {Object.entries(meta.data.active_run.stack_weights ?? {})
                  .map(([model, weight]) => `${model} ${num(weight as number, 2)}`)
                  .join(' · ') || 'not recorded'}
                .
              </>
            ) : (
              'No completed model run yet.'
            )}
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
