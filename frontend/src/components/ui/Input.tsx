import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
};

const SIZE = {
  sm: 'h-8 text-[13px] rounded-[12px]',
  md: 'h-10 text-[14px] rounded-[16px]',
  lg: 'h-12 text-[15px] rounded-[20px]',
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hideLabel = false,
    hint,
    error,
    iconLeft,
    iconRight,
    size = 'md',
    block = true,
    className,
    id,
    type = 'text',
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('min-w-0', block && 'w-full')}>
      {hideLabel ? null : (
        <label htmlFor={inputId} className="mb-1.5 block text-[12.5px] font-medium text-text-muted">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {iconLeft ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 grid place-items-center text-text-faint"
          >
            {iconLeft}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-label={hideLabel ? label : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full border bg-surface-raised text-text placeholder:text-text-faint',
            'transition-colors duration-200',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            type === 'number' && 'num',
            SIZE[size],
            iconLeft ? 'pl-9' : 'pl-3',
            iconRight ? 'pr-9' : 'pr-3',
            error ? 'border-[color:var(--color-critical)]' : 'border-border hover:border-border-strong',
            className,
          )}
          {...rest}
        />
        {iconRight ? <span className="absolute right-2.5 flex items-center">{iconRight}</span> : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-[12px] text-[color:var(--color-delta-down)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 text-[12px] text-text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
