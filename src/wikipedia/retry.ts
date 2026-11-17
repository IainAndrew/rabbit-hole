// Retry HTTP requests that failed for reasons that might pass: rate limiting
// (429), server errors (5xx) and network errors (no response at all).
// Anything else is returned as-is.

/** How hard to retry, and how to wait between tries. */
export type RetryOptions = {
  /** Requests sent in all, the first one included. */
  maxAttempts: number;
  /** Delay before the first retry; doubles after each one. */
  baseDelayMs: number;
  /** Never wait longer than this, whatever the server asks for. */
  maxDelayMs: number;
  /** Injectable so tests don't have to really wait. */
  sleep: (ms: number) => Promise<void>;
};

/** Up to 5 tries over about 15 seconds, honouring Retry-After. */
export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Send a request, retrying 429s, 5xx and network errors with exponential
 * backoff.
 *
 * @param request Makes a fresh request each time it's called. A Response body
 *   can only be read once, so retries need a new request, not the old one.
 * @returns The first response that isn't retryable, or the last one once
 *   attempts run out. The caller checks `response.ok`.
 * @throws The last network error, if every attempt failed to get a response.
 */
export async function fetchWithRetry(
  request: () => Promise<Response>,
  options: RetryOptions = defaultRetryOptions,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const backoff = options.baseDelayMs * 2 ** (attempt - 1);
    let response: Response;
    try {
      response = await request();
    } catch (error) {
      // fetch rejects with a TypeError when no response arrives: a dropped
      // connection, a DNS failure, a broken TLS record. Anything else is a bug.
      if (!(error instanceof TypeError) || attempt === options.maxAttempts) {
        throw error;
      }
      await options.sleep(Math.min(backoff, options.maxDelayMs));
      continue;
    }
    if (!isRetryable(response.status) || attempt === options.maxAttempts) {
      return response;
    }
    const delay = Math.min(retryAfterMs(response) ?? backoff, options.maxDelayMs);
    await options.sleep(delay);
  }
}

/** Rate limiting and server errors might pass; anything else won't. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * How long the server asked us to wait, if it said.
 * Retry-After is either a number of seconds or an HTTP date.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (header === null) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}
