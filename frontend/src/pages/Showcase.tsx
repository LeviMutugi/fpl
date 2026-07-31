import { Crown, Sparkles } from 'lucide-react';
import { useState } from 'react';

import {
  AreaChart,
  BarChart,
  BoxRow,
  BulletChart,
  CalibrationChart,
  Distribution,
  GaugeArc,
  HeatmapGrid,
  LineChart,
  RadarChart,
  ScatterPlot,
  Sparkline,
  StackedBarChart,
  WaffleChart,
} from '@/components/charts';
import {
  DifficultyPill,
  FixtureTicker,
  Pitch,
  PitchSlot,
  PlayerImage,
  PositionPill,
  PriceTag,
  ShirtIcon,
  TeamBadge,
  XpBadge,
} from '@/components/football';
import { ROW_BENCH, slotPositions } from '@/components/football/FormationSlots';
import {
  AnimatedNumber,
  AnimatedTabs,
  AvatarStack,
  BentoGrid,
  BentoItem,
  BlurInText,
  DotPattern,
  GlowCard,
  GradientRing,
  GridPattern,
  Marquee,
  RevealOnScroll,
  ShineBorder,
  Spotlight,
  StatTile,
} from '@/components/kokonut';
import { PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Kbd,
  Meter,
  Pill,
  Popover,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Tabs,
  ThemeToggle,
  Tooltip,
  toast,
} from '@/components/ui';

/**
 * The visual QA surface. Every component in the design system renders here with
 * illustrative values, so a regression in light or dark mode is one page load
 * away from being obvious. The literal arrays below are the only invented data
 * anywhere in this app — every other page reads the engine.
 */

const SERIES = [
  { x: 1, y: 4.2 },
  { x: 2, y: 5.1 },
  { x: 3, y: null },
  { x: 4, y: 6.4 },
  { x: 5, y: 5.8 },
  { x: 6, y: 7.1 },
];

const PMF = [
  { points: 0, prob: 0.18 },
  { points: 1, prob: 0.06 },
  { points: 2, prob: 0.22 },
  { points: 3, prob: 0.09 },
  { points: 5, prob: 0.14 },
  { points: 6, prob: 0.11 },
  { points: 8, prob: 0.08 },
  { points: 9, prob: 0.06 },
  { points: 12, prob: 0.04 },
  { points: 13, prob: 0.02 },
];

