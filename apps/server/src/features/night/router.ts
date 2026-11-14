import { nightUpload } from "@kip/shared/night";
import { z } from "zod";
import { notImplemented, router, userProcedure } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `night` feature fills them in.
export const nightRouter = router({
  upload: userProcedure.input(nightUpload).mutation(() => notImplemented()),
  get: userProcedure.input(z.object({ nightId: z.uuid() })).query(() => notImplemented()),
  list: userProcedure.query(() => notImplemented()),
});
