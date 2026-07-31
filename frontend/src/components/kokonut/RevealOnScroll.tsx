import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type RevealOnScrollProps = {
  children: ReactNode;
  /** ms */
  delay?: number;
  /** How far it travels in px. */
  distance?: number;
  /** Fraction of the element that must be visible. */
  threshold?: number;
  once?: boolean;
  className?: string;
};

/**
 * Fades/lifts content in when it scrolls into view. Under reduced motion the
 * children render immediately with no transform.
 */
export function RevealOnScroll({
  children,
  delay = 0,
  distance = 14,
  threshold = 0.15,
  once = true,
  className,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, reduced, threshold]);

  return (
    <div
      ref={ref}
      className={cn('min-w-0', className)}
      style={
        reduced
          ? undefined
          : {
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : `translateY(${distance}px)`,
              transition: `opacity 620ms var(--ease-calm) ${delay}ms, transform 620ms var(--ease-calm) ${delay}ms`,
              willChange: 'opacity, transform',
            }
      }
    >
      {children}
    </div>
  );
}
