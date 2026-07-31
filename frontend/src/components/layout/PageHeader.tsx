import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BlurInText } from '@/components/kokonut/BlurInText';

export type Crumb = {
  label: string;
  /** Omit for the current page. */
  to?: string;
};

export type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** Buttons, filters or a segmented control pinned to the right. */
  actions?: ReactNode;
  breadcrumb?: readonly Crumb[];
  /** A small mark rendered left of the title. */
  icon?: ReactNode;
  /** Reveal the title word-by-word. Ignored under reduced motion. */
  animate?: boolean;
  /** Extra content below the subtitle, above any actions on narrow screens. */
  children?: ReactNode;
  className?: string;
};

/**
 * The top of every page: breadcrumb, title, one-line explanation of what the
 * page is for, and a right-hand actions slot that drops below the title on
 * narrow screens rather than squeezing it.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  icon,
  animate = false,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex min-w-0 flex-col gap-4', className)}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[12px] text-text-faint">
            {breadcrumb.map((crumb, index) => {
              const last = index === breadcrumb.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                  {index > 0 ? <ChevronRight size={13} aria-hidden className="opacity-60" /> : null}
                  {crumb.to && !last ? (
                    <Link
                      to={crumb.to}
                      className="truncate rounded-[6px] transition-colors hover:text-text"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn('truncate', last && 'text-text-muted')}
                      aria-current={last ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              aria-hidden
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[16px] bg-surface-sunken text-text-muted ring-1 ring-inset ring-border"
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-semibold leading-tight text-text sm:text-[30px]">
              {animate ? <BlurInText text={title} /> : title}
            </h1>
            {subtitle ? (
              <p className="mt-1.5 max-w-[68ch] text-balance text-[14px] leading-relaxed text-text-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        ) : null}
      </div>

      {children}
    </header>
  );
}
