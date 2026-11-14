import { notImplemented, publicProcedure, router } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `city` feature fills them in.
export const cityRouter = router({
  sensors: publicProcedure.query(() => notImplemented()),
});
