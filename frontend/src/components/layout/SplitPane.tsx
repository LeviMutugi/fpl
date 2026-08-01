import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SplitRatio = '1/3' | '2/5' | '1/2' | '3/5' | '2/3';
export type SplitBreakpoint = 'md' | 'lg' | 'xl';

export type SplitPaneProps = {
  /** The dominant column — a pitch, a table, a chart. */
  primary: ReactNode;
  /** The supporting column — inspector, filters, explanation. */
  secondary: ReactNode;
  /** Width of the *secondary* column at and above `stackAt`. */
  ratio?: SplitRatio;
  /** Which side the secondary column sits on. */
  side?: 'left' | 'right';
  gap?: 'sm' | 'md' | 'lg';
  /** Below this breakpoint the two panes stack, primary first. */
  stackAt?: SplitBreakpoint;
  /** Make the secondary column stick while the primary scrolls. */
  stickySecondary?: boolean;
  /** Sticky offset in px — enough to clear the shell's top bar. */
  stickyTop?: number;
  className?: string;
};

/*
 * Class strings are written out in full rather than composed at runtime:
 * Tailwind scans source text, so a template literal would never be generated.
 */
const SECONDARY_RIGHT: Record<SplitBreakpoint, Record<SplitRatio, string>> = {
  md: {
    '1/3': 'md:grid-cols-[2fr_1fr]',
    '2/5': 'md:grid-cols-[3fr_2fr]',
    '1/2': 'md:grid-cols-2',
    '3/5': 'md:grid-cols-[2fr_3fr]',
    '2/3': 'md:grid-cols-[1fr_2fr]',
  },
  lg: {
    '1/3': 'lg:grid-cols-[2fr_1fr]',
    '2/5': 'lg:grid-cols-[3fr_2fr]',
    '1/2': 'lg:grid-cols-2',
    '3/5': 'lg:grid-cols-[2fr_3fr]',
    '2/3': 'lg:grid-cols-[1fr_2fr]',
  },
  xl: {
    '1/3': 'xl:grid-cols-[2fr_1fr]',
    '2/5': 'xl:grid-cols-[3fr_2fr]',
    '1/2': 'xl:grid-cols-2',
    '3/5': 'xl:grid-cols-[2fr_3fr]',
    '2/3': 'xl:grid-cols-[1fr_2fr]',
  },
};

const SECONDARY_LEFT: Record<SplitBreakpoint, Record<SplitRatio, string>> = {
  md: {
    '1/3': 'md:grid-cols-[1fr_2fr]',
    '2/5': 'md:grid-cols-[2fr_3fr]',
    '1/2': 'md:grid-cols-2',
    '3/5': 'md:grid-cols-[3fr_2fr]',
    '2/3': 'md:grid-cols-[2fr_1fr]',
  },
  lg: {
    '1/3': 'lg:grid-cols-[1fr_2fr]',
    '2/5': 'lg:grid-cols-[2fr_3fr]',
    '1/2': 'lg:grid-cols-2',
    '3/5': 'lg:grid-cols-[3fr_2fr]',
    '2/3': 'lg:grid-cols-[2fr_1fr]',
  },
  xl: {
    '1/3': 'xl:grid-cols-[1fr_2fr]',
    '2/5': 'xl:grid-cols-[2fr_3fr]',
    '1/2': 'xl:grid-cols-2',
    '3/5': 'xl:grid-cols-[3fr_2fr]',
    '2/3': 'xl:grid-cols-[2fr_1fr]',
  },
};

/** `order-first` at the split breakpoint, so the aside moves to the left. */
const ORDER_FIRST: Record<SplitBreakpoint, string> = {
  md: 'md:order-first',
  lg: 'lg:order-first',
  xl: 'xl:order-first',
};

const GAP = { sm: 'gap-3', md: 'gap-4 lg:gap-6', lg: 'gap-6 lg:gap-8' } as const;

/**
 * Two columns that stack on narrow screens, primary first in the source order
 * so the important pane is what a phone (and a screen reader) meets first.
 */
export function SplitPane({
  primary,
  secondary,
  ratio = '1/3',
  side = 'right',
  gap = 'md',
  stackAt = 'lg',
  stickySecondary = false,
  stickyTop = 80,
  className,
}: SplitPaneProps) {
  const template = side === 'left' ? SECONDARY_LEFT[stackAt][ratio] : SECONDARY_RIGHT[stackAt][ratio];

  return (
    <div className={cn('grid min-w-0 grid-cols-1', GAP[gap], template, className)}>
      <div className="min-w-0">{primary}</div>
      <aside
        className={cn('min-w-0', side === 'left' && ORDER_FIRST[stackAt])}
        style={
          stickySecondary ? { position: 'sticky', top: stickyTop, alignSelf: 'start' } : undefined
        }
      >
        {secondary}
      </aside>
    </div>
  );
}
