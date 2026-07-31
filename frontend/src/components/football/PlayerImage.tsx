import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { Monogram } from './Monogram';
import { playerPhotoCandidates, useImageLadder, type PhotoDim } from './imageLadder';

export type PlayerImageSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type PlayerImageShape = 'circle' | 'squircle';

export type PlayerImageProps = {
  /** FPL element code — the CDN's filename, not the element id. */
  code: number;
  /** Used for `alt`, and for the initials on the monogram fallback. */
  name: string;
  size?: PlayerImageSize;
  shape?: PlayerImageShape;
  /** `player.photo.candidates` from the API, tried before the CDN guesses. */
  candidates?: string[];
  className?: string;
  /**
   * Any CSS colour for the surrounding ring — normally a position token such
   * as `var(--color-pos-mid)`.
   */
  ring?: string;
};

const BOX: Record<PlayerImageSize, string> = {
  xs: 'h-[28px] w-[28px]',
  sm: 'h-[40px] w-[40px]',
  md: 'h-[56px] w-[56px]',
  lg: 'h-[80px] w-[80px]',
  xl: 'h-[120px] w-[120px]',
};

const SQUIRCLE: Record<PlayerImageSize, string> = {
  xs: 'rounded-[10px]',
  sm: 'rounded-[13px]',
  md: 'rounded-[18px]',
  lg: 'rounded-[24px]',
  xl: 'rounded-[32px]',
};

const RING_WIDTH: Record<PlayerImageSize, number> = {
  xs: 1.5,
  sm: 2,
  md: 2.5,
  lg: 3,
  xl: 3.5,
};

function dimFor(size: PlayerImageSize): PhotoDim {
  return size === 'xs' || size === 'sm' ? '110x140' : '250x250';
}

/**
 * A player photograph that always renders something.
 *
 * It walks the candidate ladder (API-supplied URLs, then three Premier League
 * CDN path shapes, then the backend resolver) and settles on a locally drawn
 * monogram if every rung fails — which is exactly what happens with no
 * outbound network, so the monogram is treated as a first-class visual rather
 * than an error state.
 */
export function PlayerImage({
  code,
  name,
  size = 'md',
  shape = 'circle',
  candidates,
  className,
  ring,
}: PlayerImageProps) {
  const urls = playerPhotoCandidates(code, dimFor(size), candidates);
  const { src, loaded, exhausted, onLoad, onError } = useImageLadder(urls);

  const ringWidth = RING_WIDTH[size];
  const hairline = 'inset 0 0 0 1px color-mix(in oklch, var(--color-border) 62%, transparent)';
  const boxShadow = ring
    ? `${hairline}, 0 0 0 ${ringWidth}px ${ring}, 0 0 0 ${ringWidth + 1.25}px color-mix(in oklch, var(--color-surface) 78%, transparent)`
    : hairline;

  const rounded = shape === 'circle' ? 'rounded-full' : SQUIRCLE[size];
  const showMonogram = exhausted || src === null;

  return (
    <span
      {...(showMonogram ? { role: 'img' as const, 'aria-label': name } : {})}
      className={cn(
        'relative isolate inline-block shrink-0 overflow-hidden bg-surface-sunken align-middle',
        BOX[size],
        rounded,
        className,
      )}
      style={{ boxShadow }}
    >
      {showMonogram ? (
        <Monogram label={name} code={code} />
      ) : (
        <>
          {loaded ? null : (
            <Skeleton
              className={cn('absolute inset-0 h-full w-full', rounded)}
              variant="block"
            />
          )}
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
              'absolute inset-0 h-full w-full object-cover object-[center_18%]',
              'transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      )}
      {/* A hint of top light so photo and monogram sit on the same surface. */}
      <span
        aria-hidden
        className={cn('pointer-events-none absolute inset-0', rounded)}
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklch, var(--color-pitch-rim) 10%, transparent) 0%, transparent 42%)',
        }}
      />
    </span>
  );
}

export { TeamBadge, type TeamBadgeProps, type TeamBadgeSize } from './TeamBadge';
