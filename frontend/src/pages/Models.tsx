import { useNavigate } from 'react-router-dom';

import { BarChart, CalibrationChart } from '@/components/charts';
import { QueryError } from '@/components/QueryState';
import { PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonRows,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tooltip,
} from '@/components/ui';
import { NO_DATA, num } from '@/lib/format';
import { useLeaderboard } from '@/hooks/useEngine';

/**
 * The Model Lab exists to make the engine falsifiable. Every number here is
 * measured on held-out folds and stored with the run; a model that could not be
 * scored is listed with the reason rather than quietly dropped, because an
 * absent row is indistinguishable from a model that simply lost.
 */

const METRIC_COLUMNS: { key: string; label: string; decimals: number; hint: string; higherIsBetter: boolean }[] = [
  { key: 'spearman', label: 'Spearman', decimals: 3, hint: 'Rank correlation with realised points per 90', higherIsBetter: true },
  { key: 'mae', label: 'MAE', decimals: 3, hint: 'Mean absolute error, minutes-weighted', higherIsBetter: false },
  { key: 'rmse', label: 'RMSE', decimals: 3, hint: 'Root mean squared error', higherIsBetter: false },
  { key: 'r2', label: 'R²', decimals: 3, hint: 'Variance explained; negative means worse than the mean', higherIsBetter: true },
  { key: 'precision_top_decile', label: 'Top 10%', decimals: 3, hint: 'Share of the model’s top decile that is genuinely top decile', higherIsBetter: true },
];

