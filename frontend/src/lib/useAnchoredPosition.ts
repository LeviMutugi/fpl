import { useCallback, useEffect, useState } from 'react';

export type Placement = 'top' | 'bottom' | 'left' | 'right';

export type AnchoredPosition = {
  left: number;
  top: number;
  placement: Placement;
};

export type AnchorRects = {
  anchor: HTMLElement | null;
  floating: HTMLElement | null;
  placement?: Placement;
  offset?: number;
  /** Match the floating element's width to the anchor's. */
  matchWidth?: boolean;
};

function computeFor(
  anchorRect: DOMRect,
  floatRect: { width: number; height: number },
  preferred: Placement,
  offset: number,
): AnchoredPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 8;

  const space = {
    top: anchorRect.top,
    bottom: vh - anchorRect.bottom,
    left: anchorRect.left,
    right: vw - anchorRect.right,
  };
  const need = preferred === 'top' || preferred === 'bottom' ? floatRect.height : floatRect.width;

  let placement = preferred;
  if (space[preferred] < need + offset + pad) {
    const opposite: Record<Placement, Placement> = {
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
    };
    if (space[opposite[preferred]] > space[preferred]) placement = opposite[preferred];
  }

  let left: number;
  let top: number;
  if (placement === 'top') {
    left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    top = anchorRect.top - floatRect.height - offset;
  } else if (placement === 'bottom') {
    left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    top = anchorRect.bottom + offset;
  } else if (placement === 'left') {
    left = anchorRect.left - floatRect.width - offset;
    top = anchorRect.top + anchorRect.height / 2 - floatRect.height / 2;
  } else {
    left = anchorRect.right + offset;
    top = anchorRect.top + anchorRect.height / 2 - floatRect.height / 2;
  }

  left = Math.max(pad, Math.min(left, vw - floatRect.width - pad));
  top = Math.max(pad, Math.min(top, vh - floatRect.height - pad));

  return { left, top, placement };
}

/**
 * Fixed-position placement with a single flip when the preferred side does not
 * fit, plus viewport clamping. Deliberately small: no arrow, no middleware.
 */
export function useAnchoredPosition({
  anchor,
  floating,
  placement = 'bottom',
  offset = 8,
  matchWidth = false,
}: AnchorRects): { position: AnchoredPosition | null; width: number | undefined; recompute: () => void } {
  const [position, setPosition] = useState<AnchoredPosition | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  const recompute = useCallback(() => {
    if (!anchor || !floating) return;
    const anchorRect = anchor.getBoundingClientRect();
    const floatRect = floating.getBoundingClientRect();
    const target = matchWidth
      ? { width: anchorRect.width, height: floatRect.height }
      : { width: floatRect.width, height: floatRect.height };
    setWidth(matchWidth ? anchorRect.width : undefined);
    setPosition(computeFor(anchorRect, target, placement, offset));
  }, [anchor, floating, matchWidth, offset, placement]);

  useEffect(() => {
    if (!anchor || !floating) return;
    recompute();
    const onScrollOrResize = () => recompute();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScrollOrResize);
    ro?.observe(floating);
    ro?.observe(anchor);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      ro?.disconnect();
    };
  }, [anchor, floating, recompute]);

  return { position, width, recompute };
}
