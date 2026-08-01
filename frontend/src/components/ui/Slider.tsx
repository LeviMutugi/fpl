import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  hideLabel?: boolean;
  /** Rendered to the right of the label — usually the formatted value. */
  valueLabel?: ReactNode;
  /** Tick marks drawn under the track. */
  ticks?: number[];
  disabled?: boolean;
  className?: string;
  /** Colour token name for the filled portion of the track. */
  fillToken?: string;
};

/**
 * A native range input with a fully custom, curvy track. Keyboard behaviour and
 * the accessibility tree come free from the native element.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  hideLabel = false,
  valueLabel,
  ticks,
  disabled = false,
  className,
  fillToken = 'color-accent',
}: SliderProps) {
  const id = useId();
  const span = max - min || 1;
  const ratio = Math.max(0, Math.min(1, (value - min) / span));

  return (
    <div className={cn('min-w-0', className)}>
      {hideLabel ? null : (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-[13px] font-medium text-text-muted">
            {label}
          </label>
          {valueLabel !== undefined ? (
            <span className="num text-[13px] font-semibold text-text">{valueLabel}</span>
          ) : null}
        </div>
      )}
      <div className="relative flex h-6 items-center">
        {/* Track */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-2.5 rounded-[999px] bg-surface-sunken ring-1 ring-inset ring-border"
        />
        {/* Fill */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 h-2.5 rounded-[999px]"
          style={{
            width: `${ratio * 100}%`,
            background: `linear-gradient(90deg, color-mix(in oklch, var(--${fillToken}) 65%, transparent), var(--${fillToken}))`,
          }}
        />
        <input
          id={id}
          type="range"
          aria-label={hideLabel ? label : undefined}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            'relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline-none',
            // WebKit thumb
            '[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[999px]',
            '[&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[color:var(--color-surface-raised)]',
            '[&::-webkit-slider-thumb]:bg-[color:var(--color-text)]',
            '[&::-webkit-slider-thumb]:shadow-lift',
            '[&::-webkit-slider-thumb]:transition-transform',
            'hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95',
            'focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-offset-2 focus-visible:[&::-webkit-slider-thumb]:outline-[color:var(--color-ring)]',
            // Firefox thumb
            '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-[999px]',
            '[&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[color:var(--color-surface-raised)]',
            '[&::-moz-range-thumb]:bg-[color:var(--color-text)] [&::-moz-range-thumb]:shadow-lift',
            '[&::-moz-range-track]:bg-transparent',
          )}
        />
      </div>
      {ticks && ticks.length > 0 ? (
        <div className="relative mt-1 h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="num absolute -translate-x-1/2 text-[10.5px] text-text-faint"
              style={{ left: `${((tick - min) / span) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type RangeSliderProps = Omit<SliderProps, 'value' | 'onChange' | 'valueLabel'> & {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatValue?: (value: number) => string;
};

/** Two thumbs over one shared track, clamped so they cannot cross. */
export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  ticks,
  disabled = false,
  className,
  formatValue = (v) => String(v),
  fillToken = 'color-accent',
}: RangeSliderProps) {
  const [lo, hi] = value;
  const span = max - min || 1;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-text-muted">{label}</span>
        <span className="num text-[13px] font-semibold text-text">
          {formatValue(lo)} – {formatValue(hi)}
        </span>
      </div>
      <div className="relative flex h-6 items-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-2.5 rounded-[999px] bg-surface-sunken ring-1 ring-inset ring-border"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute h-2.5 rounded-[999px]"
          style={{
            left: `${((lo - min) / span) * 100}%`,
            width: `${((hi - lo) / span) * 100}%`,
            background: `var(--${fillToken})`,
          }}
        />
        <input
          type="range"
          aria-label={`${label} — minimum`}
          min={min}
          max={max}
          step={step}
          value={lo}
          disabled={disabled}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className="pointer-events-none absolute inset-x-0 z-10 h-6 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-[999px] [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[color:var(--color-surface-raised)] [&::-moz-range-thumb]:bg-[color:var(--color-text)] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[999px] [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[color:var(--color-surface-raised)] [&::-webkit-slider-thumb]:bg-[color:var(--color-text)] [&::-webkit-slider-thumb]:shadow-lift"
        />
        <input
          type="range"
          aria-label={`${label} — maximum`}
          min={min}
          max={max}
          step={step}
          value={hi}
          disabled={disabled}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className="pointer-events-none absolute inset-x-0 z-10 h-6 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-[999px] [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[color:var(--color-surface-raised)] [&::-moz-range-thumb]:bg-[color:var(--color-text)] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[999px] [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[color:var(--color-surface-raised)] [&::-webkit-slider-thumb]:bg-[color:var(--color-text)] [&::-webkit-slider-thumb]:shadow-lift"
        />
      </div>
      {ticks && ticks.length > 0 ? (
        <div className="relative mt-1 h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="num absolute -translate-x-1/2 text-[10.5px] text-text-faint"
              style={{ left: `${((tick - min) / span) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
