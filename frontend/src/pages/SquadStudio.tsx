import { RefreshCw, Shuffle, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { StackedBarChart } from '@/components/charts';
import { Pitch, PitchSlot, PlayerChip } from '@/components/football';
import { ROW_BENCH, ROW_MID } from '@/components/football/FormationSlots';
import { AnimatedNumber, StatTile } from '@/components/kokonut';
import { MetricRow, PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Tooltip,
} from '@/components/ui';
import { money, num } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useMeta, useOptimize } from '@/hooks/useEngine';
import type { ChipName, OptimizeResponse } from '@/types/api';

/**
 * The pitch is the product. Everything else on this page is a control that
 * changes what stands on it: budget, horizon, formation, chip. The solve itself
 * is a mixed-integer program on the server — this page never re-derives a
 * lineup client-side, so what is drawn is exactly what was optimised.
 */

const CHIPS: { value: ChipName; label: string; hint: string }[] = [
  { value: 'none', label: 'No chip', hint: 'Standard scoring' },
  { value: '3xc', label: 'Triple captain', hint: 'Captain scores 3x instead of 2x' },
  { value: 'bboost', label: 'Bench boost', hint: 'All four bench players score in full' },
  { value: 'wildcard', label: 'Wildcard', hint: 'Unlimited transfers, no points hit' },
  { value: 'freehit', label: 'Free hit', hint: 'One-week squad, reverts afterwards' },
];

const FORMATIONS = ['auto', '3-4-3', '3-5-2', '4-4-2', '4-3-3', '4-5-1', '5-3-2', '5-4-1'];


