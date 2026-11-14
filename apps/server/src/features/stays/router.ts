import { TRAVELLER_PROFILES } from "@kip/shared/domain";
import { z } from "zod";
import { notImplemented, publicProcedure, router } from "../../trpc/init";

// Stubs from docs/ARCHITECTURE.md (tRPC routers). The `stays` feature fills them in.
export const staysRouter = router({
  rank: publicProcedure
    .input(
      z.object({
        profile: z.enum(TRAVELLER_PROFILES),
        checkIn: z.iso.date(),
        checkOut: z.iso.date(),
        near: z.object({ lat: z.number(), lon: z.number() }).optional(),
      }),
    )
    .query(() => notImplemented()),
});
