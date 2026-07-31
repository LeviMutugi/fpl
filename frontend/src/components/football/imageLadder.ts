import { useCallback, useMemo, useState } from 'react';
import { badgeProxyUrl, photoProxyUrl } from '@/lib/api';

/**
 * Remote-image fallback laddering.
 *
 * Premier League asset URLs move between seasons and codes are not stable
 * across every path shape, so a single `src` is guaranteed to break for some
 * slice of the squad. Instead of one URL we walk an ordered list, advancing on
 * every `onError`, and when the list is exhausted the caller renders a local
 * monogram — never a broken-image glyph, never an empty box.
 */

/** Preserve order, drop blanks and repeats. */
export function dedupe(urls: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function usableCode(code: number): boolean {
  return Number.isFinite(code) && code > 0;
}

/** `110x140` for the small renditions, `250x250` for everything larger. */
export type PhotoDim = '110x140' | '250x250';

/**
 * The player-photo ladder, in the order the API contract documents:
 * caller-supplied candidates, then the 26/25/legacy CDN paths, then the
 * backend resolver (which always answers with an image).
 */
export function playerPhotoCandidates(
  code: number,
  dim: PhotoDim,
  candidates?: readonly string[],
): string[] {
  if (!usableCode(code)) return dedupe(candidates ?? []);
  return dedupe([
    ...(candidates ?? []),
    `https://resources.premierleague.com/premierleague26/photos/players/${dim}/${code}.png`,
    `https://resources.premierleague.com/premierleague25/photos/players/${dim}/${code}.png`,
    `https://resources.premierleague.com/premierleague/photos/players/${dim}/p${code}.png`,
    photoProxyUrl(code, 'md'),
  ]);
}

export type BadgeDim = 50 | 70 | 100;

/** The club-badge ladder: CDN rendition, then the backend resolver. */
export function teamBadgeCandidates(
  code: number,
  dim: BadgeDim,
  candidates?: readonly string[],
): string[] {
  if (!usableCode(code)) return dedupe(candidates ?? []);
  return dedupe([
    ...(candidates ?? []),
    `https://resources.premierleague.com/premierleague/badges/${dim}/t${code}.png`,
    `https://resources.premierleague.com/premierleague/badges/t${code}.png`,
    badgeProxyUrl(code),
  ]);
}

export type ImageLadder = {
  /** The URL to render, or `null` once every rung has failed. */
  src: string | null;
  /** `true` once the current `src` has decoded — drives the fade-in. */
  loaded: boolean;
  /** `true` when the ladder is spent and the monogram should render. */
  exhausted: boolean;
  onLoad: () => void;
  onError: () => void;
};

/**
 * Walk `urls` in order, advancing past any that fail to load.
 *
 * The ladder resets whenever the URL list changes (a different player, a
 * different size), using the render-phase reset pattern so there is no flash
 * of the previous player's photo.
 */
export function useImageLadder(urls: readonly string[]): ImageLadder {
  const key = useMemo(() => urls.join('|'), [urls]);
  const [state, setState] = useState<{ key: string; index: number; loaded: boolean }>({
    key,
    index: 0,
    loaded: false,
  });

  if (state.key !== key) {
    setState({ key, index: 0, loaded: false });
  }

  const index = state.key === key ? state.index : 0;
  const loaded = state.key === key ? state.loaded : false;

  const onLoad = useCallback(() => {
    setState((prev) => (prev.loaded ? prev : { ...prev, loaded: true }));
  }, []);

  const onError = useCallback(() => {
    setState((prev) => ({ ...prev, index: prev.index + 1, loaded: false }));
  }, []);

  return {
    src: urls[index] ?? null,
    loaded,
    exhausted: index >= urls.length,
    onLoad,
    onError,
  };
}
