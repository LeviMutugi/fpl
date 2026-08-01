import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-surface-sunken/50 text-center',
        size === 'sm' ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid h-11 w-11 place-items-center rounded-[16px] bg-surface text-text-faint ring-1 ring-border"
      >
        <Icon size={19} />
      </span>
      <div className="max-w-[46ch]">
        <p className="font-display text-[15px] font-semibold text-text">{title}</p>
        {description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
