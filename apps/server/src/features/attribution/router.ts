import { attributionForNightInput, attributionForNightOutput } from "@kip/shared/attribution";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "../../trpc/init";
import { NightConsentError, NightNotFoundError, NightStorageError } from "../night";
import { type AttributionService, forNight } from "./service";

function mapAttributionError(error: unknown): never {
  if (error instanceof NightNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof NightConsentError) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (error instanceof NightStorageError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

export function createAttributionRouter(svc: Pick<AttributionService, "forNight"> = { forNight }) {
  return router({
    // Recomputes and stores. The same night and labels always return the same counts.
    forNight: userProcedure.input(attributionForNightInput).query(async ({ ctx, input }) => {
      try {
        return attributionForNightOutput.parse(await svc.forNight(ctx.userId, input.nightId));
      } catch (error) {
        mapAttributionError(error);
      }
    }),
  });
}

export const attributionRouter = createAttributionRouter();
