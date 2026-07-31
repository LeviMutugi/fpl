import { useEffect, useState } from 'react';

/**
 * Lazily create (and reuse) a container appended to <body> for portalled
 * overlays. Returns `null` on the first render so SSR/hydration stays honest.
 */
export function usePortal(id = 'fpl-overlays'): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('data-fpl-portal', '');
      document.body.appendChild(el);
    }
    setNode(el);
  }, [id]);

  return node;
}
