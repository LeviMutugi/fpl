import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'pitch';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Square icon-only button; pass `aria-label`. */
  iconOnly?: boolean;
  block?: boolean;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast border border-transparent hover:bg-accent-hover active:brightness-95 shadow-soft',
  secondary:
    'bg-surface-raised text-text border border-border hover:border-border-strong hover:bg-surface active:brightness-[0.98] shadow-soft',
  ghost: 'bg-transparent text-text-muted border border-transparent hover:bg-surface-sunken hover:text-text',
  danger:
    'bg-critical text-[color:var(--color-text-inverse)] border border-transparent hover:brightness-110 active:brightness-95 shadow-soft',
  pitch:
    'bg-pitch-turf text-[color:var(--color-pitch-line)] border border-transparent hover:brightness-110 shadow-soft',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 px-2.5 text-[12px] rounded-[10px]',
  sm: 'h-8 gap-1.5 px-3 text-[13px] rounded-[12px]',
  md: 'h-10 gap-2 px-4 text-[14px] rounded-[16px]',
  lg: 'h-12 gap-2.5 px-5 text-[15px] rounded-[20px]',
};

const ICON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 w-7 rounded-[10px] px-0',
  sm: 'h-8 w-8 rounded-[12px] px-0',
  md: 'h-10 w-10 rounded-[16px] px-0',
  lg: 'h-12 w-12 rounded-[20px] px-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    iconOnly = false,
    block = false,
    className,
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        'disabled:pointer-events-none disabled:opacity-50',
        'active:scale-[0.98]',
        SIZE[size],
        iconOnly && ICON_SIZE[size],
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 'md' : 'sm'} />
      ) : iconLeft ? (
        <span className="shrink-0" aria-hidden>
          {iconLeft}
        </span>
      ) : null}
      {iconOnly ? null : children}
      {!loading && iconRight ? (
        <span className="shrink-0" aria-hidden>
          {iconRight}
        </span>
      ) : null}
    </button>
  );
});
