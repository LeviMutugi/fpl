import { cn } from '@/lib/cn';
import { Monogram } from './Monogram';
import { teamBadgeCandidates, useImageLadder, type BadgeDim } from './imageLadder';

export type TeamBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

export type TeamBadgeProps = {
  /** FPL team *code* (the badge filename), not the team id. */
  code: number;
  /** Club name — used for `alt` and for the monogram initials. */
  name: string;
  size?: TeamBadgeSize;
  /**
   * Three-letter club abbreviation. Preferred over `name` for the monogram,
   * because "ARS" reads better on a 24px crest than "AR".
   */
  shortName?: string;
  /** `team.primary_hex` — the one hex a component is allowed to receive. */
  primaryHex?: string;
  /** Extra URLs to try before the CDN guesses (e.g. `team.badge_url`). */
  candidates?: string[];
  className?: string;
};

const BOX: Record<TeamBadgeSize, string> = {
  xs: 'h-[16px] w-[16px]',
  sm: 'h-[20px] w-[20px]',
  md: 'h-[28px] w-[28px]',
  lg: 'h-[40px] w-[40px]',
};

const DIM: Record<TeamBadgeSize, BadgeDim> = {
  xs: 50,
  sm: 50,
  md: 70,
  lg: 100,
};

/**
 * A club crest with the same fallback ladder as {@link PlayerImage}: the CDN
 * renditions, then the backend resolver, then a monogram tinted with the
 * club's own primary colour.
 */
export function TeamBadge({
  code,
  name,
  size = 'sm',
  shortName,
  primaryHex,
  candidates,
  className,
}: TeamBadgeProps) {
  const urls = teamBadgeCandidates(code, DIM[size], candidates);
  const { src, loaded, exhausted, onLoad, onError } = useImageLadder(urls);
  const showMonogram = exhausted || src === null;

  return (
    <span
      {...(showMonogram ? { role: 'img' as const, 'aria-label': name } : {})}
      title={showMonogram ? name : undefined}
      className={cn(
        'relative inline-block shrink-0 overflow-hidden rounded-[7px] align-middle',
        showMonogram ? 'bg-surface-sunken' : 'bg-transparent',
        BOX[size],
        className,
      )}
    >
      {showMonogram ? (
        <Monogram
          label={shortName ?? name}
          code={code}
          maxChars={shortName ? 3 : 2}
          {...(primaryHex ? { tintHex: primaryHex } : {})}
        />
      ) : (
        <img
          key={src}
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={onLoad}
          onError={onError}
          className={cn(
            'absolute inset-0 h-full w-full object-contain',
            'transition-opacity duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </span>
  );
}
