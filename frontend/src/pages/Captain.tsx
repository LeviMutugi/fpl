import { Crown, Info } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { BoxRow } from '@/components/charts';
import { DifficultyPill, PlayerImage, PositionPill, XpBadge } from '@/components/football';
import { StatTile } from '@/components/kokonut';
import { MetricRow, PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  SkeletonRows,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { NO_DATA, num, ownership, pct } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useCaptaincy, type CaptaincyRow } from '@/hooks/useEngine';
import type { ViolinDatum } from '@/components/charts';

/**
 * Captaincy. The armband doubles the whole distribution, not just the mean, so
 * the ranking is on expected points but every card carries the spread that
 * produced it — a 6.2 built on a fat tail is a different bet from a 6.2 built
 * on ninety safe minutes.
 */

function errorProps(error: unknown): {
  detail: string;
  hint: string | null;
  tone: 'error' | 'unavailable';
} {
  // The backend writes `detail`/`hint` for humans — pass them through verbatim.
  if (error instanceof ApiRequestError) {
    return {
      detail: error.detail,
      hint: error.hint ?? null,
      tone: error.isUnavailable ? 'unavailable' : 'error',
    };
  }
  return {
    detail: error instanceof Error ? error.message : String(error),
    hint: null,
    tone: 'error',
  };
}

function CandidateCard({ row, rank }: { row: CaptaincyRow; rank: number }) {
  return (
    <Card interactive className="h-full">
      <CardBody className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 w-5 shrink-0 text-right font-display text-[15px] font-semibold tabular-nums text-text-faint">
            {rank}
          </span>
          <PlayerImage
            code={row.code}
            name={row.web_name}
            candidates={row.photo.candidates}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <Link
              to={`/players/${row.id}`}
              className="block truncate font-display text-[16px] font-semibold hover:text-accent"
            >
              {row.web_name}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-text-muted">
              <PositionPill position={row.position} size="xs" />
              <span>{row.team}</span>
              {row.opponent ? (
                <span>
                  vs {row.opponent} {row.is_home === null ? '' : row.is_home ? '(H)' : '(A)'}
                </span>
              ) : (
                <span className="text-text-faint">no fixture</span>
              )}
              {row.difficulty === null ? null : <DifficultyPill value={row.difficulty} size="xs" />}
            </div>
          </div>
          <XpBadge xp={row.captain_xp} decimals={2} label="C" tone="accent" size="md" />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
          <div>
            <dt className="text-text-faint">xP</dt>
            <dd className="num font-semibold">{num(row.xp, 2)}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Captain xP (2×)</dt>
            <dd className="num font-semibold">{num(row.captain_xp, 2)}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Haul (10+)</dt>
            <dd className="num font-semibold">{pct(row.p_haul, 1)}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Blank</dt>
            <dd className="num font-semibold">{pct(row.p_blank, 1)}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Ceiling (p90)</dt>
            <dd className="num font-semibold">{num(row.ceiling, 1)}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Floor (p10)</dt>
            <dd className="num font-semibold">{num(row.floor, 1)}</dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-[11.5px] text-text-faint">
          <Badge tone="neutral" size="xs">
            {num(row.exp_minutes, 0)} expected minutes
          </Badge>
          <Badge tone="neutral" size="xs">
            σ {num(row.std, 2)}
          </Badge>
          <Badge tone="neutral" size="xs">
            Effective ownership{' '}
            {row.effective_ownership === null ? NO_DATA : ownership(row.effective_ownership)}
          </Badge>
        </div>
      </CardBody>
    </Card>
  );
}

export default function CaptainPage() {
  const prefs = usePrefs();
  const captaincy = useCaptaincy(prefs.model);

  const candidates = captaincy.data?.candidates ?? [];
  const top = candidates[0] ?? null;

  /** The spread chart only reads the quantiles the run actually stored. */
  const spread = useMemo<ViolinDatum[]>(
    () =>
      candidates
        .slice(0, 6)
        .filter((row): row is CaptaincyRow & { prediction: NonNullable<CaptaincyRow['prediction']> } =>
          Boolean(row.prediction),
        )
        .map((row) => ({
          id: String(row.id),
          label: row.web_name,
          p10: row.prediction.p10,
          p25: row.prediction.p25,
          p50: row.prediction.p50,
          p75: row.prediction.p75,
          p90: row.prediction.p90,
          mean: row.prediction.xp,
        })),
    [candidates],
  );

  return (
    <>
      <PageHeader
        title="Captaincy"
        icon={<Crown className="size-5" />}
        subtitle={
          captaincy.data
            ? `GW${captaincy.data.event}, ranked by the ${prefs.model} model's expected points.`
            : `Ranked by the ${prefs.model} model's expected points.`
        }
      />

      <MetricRow columns={4} loading={captaincy.isLoading}>
        <StatTile
          label="Top candidate xP"
          value={top?.xp ?? null}
          decimals={2}
          hint={top ? `${top.web_name} · ${top.team}` : undefined}
        />
        <StatTile
          label="With the armband"
          value={top?.captain_xp ?? null}
          decimals={2}
          hint="Doubled, as the game scores it"
        />
        <StatTile
          label="Haul probability"
          value={top === null ? null : top.p_haul * 100}
          decimals={1}
          suffix="%"
          hint="Ten or more points"
        />
        <StatTile
          label="Candidates scored"
          value={candidates.length === 0 ? null : candidates.length}
          decimals={0}
          hint="Players with a prediction this gameweek"
        />
      </MetricRow>

      {captaincy.data?.note && (
        <Card tone="sunken" className="mt-6">
          <CardBody className="flex gap-3 text-[13px] leading-relaxed text-text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-text-faint" aria-hidden />
            <p>{captaincy.data.note}</p>
          </CardBody>
        </Card>
      )}

      <Section
        title="Spread across the top six"
        description="p10 to p90 whisker, p25–p75 box, median tick and the mean as a diamond — all on one shared scale, so two candidates' risk profiles are directly comparable."
      >
        {captaincy.isLoading && <SkeletonRows rows={3} />}
        {captaincy.isError && (
          <ErrorState
            title="Could not load captaincy candidates"
            {...errorProps(captaincy.error)}
            onRetry={() => void captaincy.refetch()}
          />
        )}
        {captaincy.data && spread.length === 0 && (
          <EmptyState
            title="No stored quantiles"
            description="The active run has no per-player distribution for this gameweek, so the spread cannot be drawn."
            icon={Crown}
          />
        )}
        {spread.length > 0 && (
          <Card padding="sm">
            <BoxRow
              data={spread}
              ariaLabel="Expected points spread for the top six captaincy candidates"
              tableCaption="Captaincy candidates, p10 to p90"
              labelWidth={110}
              rowHeight={34}
            />
          </Card>
        )}
      </Section>

      <Section
        title="Ranked candidates"
        description="Expected points is the ranking; the haul and blank probabilities are what the armband is really buying."
      >
        {captaincy.isLoading && <SkeletonRows rows={4} />}
        {captaincy.data && candidates.length === 0 && (
          <EmptyState
            title="No candidates"
            description="The engine has no scored players for this gameweek. Refit the models from the Data Sources page."
            icon={Crown}
          />
        )}
        {candidates.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {candidates.slice(0, 12).map((row, index) => (
              <CandidateCard key={row.id} row={row} rank={index + 1} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
