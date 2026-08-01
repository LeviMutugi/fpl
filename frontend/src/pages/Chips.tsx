import { AreaChart, BarChart } from '@/components/charts';
import { QueryError } from '@/components/QueryState';
import { PageHeader, Section } from '@/components/layout';
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, SkeletonRows } from '@/components/ui';
import { num } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useChips } from '@/hooks/useEngine';

/**
 * Chip timing is a scheduling problem, not a prediction one: the fixture
 * calendar decides when a bench boost or a triple captain is worth more than it
 * is in an ordinary week. This page shows the calendar and the model's outlook
 * next to each other and leaves the call to the reader.
 */

const CHIP_LABELS: Record<string, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free hit',
  bboost: 'Bench boost',
  '3xc': 'Triple captain',
  manager: 'Assistant manager',
};

export default function ChipsPage() {
  const prefs = usePrefs();
  const query = useChips(prefs.model);

  if (query.isLoading) return <SkeletonRows rows={5} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <EmptyState title="No chip data" description="The engine has no completed run." />;

  const { windows, per_event, fixture_shape, blank_gameweeks, double_gameweeks, note } = query.data;
  const maxEvent = Math.max(38, ...fixture_shape.map((entry) => entry.event));

  return (
    <>
      <PageHeader
        title="Chip strategy"
        subtitle="Chip windows against the published calendar and the model's per-gameweek outlook."
      />

      <Section
        title="Windows"
        description="Straight from the game's own chip configuration — these are rules, not estimates."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {windows.map((chip) => (
            <Card key={chip.id}>
              <CardHeader>
                <CardTitle>
                  {CHIP_LABELS[chip.name] ?? chip.name}
                  {chip.number && chip.number > 1 ? ` ${chip.number}` : ''}
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                <p className="text-[13px] tabular-nums">
                  GW{chip.start_event ?? '?'} – GW{chip.stop_event ?? '?'}
                </p>
                {/* The bar makes the window's position in the season legible at a glance. */}
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      marginLeft: `${(((chip.start_event ?? 1) - 1) / maxEvent) * 100}%`,
                      width: `${(((chip.stop_event ?? maxEvent) - (chip.start_event ?? 1) + 1) / maxEvent) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-[12px] text-text-faint">{chip.chip_type ?? 'chip'}</p>
              </CardBody>
            </Card>
          ))}
          {windows.length === 0 && (
            <EmptyState title="No chip windows published" description="The game has not released them yet." />
          )}
        </div>
      </Section>

      <Section
        title="Model outlook per gameweek"
        description="Mean expected points across every scored player, and how many clear a strong-option threshold."
      >
        <Card>
          <CardBody className="space-y-6">
            <AreaChart
              height={220}
              ariaLabel="Mean expected points per gameweek"
              series={[
                {
                  id: 'mean_xp',
                  label: 'Mean xP across all players',
                  points: per_event.map((entry) => ({ x: entry.event, y: entry.mean_xp })),
                },
              ]}
              formatX={(value) => `GW${value}`}
            />
            <BarChart
              height={200}
              ariaLabel="Players above four expected points per gameweek"
              data={per_event.map((entry) => ({
                key: String(entry.event),
                label: `GW${entry.event}`,
                value: entry.strong_options,
              }))}
              labelEvery={2}
            />
          </CardBody>
        </Card>
      </Section>

      <Section
        title="Fixture shape"
        description="Ten fixtures is a normal gameweek. Fewer is a blank, more is a double — both change what a chip is worth."
      >
        <Card>
          <CardBody className="space-y-4">
            <BarChart
              height={200}
              ariaLabel="Fixtures per gameweek"
              data={fixture_shape.map((entry) => ({
                key: String(entry.event),
                label: `GW${entry.event}`,
                value: entry.fixtures,
              }))}
              labelEvery={2}
            />
            <div className="flex flex-wrap gap-2">
              {blank_gameweeks.map((event) => (
                <Badge key={`b${event}`} tone="warning">
                  Blank GW{event}
                </Badge>
              ))}
              {double_gameweeks.map((event) => (
                <Badge key={`d${event}`} tone="good">
                  Double GW{event}
                </Badge>
              ))}
              {blank_gameweeks.length === 0 && double_gameweeks.length === 0 && (
                <span className="text-[13px] text-text-muted">
                  Every gameweek in the published calendar has a full ten fixtures.
                </span>
              )}
            </div>
            <p className="rounded-xl bg-surface-sunken px-3 py-2.5 text-[12.5px] leading-relaxed text-text-muted">
              {note}
            </p>
          </CardBody>
        </Card>
      </Section>

      <Section title="Best gameweek by mean outlook">
        <Card>
          <CardBody>
            {per_event.length === 0 ? (
              <EmptyState title="No per-gameweek forecast" description="Widen the run horizon and refit." />
            ) : (
              <ul className="space-y-2 text-[13px]">
                {[...per_event]
                  .sort((a, b) => b.mean_xp - a.mean_xp)
                  .slice(0, 5)
                  .map((entry) => (
                    <li key={entry.event} className="flex items-center justify-between gap-4">
                      <span className="font-medium">GW{entry.event}</span>
                      <span className="text-text-muted">
                        {entry.strong_options} strong options ·{' '}
                        <span className="tabular-nums">{num(entry.mean_xp, 3)}</span> mean xP
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
