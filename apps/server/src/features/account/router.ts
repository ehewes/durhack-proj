import { TRAVELLER_PROFILES } from "@kip/shared/domain";
import { z } from "zod";
import { notImplemented, router, userProcedure } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `account` feature fills them in.
export const accountRouter = router({
  me: userProcedure.query(() => notImplemented()),
  setConsent: userProcedure
    .input(z.object({ microphone: z.boolean(), health: z.boolean(), location: z.boolean() }))
    .mutation(() => notImplemented()),
  setProfile: userProcedure
    .input(z.object({ profile: z.enum(TRAVELLER_PROFILES) }))
    .mutation(() => notImplemented()),
  deleteEverything: userProcedure.mutation(() => notImplemented()),
});
