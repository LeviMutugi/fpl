import type { ReactNode } from 'react';
import { AlertTriangle, PlugZap, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export type ErrorStateProps = {
  title: string;
  /** The backend's `detail`. Shown verbatim — it is written for humans. */
  detail?: string | null;
  /** The backend's `hint`, if any. */
  hint?: string | null;
  /** `unavailable` = the engine's explicit 503 "not ready / unconfigured". */
  tone?: 'error' | 'unavailable';
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
};

export function ErrorState({
  title,
  detail,
  hint,
  tone = 'error',
  onRetry,
  retryLabel = 'Try again',
  action,
  size = 'md',
  className,
}: ErrorStateProps) {
  const Icon = tone === 'unavailable' ? PlugZap : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-[22px] border',
        tone === 'unavailable'
          ? 'border-border bg-warning-soft/40'
          : 'border-[color:var(--color-critical)]/35 bg-critical-soft/40',
        size === 'sm' ? 'p-3.5' : 'p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[12px]',
            tone === 'unavailable'
              ? 'bg-[color:var(--color-warning)]/25 text-[color:var(--color-fdr-4-ink)]'
              : 'bg-[color:var(--color-critical)]/20 text-[color:var(--color-delta-down)]',
          )}
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold text-text">{title}</p>
          {detail ? (
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted break-words">{detail}</p>
          ) : null}
          {hint ? (
            <p className="mt-2 rounded-[12px] bg-surface px-2.5 py-1.5 text-[12.5px] leading-relaxed text-text-muted ring-1 ring-border">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
      {onRetry || action ? (
        <div className="flex flex-wrap items-center gap-2 pl-11">
          {onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry} iconLeft={<RefreshCw size={14} />}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
