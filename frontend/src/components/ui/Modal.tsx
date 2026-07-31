import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePortal } from '@/lib/usePortal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { Button } from './Button';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useDialogBehaviour(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const node = panel.current;
      if (!node) return;
      const target = node.querySelector<HTMLElement>(FOCUSABLE) ?? node;
      target.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = panel.current;
      if (!node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose, open, panel]);
}

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Hide the default header (supply your own inside `children`). */
  bare?: boolean;
};

const SIZE = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[1040px]',
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  bare = false,
}: ModalProps) {
  const host = usePortal();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogBehaviour(open, onClose, panelRef);

  if (!host) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            aria-hidden
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-[color:var(--color-page)]/60 backdrop-blur-md"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.97, y: 10 }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'relative flex max-h-[min(88vh,900px)] w-full flex-col overflow-hidden',
              'rounded-[28px] border border-border bg-surface-raised shadow-pop',
              SIZE[size],
              className,
            )}
          >
            {bare ? null : (
              <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h2 className="font-display text-[17px] font-semibold text-text">{title}</h2>
                  {description ? (
                    <p className="mt-0.5 text-[13px] leading-snug text-text-muted">{description}</p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Close dialog"
                  onClick={onClose}
                  iconLeft={<X size={16} />}
                />
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-auto scrollbar-slim px-5 py-4 sm:px-6">
              {children}
            </div>
            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5 sm:px-6">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    host,
  );
}

export type SheetProps = Omit<ModalProps, 'size'> & {
  side?: 'right' | 'left' | 'bottom';
  width?: number;
};

/** A side/bottom drawer with the same dialog semantics as `Modal`. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  width = 460,
  className,
  bare = false,
}: SheetProps) {
  const host = usePortal();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogBehaviour(open, onClose, panelRef);

  if (!host) return null;

  const offAxis =
    side === 'bottom' ? { y: '100%', x: 0 } : { x: side === 'right' ? '100%' : '-100%', y: 0 };

  const shell =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[86vh] rounded-t-[36px] border-t'
      : side === 'right'
        ? 'inset-y-0 right-0 rounded-l-[32px] border-l'
        : 'inset-y-0 left-0 rounded-r-[32px] border-r';

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100]">
          <motion.div
            aria-hidden
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-[color:var(--color-page)]/60 backdrop-blur-md"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduced ? { opacity: 1 } : { ...offAxis, opacity: 0.6 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { ...offAxis, opacity: 0.4 }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
            style={side === 'bottom' ? undefined : { width: `min(${width}px, 94vw)` }}
            className={cn(
              'absolute flex flex-col overflow-hidden border-border bg-surface-raised shadow-pop',
              shell,
              className,
            )}
          >
            {bare ? null : (
              <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2 className="font-display text-[17px] font-semibold text-text">{title}</h2>
                  {description ? (
                    <p className="mt-0.5 text-[13px] leading-snug text-text-muted">{description}</p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Close panel"
                  onClick={onClose}
                  iconLeft={<X size={16} />}
                />
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-auto scrollbar-slim px-5 py-4">{children}</div>
            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    host,
  );
}
