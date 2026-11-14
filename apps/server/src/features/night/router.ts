import { nightSummary, nightTimeline, nightUpload } from "@kip/shared/night";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, userProcedure } from "../../trpc/init";
import {
  NightConflictError,
  NightConsentError,
  NightEventNotFoundError,
  NightNotFoundError,
  NightStorageError,
} from "./errors";
import { liveNight, type NightService } from "./service";

function mapNightError(error: unknown): never {
  if (error instanceof NightNotFoundError || error instanceof NightEventNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof NightConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof NightConsentError) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (error instanceof NightStorageError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

export function createNightRouter(svc: NightService = liveNight) {
  return router({
    upload: userProcedure.input(nightUpload).mutation(async ({ ctx, input }) => {
      if (input.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "userId does not match x-kip-user" });
      }
      try {
        return nightSummary.parse(await svc.uploadNight(input));
      } catch (error) {
        mapNightError(error);
      }
    }),
    get: userProcedure.input(z.object({ nightId: z.uuid() })).query(async ({ ctx, input }) => {
      try {
        const record = await svc.getNight(input.nightId);
        if (!record || record.userId !== ctx.userId) throw new NightNotFoundError(input.nightId);
        return nightTimeline.parse(record);
      } catch (error) {
        mapNightError(error);
      }
    }),
    list: userProcedure.query(async ({ ctx }) => {
      try {
        return z.array(nightSummary).parse(await svc.listNights(ctx.userId));
      } catch (error) {
        mapNightError(error);
      }
    }),
  });
}

export const nightRouter = createNightRouter();
