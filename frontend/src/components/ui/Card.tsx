import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Visual weight. `raised` sits above the page, `sunken` below it. */
  tone?: 'default' | 'raised' | 'sunken' | 'ghost';
  /** Corner size. Cards default to `lg` (22px); heroes use `xl`/`2xl`. */
  radius?: 'md' | 'lg' | 'xl' | '2xl';
  /** Draw a soft accent gradient hairline instead of a flat border. */
  gradientBorder?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
};

const RADIUS: Record<NonNullable<CardProps['radius']>, string> = {
  md: 'rounded-[16px]',
  lg: 'rounded-[22px]',
  xl: 'rounded-[28px]',
  '2xl': 'rounded-[36px]',
};

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-7',
};

const TONE: Record<NonNullable<CardProps['tone']>, string> = {
  default: 'bg-surface border border-border shadow-soft',
  raised: 'bg-surface-raised border border-border shadow-lift',
  sunken: 'bg-surface-sunken border border-border/70',
  ghost: 'bg-transparent border border-transparent',
};

export function Card({
  tone = 'default',
  radius = 'lg',
  gradientBorder = false,
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const shell = cn(
    'relative isolate min-w-0',
    RADIUS[radius],
    TONE[tone],
    interactive &&
      'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lift focus-visible:-translate-y-0.5',
    className,
  );

  if (!gradientBorder) {
    return (
      <div className={cn(shell, PADDING[padding])} {...rest}>
        {children}
      </div>
    );
  }

  // Gradient hairline: a padded wrapper carrying the gradient, with the real
  // surface inset by 1px. Keeps the same radius family on both layers.
  return (
    <div
      className={cn(
        'relative isolate min-w-0 p-px',
        RADIUS[radius],
        'bg-[linear-gradient(140deg,var(--color-accent)_0%,var(--color-pitch-turf)_45%,var(--color-border)_100%)]',
        'shadow-soft',
        interactive &&
          'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
      {...rest}
    >
      <div className={cn('h-full w-full bg-surface', RADIUS[radius], PADDING[padding])}>
        {children}
      </div>
    </div>
  );
}

export type CardHeaderProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
};

export function CardHeader({ actions, className, children, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cn('mb-3 flex items-start justify-between gap-3 min-w-0', className)}
      {...rest}
    >
      <div className="min-w-0">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type CardTitleProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  subtitle?: ReactNode;
};

export function CardTitle({ as, subtitle, className, children, ...rest }: CardTitleProps) {
  const Tag = (as ?? 'h3') as ElementType;
  return (
    <>
      <Tag className={cn('font-display text-[15px] font-semibold text-text', className)} {...rest}>
        {children}
      </Tag>
      {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-text-muted">{subtitle}</p> : null}
    </>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-w-0', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-4 flex items-center gap-2 border-t border-border pt-3', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
