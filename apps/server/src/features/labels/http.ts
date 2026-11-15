import { clipUploadQuery, clipUploadResult, MAX_CLIP_BYTES } from "@kip/shared/labels";
import { z } from "zod";
import type { HttpRoutes } from "../../http";
import { NightNotFoundError } from "../night";
import { loadLive } from "./load";
import { LabelsClipError, type LabelsService } from "./service";

const userHeader = z.uuid();

const STATUS = {
  type: 415,
  size: 413,
  format: 400,
  event: 404,
  classifier: 502,
} as const;

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
 * `POST /upload/clip?nightId=...&t=...` with the WAV as the body and its type as
 * Content-Type. Labels the spike, then drops the bytes: they are never written anywhere.
 */
export function createLabelsHttp(service?: Pick<LabelsService, "labelClip">): HttpRoutes {
  return (app) => {
    app.post("/upload/clip", async (c) => {
      const user = userHeader.safeParse(c.req.header("x-kip-user"));
      if (!user.success) return c.json({ error: "Missing x-kip-user" }, 401);
      const query = clipUploadQuery.safeParse(c.req.query());
      if (!query.success) return c.json({ error: "nightId and t are required" }, 400);

      const declared = Number(c.req.header("content-length"));
      if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) {
        return c.json({ error: "Clip is too large" }, 413);
      }
      const bytes = await readCapped(c.req.raw.body, MAX_CLIP_BYTES);
      if (!bytes) return c.json({ error: "Clip is too large" }, 413);

      try {
        const labels = service ?? (await loadLive()).liveLabels;
        const result = await labels.labelClip({
          userId: user.data,
          nightId: query.data.nightId,
          t: query.data.t,
          mime: c.req.header("content-type") ?? "",
          bytes,
        });
        return c.json(clipUploadResult.parse(result));
      } catch (error) {
        if (error instanceof LabelsClipError) {
          return c.json({ error: error.message }, STATUS[error.failure]);
        }
        if (error instanceof NightNotFoundError) return c.json({ error: error.message }, 404);
        throw error;
      }
    });
  };
}

export const labelsHttp: HttpRoutes = createLabelsHttp();
