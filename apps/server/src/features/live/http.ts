import { MAX_CLIP_BYTES } from "@kip/shared/labels";
import { cors } from "hono/cors";
import { z } from "zod";
import type { HttpRoutes } from "../../http";
import { type LiveAudioStore, liveAudioStore } from "./audio";
import { loadLive } from "./load";
import { LiveClipError, type LivePipeline } from "./pipeline";

const userHeader = z.uuid();
const clipQuery = z.object({ t: z.coerce.number().finite() });

const STATUS = {
  type: 415,
  size: 413,
  format: 400,
  spike: 404,
  classifier: 502,
} as const;

/** Same length and characters, compared without an early exit. */
function sameToken(expected: string, given: string): boolean {
  if (expected.length === 0 || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Read at most `limit` bytes. Null if the body is longer; the rest is never read. */
async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * `POST /live/clip?t=...` with the WAV as the body: labels the spike near `t`, checks the
 * hours, speaks the briefing and publishes one event on `live.stream`. The clip is never
 * written anywhere. `GET /live/briefing/:id/audio?token=...` serves the briefing.
 * The routes need one line in `app.ts` (a platform change).
 */
export function createLiveHttp(
  pipeline?: Pick<LivePipeline, "process">,
  audio: LiveAudioStore = liveAudioStore(),
): HttpRoutes {
  return (app) => {
    app.post("/live/clip", async (c) => {
      if (!userHeader.safeParse(c.req.header("x-kip-user")).success) {
        return c.json({ error: "Missing x-kip-user" }, 401);
      }
      const query = clipQuery.safeParse(c.req.query());
      if (!query.success) return c.json({ error: "t is required" }, 400);

      const declared = Number(c.req.header("content-length"));
      if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) {
        return c.json({ error: "Clip is too large" }, 413);
      }
      const bytes = await readCapped(c.req.raw.body, MAX_CLIP_BYTES);
      if (!bytes) return c.json({ error: "Clip is too large" }, 413);

      const url = new URL(c.req.url);
      const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
      const origin = `${proto || url.protocol.replace(":", "")}://${url.host}`;
      try {
        const run = pipeline ?? (await loadLive()).livePipeline;
        const event = await run.process({
          t: query.data.t,
          mime: c.req.header("content-type") ?? "",
          bytes,
          origin,
        });
        return c.json(event);
      } catch (error) {
        if (error instanceof LiveClipError) {
          return c.json({ error: error.message }, STATUS[error.failure]);
        }
        throw error;
      }
    });

    app.use("/live/briefing/:id/audio", cors());
    app.get("/live/briefing/:id/audio", (c) => {
      const entry = audio.read(c.req.param("id"));
      if (!entry || !sameToken(entry.token, c.req.query("token") ?? "")) {
        return c.json({ error: "Briefing audio not found" }, 404);
      }
      return c.body(entry.audio, 200, {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=86400",
      });
    });
  };
}

export const liveHttp: HttpRoutes = createLiveHttp();
