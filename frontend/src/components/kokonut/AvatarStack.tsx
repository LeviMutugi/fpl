import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type AvatarStackItem = {
  key: string;
  /** Anything square — a `PlayerImage`, `TeamBadge`, or a monogram. */
  node: ReactNode;
  label: string;
};

export type AvatarStackProps = {
  items: readonly AvatarStackItem[];
  max?: number;
  size?: number;
  className?: string;
  ariaLabel?: string;
};

/** Overlapping circular avatars with a `+n` overflow chip. */
export function AvatarStack({
  items,
  max = 5,
  size = 32,
  className,
  ariaLabel = 'Players',
}: AvatarStackProps) {
  const shown = items.slice(0, max);
  const overflow = items.length - shown.length;

  return (
    <ul
      aria-label={ariaLabel}
      className={cn('flex items-center', className)}
      style={{ paddingLeft: shown.length ? size * 0.28 : 0 }}
    >
      {shown.map((item, index) => (
        <li
          key={item.key}
          title={item.label}
          className="relative overflow-hidden rounded-full bg-surface ring-2 ring-[color:var(--color-surface)] transition-transform duration-200 hover:z-20 hover:-translate-y-0.5"
          style={{ width: size, height: size, marginLeft: -size * 0.28, zIndex: shown.length - index }}
        >
          {item.node}
        </li>
      ))}
      {overflow > 0 ? (
        <li
          className="num grid place-items-center rounded-full bg-surface-sunken text-[11px] font-semibold text-text-muted ring-2 ring-[color:var(--color-surface)]"
          style={{ width: size, height: size, marginLeft: -size * 0.28 }}
        >
          +{overflow}
        </li>
      ) : null}
    </ul>
  );
}
