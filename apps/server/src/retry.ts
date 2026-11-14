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
    } catch (error) {
      if (attempt >= attempts) {
        // Deliberately drop the driver error: its message can contain a connection URI
        throw new Error(`${label}: gave up after ${attempts} attempts`);
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // Log only the error's code or name (e.g. ECONNREFUSED), never its message: it can hold a URI
      const reason = errorCode(error);
      console.warn(`${label}: attempt ${attempt} failed (${reason}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" || typeof code === "number") return String(code);
    if (typeof name === "string") return name;
  }
  return "unknown";
}