function DecompositionCard({ solve }: { solve: OptimizeResponse }) {
  // The component breakdown is read straight from the stored prediction, so the
  // bars sum to the same xP the solver optimised against.
  const data = solve.xi
    .filter((player) => player.prediction)
    .sort((a, b) => (b.prediction?.xp ?? 0) - (a.prediction?.xp ?? 0))
    .map((player) => ({
      label: player.web_name,
      segments: [
        { key: 'appearance', value: player.prediction?.components.appearance ?? 0 },
        { key: 'goals', value: player.prediction?.components.goals ?? 0 },
        { key: 'assists', value: player.prediction?.components.assists ?? 0 },
        { key: 'clean_sheet', value: player.prediction?.components.clean_sheet ?? 0 },
        { key: 'saves', value: player.prediction?.components.saves ?? 0 },
        { key: 'bonus', value: player.prediction?.components.bonus ?? 0 },
        { key: 'negative', value: player.prediction?.components.negative ?? 0 },
      ],
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the expected points come from</CardTitle>
      </CardHeader>
      <CardBody>
        <StackedBarChart
          data={data}
          orientation="horizontal"
          height={Math.max(240, data.length * 30)}
          ariaLabel="Expected points decomposition per starting player"
          keys={[
            { key: 'appearance', label: 'Appearance' },
            { key: 'goals', label: 'Goals' },
            { key: 'assists', label: 'Assists' },
            { key: 'clean_sheet', label: 'Clean sheet' },
            { key: 'saves', label: 'Saves' },
            { key: 'bonus', label: 'Bonus' },
            { key: 'negative', label: 'Deductions' },
          ]}
        />
      </CardBody>
    </Card>
  );
}

export default function SquadStudioPage() {
  const prefs = usePrefs();
  const meta = useMeta();
  const optimize = useOptimize();

  const [budget, setBudget] = useState(100);
  const [maxPerTeam, setMaxPerTeam] = useState(3);
  const [formation, setFormation] = useState('auto');
  const [chip, setChip] = useState<ChipName>('none');
  const [lockedIn] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const request = useMemo(
    () => ({
      budget,
      horizon: prefs.horizon,
      model: prefs.model,
      max_per_team: maxPerTeam,
      formation: formation === 'auto' ? null : formation,
      locked_in: lockedIn,
      chip,
    }),
    [budget, prefs.horizon, prefs.model, maxPerTeam, formation, lockedIn, chip],
  );

  // Solve once on arrival and whenever a constraint changes; the MILP takes a
  // couple of seconds, so this is deliberately not debounced per keystroke.
  useEffect(() => {
    optimize.mutate(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const solve = optimize.data;
  return (
    <>
      <PageHeader
        title="Squad Studio"
        subtitle={
          solve
            ? `GW${solve.event} · ${solve.formation} · solved in ${solve.solve_ms} ms from a pool of ${solve.pool_size}`
            : 'Optimising the squad…'
        }
        actions={
          <Button loading={optimize.isPending} onClick={() => optimize.mutate(request)}>
            <RefreshCw className="size-4" />
            Re-solve
          </Button>
        }
      />

      <MetricRow>
        <StatTile label="Starting XI xP" value={solve?.xi_xp ?? null} decimals={2} hint="Before the captain multiplier" />
        <StatTile
          label="With captain"
          value={solve?.total_xp ?? null}
          decimals={2}
          hint={chip === '3xc' ? 'Triple captain applied' : 'Captain counted twice'}
        />
        <StatTile label="Squad cost" value={solve?.squad_cost ?? null} decimals={1} prefix="£" suffix="m" />
        <StatTile
          label="In the bank"
          value={solve?.bank ?? null}
          decimals={1}
          prefix="£"
          suffix="m"
          hint={solve && solve.bank <= 0.15 ? 'Budget is fully committed' : undefined}
        />
      </MetricRow>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Section
          title="The pitch"
          description="Click a player to open their detail. The solver assigned every slot — nothing here is laid out client-side."
        >
          {optimize.isPending && !solve && <Skeleton className="aspect-[3/4] w-full rounded-3xl" />}
          {optimize.isError && (
            <ErrorState error={optimize.error} onRetry={() => optimize.mutate(request)} />
          )}
          {solve && (
            <Pitch formation={solve.formation} showBench ariaLabel="Optimised starting eleven">
              {solve.xi.map((player) => (
                <PitchSlot
                  key={player.id}
                  row={player.pitch_slot?.row ?? ROW_MID}
                  col={player.pitch_slot?.col ?? 0}
                  of={player.pitch_slot?.of}
                >
                  <PlayerChip
                    player={player}
                    isCaptain={player.id === solve.captain_id}
                    isVice={player.id === solve.vice_id}
                    selected={selected === player.id}
                    onSelect={setSelected}
                  />
                </PitchSlot>
              ))}
              {solve.bench.map((player, index) => (
                <PitchSlot key={player.id} row={ROW_BENCH} col={index} of={solve.bench.length}>
                  <PlayerChip
                    player={player}
                    compact
                    selected={selected === player.id}
                    onSelect={setSelected}
                  />
                </PitchSlot>
              ))}
            </Pitch>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Constraints" icon={<Wand2 className="size-4" />}>
            <Card>
              <CardBody className="space-y-5">
                <Slider
                  label="Budget"
                  min={80}
                  max={110}
                  step={0.5}
                  value={budget}
                  onChange={setBudget}
                  format={(value) => money(value)}
                />
                <Slider
                  label="Max per club"
                  min={1}
                  max={5}
                  step={1}
                  value={maxPerTeam}
                  onChange={setMaxPerTeam}
                />
                <div className="space-y-1.5">
                  <span className="text-[12.5px] font-medium text-text-muted">Planning horizon</span>
                  <SegmentedControl
                    value={String(prefs.horizon)}
                    onChange={(value) => prefs.setHorizon(Number(value))}
                    options={[1, 3, 5, 8].map((n) => ({ value: String(n), label: `${n}` }))}
                  />
                </div>
                <Select
                  label="Formation"
                  value={formation}
                  onChange={setFormation}
                  options={FORMATIONS.map((value) => ({
                    value,
                    label: value === 'auto' ? 'Solver chooses' : value,
                  }))}
                />
                <Select
                  label="Model"
                  value={prefs.model}
                  onChange={(value) => prefs.setModel(value as typeof prefs.model)}
                  options={[
                    { value: 'ensemble', label: 'Ensemble (blended)' },
                    { value: 'structural', label: 'Structural Poisson' },
                    { value: 'lgbm', label: 'LightGBM' },
                  ]}
                />
              </CardBody>
            </Card>
          </Section>

          <Section title="Chip" icon={<Sparkles className="size-4" />}>
            <Card>
              <CardBody className="space-y-2">
                {CHIPS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setChip(option.value)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      chip === option.value ? 'bg-accent-soft text-accent-ink' : 'hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-current opacity-70" />
                    <span>
                      <span className="block text-[13.5px] font-medium">{option.label}</span>
                      <span className="block text-[12px] opacity-80">{option.hint}</span>
                    </span>
                  </button>
                ))}
              </CardBody>
            </Card>
          </Section>

        </div>
      </div>

      {solve && (
        <>
          <Section
            title="Binding constraints"
            description="What is actually holding the solution back, read from the solved model."
            icon={<Shuffle className="size-4" />}
          >
            <Card>
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {solve.binding.map((entry) => (
                  <div key={entry.constraint} className="rounded-xl bg-surface-sunken px-3 py-2.5">
                    <p className="font-mono text-[11.5px] text-text-faint">{entry.constraint}</p>
                    <p className="mt-0.5 text-[13px]">{entry.note}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
            {solve.notes.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12.5px] text-text-muted">
                {solve.notes.map((note) => (
                  <li key={note}>· {note}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Per gameweek"
            description="The squad is fixed across the horizon; the lineup and captain are re-chosen each week."
          >
            <Card>
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[13px]">
                    <thead>
                      <tr className="text-left text-text-faint">
                        <th className="pb-2 font-medium">Gameweek</th>
                        <th className="pb-2 text-right font-medium">XI xP</th>
                        <th className="pb-2 text-right font-medium">Captain</th>
                        <th className="pb-2 text-right font-medium">Bench value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solve.per_event.map((row) => (
                        <tr key={row.event} className="border-t border-border">
                          <td className="py-2">GW{row.event}</td>
                          <td className="py-2 text-right tabular-nums">{num(row.xi_xp, 2)}</td>
                          <td className="py-2 text-right">
                            {row.captain ?? '—'}
                            <span className="ml-1.5 text-text-faint tabular-nums">
                              +{num(row.captain_bonus, 2)}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{num(row.bench_xp, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </Section>

          <Section title="Decomposition">
            <DecompositionCard solve={solve} />
          </Section>
        </>
      )}

      {!optimize.isPending && !solve && !optimize.isError && (
        <EmptyState
          title="No squad yet"
          description="The engine has no completed model run to optimise against."
          action={
            <Button asChild>
              <Link to="/sources">Go to Data Sources</Link>
            </Button>
          }
        />
      )}

      {selected !== null && (
        <Tooltip content="Open full player detail">
          <Button asChild className="fixed bottom-6 right-6 shadow-lg">
            <Link to={`/players/${selected}`}>Open player detail</Link>
          </Button>
        </Tooltip>
      )}

      {meta.data?.active_run && (
        <p className="pt-2 text-[12px] text-text-faint">
          Solved against run {meta.data.active_run.run_id} · {meta.data.active_run.season_source}
        </p>
      )}
    </>
  );
}
