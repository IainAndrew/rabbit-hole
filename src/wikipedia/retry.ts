// Retry HTTP requests that failed for reasons that might pass: rate limiting
// (429) and server errors (5xx). Anything else is returned as-is.

export type RetryOptions = {
  maxAttempts: number;
  // Delay before the first retry; doubles after each one.
  baseDelayMs: number;
  // Never wait longer than this, whatever the server asks for.
  maxDelayMs: number;
  // Injectable so tests don't have to really wait.
  sleep: (ms: number) => Promise<void>;
};

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function fetchWithRetry(
  request: () => Promise<Response>,
  options: RetryOptions = defaultRetryOptions,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await request();
    if (!isRetryable(response.status) || attempt === options.maxAttempts) {
      return response;
    }
    const backoff = options.baseDelayMs * 2 ** (attempt - 1);
    const delay = Math.min(retryAfterMs(response) ?? backoff, options.maxDelayMs);
    await options.sleep(delay);
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

// Retry-After is either a number of seconds or an HTTP date.
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (header === null) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());

  return null;
}
