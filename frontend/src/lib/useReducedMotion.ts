import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function currentPreference(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * `true` when the user asked for reduced motion. Every animated primitive in
 * this codebase must degrade to a no-op (or an instant state change) when this
 * returns `true`.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(currentPreference);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener('change', onChange);
    setReduced(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
