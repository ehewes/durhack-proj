/** Retries `fn` with a fixed delay. The API boots before Atlas allows its IP, so this matters. */
export async function retry<T>(
  label: string,
  fn: () => Promise<T>,
  { attempts = 30, delayMs = 2000 } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.warn(`${label}: attempt ${attempt} failed, retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
