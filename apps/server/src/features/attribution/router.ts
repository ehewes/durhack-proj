import { z } from "zod";
import { notImplemented, router, userProcedure } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `attribution` feature fills them in.
export const attributionRouter = router({
  forNight: userProcedure.input(z.object({ nightId: z.uuid() })).query(() => notImplemented()),
});
