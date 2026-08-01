import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SectionProps = {
  title: ReactNode;
  /** One line explaining what the reader is looking at. */
  description?: ReactNode;
  /** Controls for this section only — filters, a toggle, a "view all" link. */
  actions?: ReactNode;
  /** A small mark rendered left of the heading. */
  icon?: ReactNode;
  children: ReactNode;
  /** Heading level; keep the document outline sane. */
  level?: 2 | 3 | 4;
  /** Anchor target, so the command palette can deep-link to a section. */
  id?: string;
  /** Vertical rhythm below the previous block. */
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
  headerClassName?: string;
};

const SPACING = { sm: 'mt-5', md: 'mt-8', lg: 'mt-12' } as const;

const HEADING = {
  2: 'text-[19px]',
  3: 'text-[16px]',
  4: 'text-[14px]',
} as const;

/**
 * A titled block of a page. Nothing more than a heading, an optional
 * description and its content — but it keeps every page's rhythm and heading
 * levels consistent without each one reinventing them.
 */
export function Section({
  title,
  description,
  actions,
  icon,
  children,
  level = 2,
  id,
  spacing = 'md',
  className,
  headerClassName,
}: SectionProps) {
  const Heading = (level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4';

  return (
    <section id={id} className={cn('min-w-0 first:mt-0', SPACING[spacing], className)}>
      <div
        className={cn(
          'mb-3.5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between',
          headerClassName,
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          {icon ? (
            <span
              aria-hidden
              className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-[10px] bg-surface-sunken text-text-muted ring-1 ring-inset ring-border"
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
          <Heading
            className={cn('font-display font-semibold leading-tight text-text', HEADING[level])}
          >
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-text-muted">
              {description}
            </p>
          ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
