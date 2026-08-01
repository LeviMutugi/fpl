import { Monitor, Moon, Sun } from 'lucide-react';

import { PageHeader, Section } from '@/components/layout';
import { Card, CardBody, CardHeader, CardTitle, SegmentedControl, Switch } from '@/components/ui';
import { usePrefs } from '@/lib/prefs';
import { useUiStore } from '@/lib/uiStore';
import { useTheme } from '@/providers';
import { useMeta } from '@/hooks/useEngine';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
  { value: 'system', label: 'System', icon: <Monitor className="size-3.5" /> },
];

export default function SettingsPage() {
  const { mode, setMode, resolved } = useTheme();
  const prefs = usePrefs();
  const dense = useUiStore((s) => s.dense);
  const setDense = useUiStore((s) => s.setDense);
  const meta = useMeta();

  return (
    <>
      <PageHeader title="Settings" subtitle="Appearance and default view preferences." />

      <Section title="Appearance">
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-medium">Colour scheme</p>
                <p className="text-[12.5px] text-text-muted">
                  Currently rendering in {resolved} mode.
                </p>
              </div>
              <SegmentedControl
                value={mode}
                onChange={(value) => setMode(value as typeof mode)}
                ariaLabel="Colour scheme"
                options={THEME_OPTIONS}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <div>
                <p className="text-[13.5px] font-medium">Reduce motion</p>
                <p className="text-[12.5px] text-text-muted">
                  Turn off spring animations and transitions. Your system setting is respected
                  regardless of this switch.
                </p>
              </div>
              <Switch
                checked={prefs.reduceMotion}
                onChange={prefs.setReduceMotion}
                label="Reduce motion"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <div>
                <p className="text-[13.5px] font-medium">Compact tables</p>
                <p className="text-[12.5px] text-text-muted">
                  Tighter row height in the player explorer, for more rows per screen.
                </p>
              </div>
              <Switch checked={dense} onChange={setDense} label="Compact tables" />
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Defaults" description="Applied to every view that reads a model or horizon.">
        <Card>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-medium">Model</p>
                <p className="text-[12.5px] text-text-muted">
                  Which of the run's models drives the numbers you see.
                </p>
              </div>
              <SegmentedControl
                value={prefs.model}
                onChange={(value) => prefs.setModel(value as typeof prefs.model)}
                ariaLabel="Default model"
                options={[
                  { value: 'ensemble', label: 'Ensemble' },
                  { value: 'structural', label: 'Structural' },
                  { value: 'lgbm', label: 'LightGBM' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <div>
                <p className="text-[13.5px] font-medium">Planning horizon</p>
                <p className="text-[12.5px] text-text-muted">
                  Gameweeks summed for horizon xP and squad optimisation.
                </p>
              </div>
              <SegmentedControl
                value={String(prefs.horizon)}
                onChange={(value) => prefs.setHorizon(Number(value))}
                ariaLabel="Default planning horizon"
                options={[1, 3, 5, 8].map((n) => ({ value: String(n), label: `${n} GW` }))}
              />
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Engine">
        <Card>
          <CardBody>
            <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-text-faint">Season</dt>
                <dd className="font-medium">{meta.data?.season ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-faint">Priors learned from</dt>
                <dd className="font-medium">{meta.data?.prior_season ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-faint">Players in database</dt>
                <dd className="font-medium tabular-nums">{meta.data?.counts.players ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-faint">Stored predictions</dt>
                <dd className="font-medium tabular-nums">
                  {meta.data?.counts.predictions?.toLocaleString() ?? '—'}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
