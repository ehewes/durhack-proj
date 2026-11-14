export type RetryOptions = {
  attempts?: number;
  /** First delay; doubles each attempt up to maxDelayMs */
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Retries `fn` with exponential backoff. The API boots before Atlas allows its IP, so this
 * matters. Logs only the label and attempt, never the error, which can contain a URI.
 */
export async function retry<T>(
  label: string,
  fn: () => Promise<T>,
  {
    attempts = 12,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch {
      if (attempt >= attempts) {
        // Deliberately drop the driver error: its message can contain a connection URI
        throw new Error(`${label}: gave up after ${attempts} attempts`);
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.warn(`${label}: attempt ${attempt} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}