const PLAYERS = [
  { code: 154561, name: 'Raya', team: 3 },
  { code: 226597, name: 'Gabriel', team: 3 },
  { code: 223094, name: 'Haaland', team: 43 },
  { code: 118748, name: 'Salah', team: 14 },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium uppercase tracking-wide text-text-faint">{title}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function ShowcasePage() {
  const [slider, setSlider] = useState(50);
  const [popover, setPopover] = useState(false);
  const [tab, setTab] = useState('one');
  const [panel, setPanel] = useState('a');
  const [switched, setSwitched] = useState(true);
  const [segment, setSegment] = useState('a');
  const [text, setText] = useState('');
  const slots = slotPositions('3-4-3');

  return (
    <>
      <PageHeader
        title="Component showcase"
        subtitle="Every primitive, chart and football component, in the current theme."
        actions={<ThemeToggle />}
      />

      <Section title="Buttons and controls">
        <Card>
          <CardBody className="space-y-6">
            <Row title="Buttons">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm">Small</Button>
            </Row>
            <Row title="Badges and pills">
              <Badge>Neutral</Badge>
              <Badge tone="good">Good</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="critical">Critical</Badge>
              <Pill>Pill</Pill>
              <PositionPill position="GKP" />
              <PositionPill position="DEF" />
              <PositionPill position="MID" />
              <PositionPill position="FWD" />
              <Kbd keys={['⌘', 'K']} />
            </Row>
            <Row title="Inputs">
              <Input label="Search" value={text} onChange={(event) => setText(event.target.value)} />
              <Select
                label="Model"
                value="ensemble"
                onChange={() => undefined}
                options={[{ value: 'ensemble', label: 'Ensemble' }]}
              />
              <Switch checked={switched} onChange={setSwitched} label="Toggle" />
              <SegmentedControl
                value={segment}
                onChange={setSegment}
                ariaLabel="Example segments"
                options={[
                  { value: 'a', label: 'One' },
                  { value: 'b', label: 'Two' },
                  { value: 'c', label: 'Three' },
                ]}
              />
            </Row>
            <div className="max-w-sm space-y-4">
              <Slider label="Slider" value={slider} onChange={setSlider} valueLabel={`${slider}%`} />
              <Progress value={0.62} label="Progress" />
              <Meter
                label="Meter"
                segments={[
                  { label: 'Goals', value: 3, token: '--color-series-1' },
                  { label: 'Assists', value: 2, token: '--color-series-2' },
                  { label: 'Bonus', value: 1, token: '--color-series-3' },
                ]}
              />
            </div>
            <Row title="Overlays">
              <Tooltip content="A tooltip">
                <Button variant="secondary">Hover me</Button>
              </Tooltip>
              <Popover
                open={popover}
                onOpenChange={setPopover}
                trigger={({ ref, ...triggerProps }) => (
                  <Button
                    variant="secondary"
                    ref={ref as (node: HTMLButtonElement | null) => void}
                    {...triggerProps}
                  >
                    Popover
                  </Button>
                )}
              >
                <p className="text-[13px]">Popover content</p>
              </Popover>
              <Button
                variant="secondary"
                onClick={() => toast({ title: 'Toast fired', description: 'From the showcase.' })}
              >
                Toast
              </Button>
              <Spinner />
            </Row>
          </CardBody>
        </Card>
      </Section>

      <Section title="States">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardBody>
              <EmptyState title="Nothing here" description="An explicit empty state, not a blank panel." />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <ErrorState title="Request failed" detail="Connection refused." onRetry={() => undefined} />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2">
              <Skeleton className="h-6 w-32 rounded-lg" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="Expressive components">
        <BentoGrid>
          <BentoItem colSpan={2}>
            <GlowCard className="h-full">
              <div className="space-y-2 p-5">
                <BlurInText text="Mouse-tracked glow card" className="font-display text-[18px]" />
                <p className="text-[13px] text-text-muted">Hover to see the highlight follow the cursor.</p>
              </div>
            </GlowCard>
          </BentoItem>
          <BentoItem>
            <StatTile label="Animated number" value={62.4} decimals={1} delta={3.2} />
          </BentoItem>
          <BentoItem>
            <Card className="h-full">
              <CardBody className="flex items-center justify-center">
                <AnimatedNumber value={1234} className="font-display text-[28px] tabular-nums" />
              </CardBody>
            </Card>
          </BentoItem>
          <BentoItem colSpan={2}>
            <ShineBorder className="h-full">
              <div className="p-5 text-[13px]">Shine border</div>
            </ShineBorder>
          </BentoItem>
          <BentoItem>
            <Card className="relative h-full overflow-hidden">
              <DotPattern />
              <CardBody className="relative">Dot pattern</CardBody>
            </Card>
          </BentoItem>
          <BentoItem>
            <Card className="relative h-full overflow-hidden">
              <GridPattern />
              <CardBody className="relative">Grid pattern</CardBody>
            </Card>
          </BentoItem>
          <BentoItem colSpan={2}>
            <Card className="relative h-full overflow-hidden">
              <Spotlight />
              <CardBody className="relative text-[13px]">Spotlight</CardBody>
            </Card>
          </BentoItem>
          <BentoItem>
            <Card className="h-full">
              <CardBody className="flex items-center justify-center">
                <GradientRing size={72}>
                  <Crown className="size-6" />
                </GradientRing>
              </CardBody>
            </Card>
          </BentoItem>
        </BentoGrid>

        <div className="mt-4 space-y-4">
          <Marquee>
            {PLAYERS.map((player) => (
              <span key={player.code} className="px-4 text-[13px]">
                {player.name}
              </span>
            ))}
          </Marquee>
          <AnimatedTabs
            ariaLabel="Animated tab example"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'one', label: 'First' },
              { value: 'two', label: 'Second' },
              { value: 'three', label: 'Third' },
            ]}
          />
          <AvatarStack
            items={PLAYERS.map((player) => ({
              key: String(player.code),
              label: player.name,
              node: <PlayerImage code={player.code} name={player.name} size="xs" />,
            }))}
          />
          <RevealOnScroll>
            <Card>
              <CardBody className="text-[13px]">Revealed on scroll.</CardBody>
            </Card>
          </RevealOnScroll>
          <Tabs
            value={panel}
            onChange={setPanel}
            items={[
              { value: 'a', label: 'Tab A' },
              { value: 'b', label: 'Tab B' },
            ]}
          />
          <p className="text-[13px]">Panel {panel.toUpperCase()}</p>
          <ScrollArea className="max-h-32 rounded-xl border border-border p-3">
            <p className="text-[13px] leading-relaxed">
              {Array.from({ length: 12 }, (_, i) => `Scrollable line ${i + 1}. `).join('')}
            </p>
          </ScrollArea>
        </div>
      </Section>

      <Section title="Football components">
        <Card>
          <CardBody className="space-y-6">
            <Row title="Player images — the ladder ends in a monogram, never a broken tile">
              {PLAYERS.map((player) => (
                <div key={player.code} className="flex flex-col items-center gap-1.5">
                  <PlayerImage code={player.code} name={player.name} size="lg" />
                  <span className="text-[11.5px] text-text-faint">{player.name}</span>
                </div>
              ))}
              <PlayerImage code={999999} name="Unknown Player" size="lg" />
            </Row>
            <Row title="Team badges and shirts">
              {[3, 14, 43, 6].map((code) => (
                <TeamBadge key={code} code={code} name={`Club ${code}`} size="md" />
              ))}
              <ShirtIcon primaryHex="#EF0107" secondaryHex="#FFFFFF" />
              <ShirtIcon primaryHex="#6CABDD" secondaryHex="#1C2C5B" />
            </Row>
            <Row title="Markers">
              {[1, 2, 3, 4, 5].map((value) => (
                <DifficultyPill key={value} value={value} />
              ))}
              <PriceTag price={9.5} delta={0.3} chip />
              <XpBadge xp={6.42} />
            </Row>
            <Row title="Fixture ticker">
              <FixtureTicker
                fixtures={[
                  { event: 1, opponent: 'COV', is_home: true, difficulty: 2, xp: 5.1 },
                  { event: 2, opponent: 'AVL', is_home: false, difficulty: 4, xp: 3.8 },
                  { event: 3, opponent: 'BOU', is_home: true, difficulty: 3, xp: 4.4 },
                ]}
                showXp
              />
            </Row>
          </CardBody>
        </Card>
      </Section>

      <Section title="The pitch" description="The signature surface — green in both themes.">
        <Pitch formation="3-4-3" showBench ariaLabel="Example formation">
          {slots.map((slot, index) => {
            const player = PLAYERS[index % PLAYERS.length];
            return (
              <PitchSlot key={`${slot.row}-${slot.col}`} row={slot.row} col={slot.col} of={slot.of}>
                <div className="flex flex-col items-center gap-1">
                  <PlayerImage code={player.code} name={player.name} size="sm" />
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10.5px] font-medium shadow-sm">
                    {player.name}
                  </span>
                </div>
              </PitchSlot>
            );
          })}
          {[0, 1, 2, 3].map((index) => (
            <PitchSlot key={`bench-${index}`} row={ROW_BENCH} col={index} of={4}>
              <PlayerImage
                code={PLAYERS[index % PLAYERS.length].code}
                name={PLAYERS[index % PLAYERS.length].name}
                size="xs"
              />
            </PitchSlot>
          ))}
        </Pitch>
      </Section>

      <Section title="Charts" description="Every mark in the kit, on illustrative data.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Line</CardTitle>
            </CardHeader>
            <CardBody>
              <LineChart
                height={200}
                ariaLabel="Line chart"
                series={[{ id: 'xp', label: 'xP', points: SERIES }]}
                formatX={(value) => `GW${value}`}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Area</CardTitle>
            </CardHeader>
            <CardBody>
              <AreaChart
                height={200}
                ariaLabel="Area chart"
                series={[{ id: 'xp', label: 'xP', points: SERIES }]}
                formatX={(value) => `GW${value}`}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bar</CardTitle>
            </CardHeader>
            <CardBody>
              <BarChart
                height={200}
                ariaLabel="Bar chart"
                data={SERIES.map((point) => ({
                  key: String(point.x),
                  label: `GW${point.x}`,
                  value: point.y,
                }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Stacked, with deductions below zero</CardTitle>
            </CardHeader>
            <CardBody>
              <StackedBarChart
                height={200}
                ariaLabel="Stacked bar chart"
                keys={[
                  { id: 'goals', label: 'Goals' },
                  { id: 'assists', label: 'Assists' },
                  { id: 'bonus', label: 'Bonus' },
                  { id: 'negative', label: 'Deductions' },
                ]}
                data={PLAYERS.map((player, index) => ({
                  key: String(player.code),
                  label: player.name,
                  values: {
                    goals: 2 + index * 0.4,
                    assists: 1.1,
                    bonus: 0.6,
                    negative: -0.4,
                  },
                }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Points distribution</CardTitle>
            </CardHeader>
            <CardBody>
              <Distribution
                pmf={PMF}
                mean={4.3}
                band={{ lo: 1, hi: 9 }}
                regions
                height={220}
                ariaLabel="Points distribution"
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Radar</CardTitle>
            </CardHeader>
            <CardBody>
              <RadarChart
                height={240}
                ariaLabel="Radar chart"
                axes={[
                  { id: 'xg', label: 'xG' },
                  { id: 'xa', label: 'xA' },
                  { id: 'bps', label: 'BPS' },
                  { id: 'mins', label: 'Minutes' },
                  { id: 'pts', label: 'Points' },
                ]}
                series={[
                  { id: 'a', label: 'Player A', values: { xg: 0.8, xa: 0.4, bps: 0.7, mins: 0.9, pts: 0.75 } },
                  { id: 'b', label: 'Player B', values: { xg: 0.5, xa: 0.7, bps: 0.55, mins: 0.8, pts: 0.6 } },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scatter with quadrants</CardTitle>
            </CardHeader>
            <CardBody>
              <ScatterPlot
                height={240}
                ariaLabel="Scatter plot"
                xLabel="Ownership"
                yLabel="xP"
                quadrants={{ x: 10, y: 4.5 }}
                showLabels
                data={PLAYERS.map((player, index) => ({
                  id: String(player.code),
                  label: player.name,
                  x: 4 + index * 6,
                  y: 3.4 + index * 0.7,
                }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Fixture difficulty grid</CardTitle>
            </CardHeader>
            <CardBody>
              <HeatmapGrid
                ariaLabel="Fixture difficulty"
                columns={[1, 2, 3, 4, 5].map((event) => ({ event, label: `GW${event}` }))}
                rows={PLAYERS.map((player, rowIndex) => ({
                  id: String(player.code),
                  label: player.name,
                  cells: [1, 2, 3, 4, 5].map((event) => ({
                    event,
                    entries:
                      event === 3 && rowIndex === 1
                        ? []
                        : [
                            {
                              label: 'OPP',
                              isHome: event % 2 === 0,
                              difficulty: ((event + rowIndex) % 5) + 1,
                            },
                          ],
                  })),
                }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Calibration</CardTitle>
            </CardHeader>
            <CardBody>
              <CalibrationChart
                height={220}
                ariaLabel="Calibration"
                xLabel="Predicted"
                yLabel="Realised"
                series={[
                  {
                    id: 'model',
                    label: 'Ensemble',
                    bins: [
                      { pred_mean: 1, actual_mean: 1.2, n: 40 },
                      { pred_mean: 2, actual_mean: 2.1, n: 44 },
                      { pred_mean: 3, actual_mean: 2.7, n: 38 },
                      { pred_mean: 4, actual_mean: 4.3, n: 30 },
                      { pred_mean: 5, actual_mean: 5.4, n: 22 },
                    ],
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Uncertainty rows, gauge, waffle, bullet</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <BoxRow
                ariaLabel="Uncertainty rows"
                data={PLAYERS.map((player, index) => ({
                  id: String(player.code),
                  label: player.name,
                  p10: 1 + index * 0.3,
                  p25: 2 + index * 0.3,
                  p50: 4 + index * 0.4,
                  p75: 6 + index * 0.5,
                  p90: 9 + index * 0.5,
                  mean: 4.4 + index * 0.4,
                }))}
              />
              <div className="flex flex-wrap items-center gap-8">
                <GaugeArc value={0.68} label="Start probability" ariaLabel="Start probability" />
                <WaffleChart value={0.42} label="Ownership" ariaLabel="Ownership share" />
              </div>
              <BulletChart
                value={5.2}
                comparison={4.0}
                comparisonLabel="FPL ep_next"
                label="Model xP"
                ariaLabel="Model expected points against the game's own forecast"
              />
              <Sparkline points={[3, 4, 3.5, 5, 6, 5.5, 7]} ariaLabel="Sparkline" lastPoint area />
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="Reference">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3 text-[13px] text-text-muted">
            <Sparkles className="size-4" />
            Every value on this page is illustrative. Everywhere else in the app, numbers come from the
            engine and a missing value renders as an explicit no-data state.
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
