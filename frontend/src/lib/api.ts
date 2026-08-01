import type { ApiError } from '@/types/api';

export const API_BASE = '/api';

/** Thrown by `fetchJson` for any non-2xx response or unparseable body. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly hint: string | undefined;
  readonly url: string;

  constructor(args: {
    message: string;
    status: number;
    detail: string;
    hint?: string;
    url: string;
  }) {
    super(args.message);
    this.name = 'ApiRequestError';
    this.status = args.status;
    this.detail = args.detail;
    this.hint = args.hint;
    this.url = args.url;
  }

  /** 503 is the engine's "no run yet" / "source unconfigured" signal. */
  get isUnavailable(): boolean {
    return this.status === 503;
  }
}

export type QueryValue = string | number | boolean | null | undefined | (string | number)[];

/** Build `/api/...?a=1&b=2`, dropping null/undefined and empty arrays. */
export function apiUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = path.startsWith('/api') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}

export type FetchJsonOptions = {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * The single typed entry point to the backend. Feature hooks are expected to
 * wrap this with react-query; nothing here caches or retries on its own.
 */
export async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  const url = path.startsWith('/api') || path.startsWith('http') ? path : apiUrl(path);
  const { method = 'GET', body, signal, headers } = options;

  const init: RequestInit = {
    method,
    signal: signal ?? null,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(url, init);
  const text = await response.text();

  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) {
        throw new ApiRequestError({
          message: 'The server returned a response that is not JSON.',
          status: response.status,
          detail: text.slice(0, 400),
          url,
        });
      }
    }
  }

  if (!response.ok) {
    if (isApiError(parsed)) {
      throw new ApiRequestError({
        message: parsed.error,
        status: response.status,
        detail: parsed.detail,
        ...(parsed.hint === undefined ? {} : { hint: parsed.hint }),
        url,
      });
    }
    throw new ApiRequestError({
      message: `Request failed with status ${response.status}`,
      status: response.status,
      detail: text.slice(0, 400) || response.statusText,
      url,
    });
  }

  return parsed as T;
}

/** Convenience for `POST` bodies. */
export function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return fetchJson<T>(path, { method: 'POST', body, ...(signal ? { signal } : {}) });
}

/** The backend's always-succeeds photo resolver. */
export function photoProxyUrl(code: number, size: 'sm' | 'md'): string {
  return `${API_BASE}/photo/${code}?size=${size}`;
}

/** The backend's badge resolver. */
export function badgeProxyUrl(code: number): string {
  return `${API_BASE}/badge/${code}`;
}
