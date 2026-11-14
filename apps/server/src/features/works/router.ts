import { z } from "zod";
import { notImplemented, publicProcedure, router } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `works` feature fills them in.
export const worksRouter = router({
  near: publicProcedure
    .input(
      z.object({ lat: z.number(), lon: z.number(), radiusM: z.number().positive().default(200) }),
    )
    .query(() => notImplemented()),
});
