import { AlertTriangle, CheckCircle2, CircleSlash, Database, PlugZap, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { GlowCard } from '@/components/kokonut';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  SkeletonRows,
  Tooltip,
  toast,
} from '@/components/ui';
import { QueryError } from '@/components/QueryState';
import { PageHeader, Section } from '@/components/layout';
import { relativeTime } from '@/lib/format';
import { useMeta, useRefreshRun, useRunIngest, useSources, type SourceRow } from '@/hooks/useEngine';

/**
 * The honesty page. Every row is read from the ingest log, so a source that has
 * never landed says so rather than being represented by an empty table that
 * looks like "no results".
 */

const STATUS_TONE: Record<string, { tone: 'good' | 'warning' | 'critical' | 'neutral'; label: string }> = {
  ok: { tone: 'good', label: 'Live' },
  partial: { tone: 'warning', label: 'Partial' },
  unreachable: { tone: 'warning', label: 'Unreachable' },
  unconfigured: { tone: 'neutral', label: 'Not configured' },
  error: { tone: 'critical', label: 'Error' },
  never: { tone: 'neutral', label: 'Never run' },
  running: { tone: 'neutral', label: 'Running' },
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok' || status === 'partial') return <CheckCircle2 className="size-4 text-good" />;
  if (status === 'error') return <AlertTriangle className="size-4 text-critical" />;
  if (status === 'unreachable') return <PlugZap className="size-4 text-warning" />;
  return <CircleSlash className="size-4 text-text-faint" />;
}

function SourceCard({ source }: { source: SourceRow }) {
  const ingest = useRunIngest();
  const meta = STATUS_TONE[source.status] ?? STATUS_TONE.never;
  const shortName = source.source.replace(/^fpl_/, '');

  return (
    <GlowCard className="h-full">
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="space-y-2">
          {/* The status badge shares the title's row only. Keeping the purpose
              text out of it lets the copy use the card's full width instead of
              wrapping every two words beside the badge. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <StatusIcon status={source.status} />
              <h3 className="font-display text-[15px] font-semibold leading-snug">{source.label}</h3>
            </div>
            <Badge tone={meta.tone} className="shrink-0">
              {meta.label}
            </Badge>
          </div>
          <p className="text-[13px] leading-relaxed text-text-muted">{source.purpose}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
          <div>
            <dt className="text-text-faint">Rows in table</dt>
            <dd className="font-medium tabular-nums">{(source.table_rows ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Last success</dt>
            <dd className="font-medium">
              {source.last_success ? relativeTime(source.last_success) : 'never'}
            </dd>
          </div>
        </dl>

        {source.requires.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {source.requires.map((env) => (
              <Tooltip
                key={env}
                content={
                  source.missing_env?.includes(env)
                    ? `${env} is not set — this source writes nothing until it is`
                    : `${env} is set`
                }
              >
                <span>
                  <Badge tone={source.missing_env?.includes(env) ? 'warning' : 'good'}>
                    <code className="font-mono text-[11px]">{env}</code>
                  </Badge>
                </span>
              </Tooltip>
            ))}
            {(source.extras ?? []).map((pkg) => (
              <Badge key={pkg} tone="neutral">
                <code className="font-mono text-[11px]">pip install {pkg}</code>
              </Badge>
            ))}
          </div>
        )}

        {source.message && (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[12px] leading-relaxed text-text-muted">
            {source.message}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            loading={ingest.isPending}
            onClick={() =>
              ingest.mutate(shortName, {
                onSuccess: (result) => {
                  const r = result as { message?: string; mode?: string };
                  toast({
                    title: `${source.label}: ${r.mode ?? 'done'}`,
                    description: r.message,
                  });
                },
                onError: (error) =>
                  toast({ title: `${source.label} failed`, description: String(error), tone: 'critical' }),
              })
            }
          >
            <RefreshCw className="size-3.5" />
            Run ingest
          </Button>
          {source.docs_url && (
            <a
              className="text-[12.5px] text-text-muted underline-offset-2 hover:text-accent hover:underline"
              href={source.docs_url}
              target="_blank"
              rel="noreferrer"
            >
              Source docs
            </a>
          )}
        </div>
      </div>
    </GlowCard>
  );
}

export default function SourcesPage() {
  const sources = useSources();
  const meta = useMeta();
  const refresh = useRefreshRun();
  const [horizon] = useState(5);

  return (
    <>
      <PageHeader
        title="Data sources"
        subtitle="What the engine has actually ingested, and what it is still missing."
        actions={
          <Button
            loading={refresh.isPending}
            onClick={() =>
              refresh.mutate(
                { horizon },
                {
                  onSuccess: () =>
                    toast({ title: 'Models refitted', description: 'Every view now reads the new run.' }),
                  onError: (error) =>
                    toast({ title: 'Refit failed', description: String(error), tone: 'critical' }),
                },
              )
            }
          >
            <Database className="size-4" />
            Refit models
          </Button>
        }
      />

      <Section
        title="Ingest status"
        description="A source that cannot be reached writes nothing. No value shown anywhere in this app is interpolated to cover a gap."
      >
        {sources.isLoading && <SkeletonRows rows={3} />}
        {sources.isError && <QueryError error={sources.error} onRetry={() => void sources.refetch()} />}
        {sources.data && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sources.data.map((source) => (
              <SourceCard key={source.source} source={source} />
            ))}
          </div>
        )}
      </Section>

      {meta.data?.active_run && (
        <Section
          title="Active model run"
          description="Every number in the app is read from this run, not recomputed per request."
        >
          <Card>
            <CardHeader>
              <CardTitle>{meta.data.active_run.run_id}</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-text-faint">Target gameweek</dt>
                  <dd className="font-medium tabular-nums">
                    GW{meta.data.active_run.target_event} · horizon {meta.data.active_run.horizon}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-faint">Players scored</dt>
                  <dd className="font-medium tabular-nums">{meta.data.active_run.n_players}</dd>
                </div>
                <div>
                  <dt className="text-text-faint">Training rows</dt>
                  <dd className="font-medium tabular-nums">{meta.data.active_run.n_train_rows}</dd>
                </div>
                <div>
                  <dt className="text-text-faint">Snapshot captured</dt>
                  <dd className="font-medium">
                    {meta.data.active_run.snapshot_captured_at
                      ? relativeTime(meta.data.active_run.snapshot_captured_at)
                      : 'unknown'}
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-text-faint">Feature source</dt>
                  <dd className="font-medium">{meta.data.active_run.season_source ?? 'unknown'}</dd>
                </div>
                {meta.data.active_run.history_rows === 0 && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="text-text-faint">Per-gameweek history</dt>
                    <dd className="leading-relaxed text-text-muted">
                      Not ingested. The models are scored against season aggregates, which measures how
                      well the rate-to-points mapping is recovered rather than forward forecasting skill.
                      Run the <code className="font-mono text-[12px]">history</code> ingest above to add
                      CRPS and per-gameweek calibration.
                    </dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
        </Section>
      )}
    </>
  );
}
