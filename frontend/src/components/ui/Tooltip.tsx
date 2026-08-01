import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { usePortal } from '@/lib/usePortal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useAnchoredPosition, type Placement } from '@/lib/useAnchoredPosition';

export type TooltipProps = {
  content: ReactNode;
  children: ReactElement<{
    ref?: React.Ref<HTMLElement>;
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    'aria-describedby'?: string;
  }>;
  placement?: Placement;
  delay?: number;
  className?: string;
  /** Hard-disable (e.g. when the label is already fully visible). */
  disabled?: boolean;
};

/**
 * Hover/focus tooltip rendered in a portal. Opens on pointer enter *and* focus,
 * closes on leave/blur/Escape. The trigger gets `aria-describedby`, so the
 * tooltip text is announced rather than being purely visual.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 120,
  className,
  disabled = false,
}: TooltipProps) {
  const id = useId();
  const host = usePortal();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [floating, setFloating] = useState<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);

  const { position } = useAnchoredPosition({ anchor, floating, placement, offset: 10 });

  const show = useCallback(() => {
    if (disabled) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), reduced ? 0 : delay);
  }, [delay, disabled, reduced]);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children, {
    ref: setAnchor as React.Ref<HTMLElement>,
    'aria-describedby': open ? id : undefined,
    onPointerEnter: (event: React.PointerEvent) => {
      children.props.onPointerEnter?.(event);
      show();
    },
    onPointerLeave: (event: React.PointerEvent) => {
      children.props.onPointerLeave?.(event);
      hide();
    },
    onFocus: (event: React.FocusEvent) => {
      children.props.onFocus?.(event);
      show();
    },
    onBlur: (event: React.FocusEvent) => {
      children.props.onBlur?.(event);
      hide();
    },
  });

  const bubble =
    host && !disabled ? (
      createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={setFloating}
              id={id}
              role="tooltip"
              initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 2 }}
              transition={
                reduced ? { duration: 0 } : { type: 'spring', stiffness: 620, damping: 36 }
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') hide();
              }}
              style={{
                position: 'fixed',
                left: position?.left ?? -9999,
                top: position?.top ?? -9999,
                pointerEvents: 'none',
                zIndex: 90,
              }}
              className={cn(
                'max-w-[280px] rounded-[14px] border border-border bg-surface-raised px-2.5 py-1.5',
                'text-[12.5px] leading-snug text-text shadow-pop',
                className,
              )}
            >
              {content}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        host,
      )
    ) : null;

  return (
    <>
      {trigger}
      {bubble}
    </>
  );
}
