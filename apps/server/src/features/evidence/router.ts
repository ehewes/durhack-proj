import { z } from "zod";
import { notImplemented, publicProcedure, router, userProcedure } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `evidence` feature fills them in.
export const evidenceRouter = router({
  anchor: userProcedure.input(z.object({ nightId: z.uuid() })).mutation(() => notImplemented()),
  verify: publicProcedure.input(z.object({ nightId: z.uuid() })).query(() => notImplemented()),
  report: userProcedure.input(z.object({ nightId: z.uuid() })).query(() => notImplemented()),
});
