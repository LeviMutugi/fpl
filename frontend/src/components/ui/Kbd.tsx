import { cn } from '@/lib/cn';

export type KbdProps = {
  /** e.g. `['⌘','K']` or `'Esc'`. */
  keys: string | readonly string[];
  size?: 'xs' | 'sm';
  className?: string;
};

export function Kbd({ keys, size = 'sm', className }: KbdProps) {
  const list = typeof keys === 'string' ? [keys] : keys;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {list.map((key) => (
        <kbd
          key={key}
          className={cn(
            'inline-flex items-center justify-center rounded-[8px] border border-border bg-surface-sunken',
            'font-sans font-medium text-text-muted shadow-[0_1px_0_var(--color-border)]',
            size === 'xs'
              ? 'h-[17px] min-w-[17px] px-1 text-[10px]'
              : 'h-[21px] min-w-[21px] px-1.5 text-[11px]',
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** `⌘` on Apple platforms, `Ctrl` elsewhere. Computed once at module load. */
export const MOD_KEY: string =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '')
    ? '⌘'
    : 'Ctrl';
