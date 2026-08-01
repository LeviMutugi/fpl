import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Popover } from './Popover';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  group?: string;
};

export type SelectProps<T extends string> = {
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  hideLabel?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  /** Full width of its container. */
  block?: boolean;
};

/**
 * A listbox-pattern select. Full keyboard operation: Enter/Space/Down opens,
 * Up/Down move the active option, Enter commits, Escape cancels, typing jumps
 * to the first matching label.
 */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
  hideLabel = false,
  placeholder = 'Select…',
  size = 'md',
  disabled = false,
  className,
  block = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const enabled = useMemo(() => options.filter((o) => !o.disabled), [options]);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, enabled.findIndex((o) => o.value === value)),
  );
  const searchRef = useRef({ buffer: '', at: 0 });
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, enabled.findIndex((o) => o.value === value)));
  }, [enabled, open, value]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (index: number) => {
    const option = enabled[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % enabled.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + enabled.length) % enabled.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(enabled.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const now = Date.now();
      const state = searchRef.current;
      state.buffer = now - state.at > 700 ? event.key : state.buffer + event.key;
      state.at = now;
      const idx = enabled.findIndex((o) =>
        o.label.toLowerCase().startsWith(state.buffer.toLowerCase()),
      );
      if (idx >= 0) setActiveIndex(idx);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, SelectOption<T>[]>();
    for (const option of options) {
      const key = option.group ?? '';
      const list = map.get(key);
      if (list) list.push(option);
      else map.set(key, [option]);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <div className={cn('min-w-0', block && 'w-full', className)}>
      {hideLabel ? null : (
        <span className="mb-1.5 block text-[12.5px] font-medium text-text-muted">{label}</span>
      )}
      <Popover
        open={open}
        onOpenChange={setOpen}
        matchWidth
        label={label}
        trigger={({ ref, onClick, ...aria }) => (
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            type="button"
            role="combobox"
            aria-controls={undefined}
            aria-label={hideLabel ? label : undefined}
            disabled={disabled}
            onClick={onClick}
            onKeyDown={onKeyDown}
            className={cn(
              'inline-flex w-full items-center justify-between gap-2 rounded-[16px] border border-border bg-surface-raised px-3 text-left',
              'transition-colors duration-200 hover:border-border-strong',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
              'disabled:pointer-events-none disabled:opacity-50',
              size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[14px]',
            )}
            {...aria}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected?.icon ? (
                <span className="shrink-0" aria-hidden>
                  {selected.icon}
                </span>
              ) : null}
              <span className={cn('truncate', selected ? 'text-text' : 'text-text-faint')}>
                {selected?.label ?? placeholder}
              </span>
            </span>
            <ChevronDown
              size={16}
              aria-hidden
              className={cn(
                'shrink-0 text-text-faint transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
        )}
      >
        <div ref={listRef} role="listbox" aria-label={label} className="min-w-0">
          {groups.map(([group, groupOptions]) => (
            <div key={group || '_'}>
              {group ? (
                <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                  {group}
                </div>
              ) : null}
              {groupOptions.map((option) => {
                const enabledIndex = enabled.indexOf(option);
                const isActive = enabledIndex === activeIndex;
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    data-active={isActive}
                    onPointerEnter={() => enabledIndex >= 0 && setActiveIndex(enabledIndex)}
                    onClick={() => !option.disabled && commit(enabledIndex)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-[14px] px-2.5 py-2 text-[13.5px]',
                      option.disabled && 'pointer-events-none opacity-40',
                      isActive ? 'bg-surface-sunken text-text' : 'text-text-muted',
                    )}
                  >
                    {option.icon ? (
                      <span className="shrink-0" aria-hidden>
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-text">{option.label}</span>
                      {option.hint ? (
                        <span className="block truncate text-[11.5px] text-text-faint">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check size={15} className="shrink-0 text-accent" aria-hidden />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