/** Drop a trailing parenthetical; "LightGBM quantile" must stay distinct from
 *  "LightGBM rate-to-points", so this trims rather than takes the first word. */
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export default function ModelsPage() {
  const navigate = useNavigate();
  const query = useLeaderboard();

  if (query.isLoading) return <SkeletonRows rows={6} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <EmptyState title="No run" description="The engine has not completed a model run." />;

  const { run, models, calibration, importance, disagreement } = query.data;
  const evaluation = asRecord(run.evaluation);
  const assumptions = asRecord(run.assumptions);
  const gbm = asRecord(run.gbm);
  const excluded = asRecord(gbm.excluded_features);
  const features = Array.isArray(gbm.features) ? (gbm.features as string[]) : [];
  const lgbmImportance = importance.find((entry) => entry.model_id === 'lgbm');

  // Only the models that actually carry a per-player prediction this gameweek
  // get a column. Deriving them from the rows rather than the model list keeps
  // a model that stored no predictions from adding a column of em-dashes.
  const comparedIds = new Set(disagreement.flatMap((row) => Object.keys(row.by_model)));
  const compared = models.filter((model) => comparedIds.has(model.model_id));

  return (
    <>
      <PageHeader
        title="Model lab"
        subtitle={`Run ${run.run_id} · ${run.n_train_rows} training rows · ${String(evaluation.scheme ?? 'cross-validated')}`}
      />

      <Section
        title="How to read these numbers"
        description="The measurement scheme, stated before the scores it produced."
      >
        <Card>
          <CardBody className="space-y-3 text-[13px] leading-relaxed">
            <p>
              <span className="text-text-faint">Target:</span> {String(evaluation.target ?? '—')}
            </p>
            <p>
              <span className="text-text-faint">Scheme:</span> {String(evaluation.scheme ?? '—')} over{' '}
              {String(evaluation.n ?? '—')} players, weighted by {String(evaluation.weight ?? 'minutes')}.
            </p>
            {asString(evaluation.note) && (
              <p className="rounded-xl bg-warning-soft px-3 py-2.5 text-text">{asString(evaluation.note)}</p>
            )}
            {asString(evaluation.estimand_note) && (
              <p className="rounded-xl bg-surface-sunken px-3 py-2.5 text-text-muted">
                {asString(evaluation.estimand_note)}
              </p>
            )}
          </CardBody>
        </Card>
      </Section>

      <Section title="Leaderboard" description="Measured out of fold. Nothing here is hand-entered.">
        <Card padding="none">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Model</TableHeaderCell>
                <TableHeaderCell align="right">Blend weight</TableHeaderCell>
                {METRIC_COLUMNS.map((column) => (
                  <TableHeaderCell key={column.key} align="right">
                    <Tooltip content={column.hint}>
                      <span>{column.label}</span>
                    </Tooltip>
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.model_id}>
                  <TableCell>
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className="mt-1.5 size-2.5 shrink-0 rounded-full"
                        style={{ background: `oklch(70% 0.14 ${model.hue})` }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{model.name}</p>
                        <p className="text-[12px] leading-relaxed text-text-faint">{model.description}</p>
                        {!model.available && (
                          <p className="mt-1 text-[12px] text-warning">
                            Not scored: {model.unavailable_reason ?? 'no measured metrics in this run'}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell align="right" numeric>
                    {model.stack_weight === null || model.stack_weight === undefined
                      ? NO_DATA
                      : num(model.stack_weight, 3)}
                  </TableCell>
                  {METRIC_COLUMNS.map((column) => (
                    <TableCell key={column.key} align="right" numeric>
                      {model.metrics[column.key] === undefined
                        ? NO_DATA
                        : num(model.metrics[column.key], column.decimals)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      {calibration.length > 0 && (
        <Section
          title="Calibration"
          description="Predicted against realised, in equal-count bins. A model on the diagonal is honest about its own scale."
        >
          <Card>
            <CardBody>
              <CalibrationChart
                height={340}
                ariaLabel="Predicted against realised points per 90"
                xLabel="Predicted points per 90"
                yLabel="Realised points per 90"
                series={calibration.map((entry) => {
                  const model = models.find((m) => m.model_id === entry.model_id);
                  return {
                    id: entry.model_id,
                    label: model?.name ?? entry.model_id,
                    token: model ? `oklch(70% 0.14 ${model.hue})` : undefined,
                    bins: entry.bins,
                  };
                })}
              />
            </CardBody>
          </Card>
        </Section>
      )}

      {lgbmImportance && lgbmImportance.features.length > 0 && (
        <Section
          title="What the boosted model leans on"
          description="Total split gain per feature. High gain means the feature separated outcomes, not that it is causal."
        >
          <Card>
            <CardBody>
              <BarChart
                orientation="horizontal"
                height={Math.max(240, lgbmImportance.features.length * 26)}
                ariaLabel="LightGBM feature importance by gain"
                data={lgbmImportance.features.map((feature) => ({
                  key: feature.feature,
                  label: feature.feature.replace(/_/g, ' '),
                  value: feature.gain,
                }))}
              />
            </CardBody>
          </Card>
        </Section>
      )}

      {disagreement.length > 0 && (
        <Section
          title="Where the models disagree"
          description="The widest spread between models on the target gameweek — the players whose forecast you should trust least."
        >
          <Card padding="none">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Player</TableHeaderCell>
                  <TableHeaderCell>Pos</TableHeaderCell>
                  <TableHeaderCell align="right">Spread</TableHeaderCell>
                  {compared.map((model) => (
                    <TableHeaderCell key={model.model_id} align="right">
                      {shortName(model.name)}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {disagreement.slice(0, 20).map((row) => (
                  <TableRow key={row.player_id} onClick={() => navigate(`/players/${row.player_id}`)}>
                    <TableCell>
                      <span className="font-medium">{row.web_name}</span>
                      <span className="ml-1.5 text-[12px] text-text-faint">{row.team}</span>
                    </TableCell>
                    <TableCell>
                      <Badge tone="neutral">{row.position}</Badge>
                    </TableCell>
                    <TableCell align="right" numeric>
                      {num(row.spread, 2)}
                    </TableCell>
                    {compared.map((model) => (
                      <TableCell key={model.model_id} align="right" numeric>
                        {row.by_model[model.model_id] === undefined
                          ? NO_DATA
                          : num(row.by_model[model.model_id], 2)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>
      )}

      <Section
        title="Assumptions and exclusions"
        description="The parts of the model that are stated rather than learned, and the features deliberately kept out."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Stated assumptions</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-2 text-[13px]">
                {(
                  [
                    ['Home attack factor', assumptions.home_attack_factor],
                    ['Away attack factor', assumptions.away_attack_factor],
                    ['Minutes if starting', assumptions.minutes_if_start],
                    ['Minutes if substitute', assumptions.minutes_if_sub],
                    ['P(60 minutes | start)', assumptions.p_sixty_given_start],
                    ['Saves per point', assumptions.saves_per_point],
                    ['Goals conceded per deduction', assumptions.conceded_per_penalty],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="tabular-nums">{value === undefined ? NO_DATA : String(value)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-border pt-2">
                  <dt className="text-text-muted">Defensive contributions</dt>
                  <dd>
                    {assumptions.defensive_contribution_available === true ? (
                      'available'
                    ) : (
                      <Tooltip content="The API returns zero for these counters outside a live season, so the model scores them at zero and says so rather than guessing.">
                        <span className="text-warning">not in this snapshot</span>
                      </Tooltip>
                    )}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Features excluded on purpose</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <dl className="space-y-2 text-[13px]">
                {Object.entries(excluded).map(([feature, reason]) => (
                  <div key={feature}>
                    <dt className="font-mono text-[12px]">{feature}</dt>
                    <dd className="text-text-muted">{String(reason)}</dd>
                  </div>
                ))}
                {Object.keys(excluded).length === 0 && (
                  <p className="text-text-muted">No exclusions recorded for this run.</p>
                )}
              </dl>
              {features.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-1.5 text-[12.5px] font-medium">Features used ({features.length})</p>
                  <p className="font-mono text-[11.5px] leading-relaxed text-text-faint">
                    {features.join(', ')}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </Section>
    </>
  );
}
