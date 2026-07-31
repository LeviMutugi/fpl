import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useIsNarrow } from '@/lib/useMediaQuery';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type StickyFooterBarProps = {
  /** Summary text or metrics, left-aligned. */
  children?: ReactNode;
  /** The commit controls — "Apply transfers", "Save squad". */
  actions?: ReactNode;
  /** Slide the bar in and out. Defaults to always visible. */
  visible?: boolean;
  className?: string;
  ariaLabel?: string;
};

/**
 * The commit bar for destructive or expensive actions: it floats above the
 * content, stays reachable at any scroll position, and clears the mobile tab
 * bar rather than sitting under it.
 */
export function StickyFooterBar({
  children,
  actions,
  visible = true,
  className,
  ariaLabel = 'Actions',
}: StickyFooterBarProps) {
  const reduced = useReducedMotion();
  const narrow = useIsNarrow();

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          role="region"
          aria-label={ariaLabel}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
          className={cn(
            'fixed inset-x-3 z-[45] mx-auto flex max-w-[980px] min-w-0 flex-wrap items-center',
            'gap-3 rounded-[24px] border border-border bg-surface-raised/94 px-3.5 py-3 shadow-pop',
            'backdrop-blur-xl sm:inset-x-6 sm:px-5',
            className,
          )}
          style={{
            bottom: narrow
              ? 'calc(78px + env(safe-area-inset-bottom))'
              : 'calc(20px + env(safe-area-inset-bottom))',
          }}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1.5">
            {children}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
