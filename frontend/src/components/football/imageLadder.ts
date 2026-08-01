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

/**
 * Whether the Premier League CDN is worth trying at all.
 *
 * A squad page renders dozens of avatars, each with several CDN candidates
 * ahead of the backend resolver. When the CDN is unreachable — hotlink
 * protection, an offline box, an egress policy — that is hundreds of requests
 * that can only fail, and every avatar waits out its own round trip before
 * reaching the rung that works. After a run of consecutive failures with no
 * success in between, the CDN rungs are dropped for the rest of the session and
 * the ladder starts at the resolver. One success clears the count, so a slow
 * start or a handful of genuinely missing photos never trips it.
 */
const CDN_HOST = 'resources.premierleague.com';
const CDN_FAILURE_LIMIT = 12;
let cdnFailures = 0;

function cdnLooksDown(): boolean {
  return cdnFailures >= CDN_FAILURE_LIMIT;
}

export function noteImageOutcome(url: string | null, ok: boolean): void {
  if (!url || !url.includes(CDN_HOST)) return;
  cdnFailures = ok ? 0 : cdnFailures + 1;
}

/** Test seam — the counter is module state, so it must be resettable. */
export function resetCdnHealth(): void {
  cdnFailures = 0;
}

function withoutCdn(urls: string[]): string[] {
  const kept = urls.filter((url) => !url.includes(CDN_HOST));
  // Never return an empty ladder: if every rung was a CDN URL, keep them.
  return kept.length > 0 ? kept : urls;
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
  const ladder = dedupe([
    ...(candidates ?? []),
    `https://resources.premierleague.com/premierleague26/photos/players/${dim}/${code}.png`,
    `https://resources.premierleague.com/premierleague25/photos/players/${dim}/${code}.png`,
    `https://resources.premierleague.com/premierleague/photos/players/${dim}/p${code}.png`,
    photoProxyUrl(code, 'md'),
  ]);
  return cdnLooksDown() ? withoutCdn(ladder) : ladder;
}

export type BadgeDim = 50 | 70 | 100;

/** The club-badge ladder: CDN rendition, then the backend resolver. */
export function teamBadgeCandidates(
  code: number,
  dim: BadgeDim,
  candidates?: readonly string[],
): string[] {
  if (!usableCode(code)) return dedupe(candidates ?? []);
  const ladder = dedupe([
    ...(candidates ?? []),
    `https://resources.premierleague.com/premierleague/badges/${dim}/t${code}.png`,
    `https://resources.premierleague.com/premierleague/badges/t${code}.png`,
    badgeProxyUrl(code),
  ]);
  return cdnLooksDown() ? withoutCdn(ladder) : ladder;
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

  const current = urls[index] ?? null;

  const onLoad = useCallback(() => {
    noteImageOutcome(current, true);
    setState((prev) => (prev.loaded ? prev : { ...prev, loaded: true }));
  }, [current]);

  const onError = useCallback(() => {
    noteImageOutcome(current, false);
    setState((prev) => ({ ...prev, index: prev.index + 1, loaded: false }));
  }, [current]);

  return {
    src: current,
    loaded,
    exhausted: index >= urls.length,
    onLoad,
    onError,
  };
}
