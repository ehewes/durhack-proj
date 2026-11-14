import { rankInput } from "@kip/shared/stays";
import { notImplemented, publicProcedure, router } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `stays` feature fills them in.
export const staysRouter = router({
  rank: publicProcedure.input(rankInput).query(() => notImplemented()),
});
