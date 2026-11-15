/** Canonical JSON: object keys sorted, no whitespace, so equal data always gives equal bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error("Cannot serialise a non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new Error(`Cannot serialise a ${typeof value}`);
  }
}

const MEMO_PREFIX = "kip:v1:";
const HASH_HEX = /^[0-9a-f]{64}$/;

/** The text written to Solana: a version tag, the night and the hash. No log content. */
export function memoText(nightId: string, hash: string): string {
  return `${MEMO_PREFIX}${nightId}:${hash}`;
}

/** Inverse of `memoText`, or null if the memo is not one of ours. */
export function parseMemo(text: string): { nightId: string; hash: string } | null {
  if (!text.startsWith(MEMO_PREFIX)) return null;
  const [nightId, hash, ...rest] = text.slice(MEMO_PREFIX.length).split(":");
  if (!nightId || !hash || rest.length > 0 || !HASH_HEX.test(hash)) return null;
  return { nightId, hash };
}
