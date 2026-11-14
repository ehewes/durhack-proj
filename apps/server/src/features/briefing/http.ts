import { cors } from "hono/cors";
import type { HttpRoutes } from "../../http";
import { type BriefingCache, briefingCache } from "./cache";

type ByteRange = { start: number; end: number };

/** Same length and characters, compared without an early exit. */
function sameToken(expected: string, given: string): boolean {
  if (expected.length === 0 || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/**
 * One `bytes=` range, clamped to the audio. Null serves the whole file, which is
 * also the answer to a header this route does not understand.
 */
function byteRange(header: string | undefined, total: number): ByteRange | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }
  const start = Number(from);
  const end = to === "" ? total - 1 : Math.min(Number(to), total - 1);
  if (start >= total || start > end) return "unsatisfiable";
  return { start, end };
}

/**
 * Cached briefing audio at the URL `briefing.get` returns:
 * `GET /briefing/:nightId/audio?token=...`. The token is random per briefing, so an
 * audio element or iOS player can fetch it without the `x-kip-user` header. Byte
 * ranges are served because iOS players ask for them.
 * `app.ts` mounts feature routes; this lane does not edit it.
 */
export function createBriefingHttp(cache: BriefingCache = briefingCache()): HttpRoutes {
  return (app) => {
    app.use("/briefing/:nightId/audio", cors());
    app.get("/briefing/:nightId/audio", (c) => {
      const entry = cache.read(c.req.param("nightId"));
      if (!entry || !sameToken(entry.token, c.req.query("token") ?? "")) {
        return c.json({ error: "Briefing audio not found" }, 404);
      }
      const total = entry.audio.byteLength;
      const headers = {
        "content-type": "audio/mpeg",
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=86400",
      };
      const range = byteRange(c.req.header("range"), total);
      if (range === "unsatisfiable") {
        return c.body(null, 416, { "content-range": `bytes */${total}` });
      }
      if (range) {
        return c.body(entry.audio.slice(range.start, range.end + 1), 206, {
          ...headers,
          "content-range": `bytes ${range.start}-${range.end}/${total}`,
        });
      }
      return c.body(entry.audio, 200, headers);
    });
  };
}

export const briefingHttp: HttpRoutes = createBriefingHttp();
