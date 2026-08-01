import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { usePortal } from '@/lib/usePortal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useAnchoredPosition, type Placement } from '@/lib/useAnchoredPosition';

export type PopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render the trigger; attach the given ref and props to your element. */
  trigger: (args: {
    ref: (node: HTMLElement | null) => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'dialog';
    onClick: () => void;
  }) => ReactNode;
  children: ReactNode;
  placement?: Placement;
  matchWidth?: boolean;
  className?: string;
  label?: string;
};

/**
 * A click-triggered floating panel. Escape closes it, a pointerdown outside
 * closes it, and focus returns to the trigger on close.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  placement = 'bottom',
  matchWidth = false,
  className,
  label = 'Options',
}: PopoverProps) {
  const host = usePortal();
  const reduced = useReducedMotion();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [floating, setFloating] = useState<HTMLDivElement | null>(null);
  const { position, width } = useAnchoredPosition({
    anchor,
    floating,
    placement,
    offset: 8,
    matchWidth,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange(false);
        anchor?.focus();
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onOpenChange, open]);

  return (
    <>
      {trigger({
        ref: setAnchor,
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        onClick: () => onOpenChange(!open),
      })}
      {host
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={(node) => {
                    panelRef.current = node;
                    setFloating(node);
                  }}
                  role="dialog"
                  aria-label={label}
                  initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.97, y: -4 }}
                  transition={
                    reduced ? { duration: 0 } : { type: 'spring', stiffness: 560, damping: 36 }
                  }
                  style={{
                    position: 'fixed',
                    left: position?.left ?? -9999,
                    top: position?.top ?? -9999,
                    width,
                    zIndex: 80,
                  }}
                  className={cn(
                    'max-h-[min(70vh,480px)] min-w-[200px] overflow-auto scrollbar-slim',
                    'rounded-[20px] border border-border bg-surface-raised p-1.5 shadow-pop',
                    'backdrop-blur-xl',
                    className,
                  )}
                >
                  {children}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            host,
          )
        : null}
    </>
  );
}
