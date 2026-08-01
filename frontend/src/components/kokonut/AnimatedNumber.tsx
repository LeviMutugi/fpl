import { useEffect, useRef } from 'react';
import { animate, utils } from 'animejs';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { NO_DATA } from '@/lib/format';

export type AnimatedNumberProps = {
  /** `null` renders the explicit no-data marker and animates nothing. */
  value: number | null;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  /** Localise the integer part with thousands separators. */
  group?: boolean;
};

/**
 * anime.js-driven counter. It tweens a private object and writes the formatted
 * string into the node, so React never re-renders per frame. Under reduced
 * motion it prints the final value immediately.
 */
export function AnimatedNumber({
  value,
  decimals = 1,
  prefix = '',
  suffix = '',
  duration = 900,
  className,
  group = false,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const shownRef = useRef<number>(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const format = (n: number) => {
      const fixed = n.toFixed(decimals);
      if (!group) return `${prefix}${fixed}${suffix}`;
      const [intPart, frac] = fixed.split('.');
      const grouped = Number(intPart).toLocaleString('en-GB');
      return `${prefix}${frac ? `${grouped}.${frac}` : grouped}${suffix}`;
    };

    if (value === null || Number.isNaN(value)) {
      node.textContent = NO_DATA;
      shownRef.current = 0;
      return;
    }

    if (reduced) {
      node.textContent = format(value);
      shownRef.current = value;
      return;
    }

    const state = { n: shownRef.current };
    const animation = animate(state, {
      n: value,
      duration,
      ease: 'outExpo',
      onUpdate: () => {
        node.textContent = format(state.n);
        shownRef.current = state.n;
      },
      onComplete: () => {
        node.textContent = format(value);
        shownRef.current = value;
      },
    });

    return () => {
      utils.remove(state);
      animation.pause();
    };
  }, [decimals, duration, group, prefix, reduced, suffix, value]);

  return (
    <span
      ref={ref}
      className={cn('num tabular-nums', className)}
      aria-label={value === null ? 'No data' : `${prefix}${value.toFixed(decimals)}${suffix}`}
    >
      {value === null ? NO_DATA : `${prefix}${(0).toFixed(decimals)}${suffix}`}
    </span>
  );
}
