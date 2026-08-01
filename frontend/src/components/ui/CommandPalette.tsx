import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePortal } from '@/lib/usePortal';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { Kbd } from './Kbd';

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  icon?: ReactNode;
  keywords?: string;
  shortcut?: readonly string[];
  onSelect: () => void;
};

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly CommandItem[];
  placeholder?: string;
  /** Rendered when the query matches nothing. */
  emptyMessage?: string;
  /** Extra content pinned under the input (e.g. live search results). */
  footer?: ReactNode;
  /** Called on every query change so a page can feed async results back in. */
  onQueryChange?: (query: string) => void;
};

function score(item: CommandItem, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const haystack = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''} ${item.group ?? ''}`.toLowerCase();
  if (item.label.toLowerCase().startsWith(q)) return 100;
  if (haystack.includes(q)) return 50;
  // Subsequence match, so "plex" finds "Player Explorer".
  let cursor = 0;
  for (const char of q) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor === -1) return 0;
    cursor += 1;
  }
  return 10;
}

/**
 * The shell of a Cmd+K palette: input, grouped filtered list, keyboard
 * selection. It owns no navigation — every item carries its own `onSelect`.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = 'Search pages, players, actions…',
  emptyMessage = 'Nothing matches that.',
  footer,
  onQueryChange,
}: CommandPaletteProps) {
  const host = usePortal();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    const scored = items
      .map((item) => ({ item, s: score(item, query) }))
      .filter((entry) => entry.s > 0)
      .sort((a, b) => b.s - a.s);
    return scored.map((entry) => entry.item);
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of results) {
      const key = item.group ?? '';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [results]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (index: number) => {
    const item = results[index];
    if (!item) return;
    onOpenChange(false);
    item.onSelect();
  };

  if (!host) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            aria-hidden
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-[color:var(--color-page)]/65 backdrop-blur-lg"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 34 }}
            className="relative flex w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] border border-border bg-surface-raised shadow-pop"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search size={17} className="shrink-0 text-text-faint" aria-hidden />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded
                aria-controls="fpl-command-list"
                aria-activedescendant={results[active] ? `cmd-${results[active]!.id}` : undefined}
                aria-label="Search commands"
                autoComplete="off"
                spellCheck={false}
                value={query}
                placeholder={placeholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  onQueryChange?.(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((i) => (results.length ? (i + 1) % results.length : 0));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    run(active);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onOpenChange(false);
                  }
                }}
                className="h-14 w-full bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
              />
              <Kbd keys="Esc" size="xs" />
            </div>

            <div
              ref={listRef}
              id="fpl-command-list"
              role="listbox"
              aria-label="Commands"
              className="max-h-[min(52vh,440px)] overflow-auto scrollbar-slim p-2"
            >
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-muted">{emptyMessage}</p>
              ) : (
                grouped.map(([group, groupItems]) => (
                  <div key={group || '_'} className="mb-1">
                    {group ? (
                      <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                        {group}
                      </div>
                    ) : null}
                    {groupItems.map((item) => {
                      const index = results.indexOf(item);
                      const isActive = index === active;
                      return (
                        <div
                          key={item.id}
                          id={`cmd-${item.id}`}
                          role="option"
                          aria-selected={isActive}
                          data-active={isActive}
                          onPointerEnter={() => setActive(index)}
                          onClick={() => run(index)}
                          className={cn(
                            'flex cursor-pointer items-center gap-2.5 rounded-[16px] px-2.5 py-2.5',
                            isActive ? 'bg-surface-sunken' : '',
                          )}
                        >
                          {item.icon ? (
                            <span
                              aria-hidden
                              className={cn(
                                'grid h-7 w-7 shrink-0 place-items-center rounded-[10px] ring-1 ring-border',
                                isActive ? 'bg-surface text-accent' : 'bg-surface text-text-faint',
                              )}
                            >
                              {item.icon}
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-text">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="block truncate text-[12px] text-text-muted">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          {item.shortcut ? <Kbd keys={item.shortcut} size="xs" /> : null}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[11.5px] text-text-faint">
              <span className="flex items-center gap-1.5">
                <Kbd keys={['↑', '↓']} size="xs" /> navigate
                <span className="mx-1">·</span>
                <Kbd keys="↵" size="xs" /> open
              </span>
              {footer}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    host,
  );
}
