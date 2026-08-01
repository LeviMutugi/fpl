import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePortal } from '@/lib/usePortal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useUiStore, type Toast as ToastModel, type ToastTone } from '@/lib/uiStore';

const ICON = {
  neutral: Info,
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
} as const;

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: 'text-text-muted',
  good: 'text-[color:var(--color-delta-up)]',
  warning: 'text-[color:var(--color-fdr-4-ink)]',
  critical: 'text-[color:var(--color-delta-down)]',
};

function ToastRow({ toast }: { toast: ToastModel }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  const Icon = ICON[toast.tone];

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.duration, toast.id]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      className="pointer-events-auto flex w-[min(380px,92vw)] items-start gap-2.5 rounded-[20px] border border-border bg-surface-raised p-3 shadow-pop"
    >
      <span aria-hidden className={cn('mt-px shrink-0', TONE_CLASS[toast.tone])}>
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-text">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
        className="-m-1 shrink-0 rounded-[10px] p-1 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]"
      >
        <X size={14} />
      </button>
    </motion.li>
  );
}

/** Mount once, near the app root. Reads from the zustand UI store. */
export function ToastViewport() {
  const host = usePortal();
  const toasts = useUiStore((s) => s.toasts);
  const reduced = useReducedMotion();
  if (!host) return null;

  return createPortal(
    <ul
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed bottom-4 right-4 z-[120] flex flex-col-reverse items-end gap-2"
    >
      <AnimatePresence initial={!reduced}>
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </ul>,
    host,
  );
}

/** Imperative helper: `toast({ title: 'Saved' })`. */
export function toast(input: {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}): string {
  return useUiStore.getState().pushToast(input);
}
