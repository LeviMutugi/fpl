import { useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type GlowCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Token name for the glow colour. */
  glowToken?: string;
  /** Radius of the radial highlight in px. */
  radius?: number;
  intensity?: number;
  cornerRadius?: 'lg' | 'xl' | '2xl';
};

const CORNER = {
  lg: 'rounded-[22px]',
  xl: 'rounded-[28px]',
  '2xl': 'rounded-[36px]',
} as const;

/**
 * A card that tracks the pointer with a soft radial highlight. Purely
 * decorative: under reduced motion the highlight never appears, and the card
 * still reads as a normal surface.
 */
export function GlowCard({
  children,
  glowToken = 'color-accent',
  radius = 320,
  intensity = 0.16,
  cornerRadius = 'xl',
  className,
  ...rest
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={ref}
      onPointerMove={(event) => {
        if (reduced) return;
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        setPoint({ x: event.clientX - box.left, y: event.clientY - box.top });
      }}
      onPointerLeave={() => setPoint(null)}
      className={cn(
        'group relative isolate overflow-hidden border border-border bg-surface p-5 shadow-soft',
        'transition-[border-color,box-shadow] duration-300',
        'hover:border-border-strong hover:shadow-lift',
        CORNER[cornerRadius],
        className,
      )}
      {...rest}
    >
      {point && !reduced ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
          style={{
            background: `radial-gradient(${radius}px circle at ${point.x}px ${point.y}px, color-mix(in oklch, var(--${glowToken}) ${Math.round(
              intensity * 100,
            )}%, transparent), transparent 70%)`,
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
