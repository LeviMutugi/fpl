import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type Size = { width: number; height: number };

/**
 * Observe an element's content box. Returns a ref to attach and the latest
 * size. Used by every chart so SVG viewports match their container exactly.
 */
export function useMeasure<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  Size,
] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    nodeRef.current = node;
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.contentRect;
      setSize((prev) =>
        Math.abs(prev.width - box.width) < 0.5 && Math.abs(prev.height - box.height) < 0.5
          ? prev
          : { width: box.width, height: box.height },
      );
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    if (box.width || box.height) setSize({ width: box.width, height: box.height });
  }, []);

  useLayoutEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, size];
}
