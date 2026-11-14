import { z } from "zod";
import { notImplemented, router, userProcedure } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `briefing` feature fills them in.
export const briefingRouter = router({
  get: userProcedure.input(z.object({ nightId: z.uuid() })).query(() => notImplemented()),
});
