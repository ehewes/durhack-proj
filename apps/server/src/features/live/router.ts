import { z } from "zod";
import { notImplemented, publicProcedure, router, userProcedure } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `live` feature fills them in.
export const liveRouter = router({
  push: userProcedure
    .input(z.object({ samples: z.array(z.tuple([z.number(), z.number()])) }))
    .mutation(() => notImplemented()),
  stream: publicProcedure.subscription(async function* () {
    yield notImplemented();
  }),
});
