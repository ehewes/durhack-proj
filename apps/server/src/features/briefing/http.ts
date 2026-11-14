import { cors } from "hono/cors";
import { z } from "zod";
import type { HttpRoutes } from "../../http";
import { createContext } from "../../trpc/init";
import { type BriefingCache, briefingCache } from "./cache";

/**
 * Cached briefing audio. `app.ts` mounts feature routes; this lane does not edit it.
 * `GET /briefing/:nightId/audio` with the same `x-kip-user` the briefing was written for.
 */
export function createBriefingHttp(cache: BriefingCache = briefingCache()): HttpRoutes {
  return (app) => {
    app.use("/briefing/:nightId/audio", cors());
    app.get("/briefing/:nightId/audio", (c) => {
      const nightId = c.req.param("nightId");
      if (!z.uuid().safeParse(nightId).success) {
        return c.json({ error: "Briefing audio not found" }, 404);
      }
      const userId = createContext({ req: c.req.raw }).userId;
      if (!userId) return c.json({ error: "Missing x-kip-user" }, 401);
      const entry = cache.read(nightId);
      if (!entry || entry.userId !== userId) {
        return c.json({ error: "Briefing audio not found" }, 404);
      }
      return c.body(entry.audio, 200, {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=86400",
      });
    });
  };
}

export const briefingHttp: HttpRoutes = createBriefingHttp();
