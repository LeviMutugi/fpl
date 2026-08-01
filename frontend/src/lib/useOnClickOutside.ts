import { useEffect, type RefObject } from 'react';

/** Fire when a pointerdown lands outside every provided element. */
export function useOnClickOutside(
  refs: RefObject<HTMLElement | null>[],
  handler: (event: PointerEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      for (const ref of refs) {
        if (ref.current && ref.current.contains(target)) return;
      }
      handler(event);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handler, ...refs]);
}
