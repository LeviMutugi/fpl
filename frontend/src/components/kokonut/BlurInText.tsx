import { useEffect, useRef, type ElementType } from 'react';
import { animate, stagger } from 'animejs';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type BlurInTextProps = {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  /** Per-word stagger in ms. */
  step?: number;
  duration?: number;
};

/**
 * Reveals a string word-by-word with a small blur/lift. The full string is
 * always present in the DOM as one accessible label, so screen readers and
 * copy-paste see normal text.
 */
export function BlurInText({
  text,
  as,
  className,
  delay = 0,
  step = 55,
  duration = 700,
}: BlurInTextProps) {
  const Tag = (as ?? 'span') as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;
    const targets = node.querySelectorAll<HTMLElement>('[data-word]');
    if (targets.length === 0) return;
    const animation = animate(targets, {
      opacity: [0, 1],
      y: [10, 0],
      filter: ['blur(8px)', 'blur(0px)'],
      duration,
      delay: stagger(step, { start: delay }),
      ease: 'outExpo',
    });
    return () => {
      animation.pause();
    };
  }, [delay, duration, reduced, step, text]);

  return (
    <Tag ref={ref} className={cn('inline-block', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            data-word
            className={cn(
              'inline-block will-change-[filter,transform,opacity]',
              index < words.length - 1 && 'mr-[0.28em]',
            )}
            style={reduced ? undefined : { opacity: 0 }}
          >
            {word}
          </span>
        ))}
      </span>
    </Tag>
  );
}
