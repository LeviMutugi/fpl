import { ErrorState } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

/**
 * Maps a thrown query error onto the `ErrorState` primitive.
 *
 * The engine answers 503 for its two "not ready" cases — no model run yet, and
 * a source that has not been configured — and both carry a human-readable
 * `detail` and `hint`. Those are worth showing verbatim rather than flattening
 * every failure into "something went wrong".
 */
export function QueryError({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  if (error instanceof ApiRequestError) {
    return (
      <ErrorState
        title={title ?? (error.isUnavailable ? 'The engine is not ready' : 'Request failed')}
        detail={error.detail}
        hint={error.hint}
        tone={error.isUnavailable ? 'unavailable' : 'error'}
        onRetry={onRetry}
      />
    );
  }
  return (
    <ErrorState
      title={title ?? 'Request failed'}
      detail={error instanceof Error ? error.message : String(error)}
      onRetry={onRetry}
    />
  );
}
