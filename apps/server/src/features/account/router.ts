import {
  accountView,
  deleteEverythingResult,
  setConsentInput,
  setProfileInput,
} from "@kip/shared/account";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "../../trpc/init";
import { NightStorageError } from "../night";
import { AccountStorageError } from "./errors";
import { type AccountService, liveAccount } from "./service";

function mapAccountError(error: unknown): never {
  if (error instanceof AccountStorageError || error instanceof NightStorageError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

/** Every procedure acts on the caller's own `x-kip-user`, never on a user ID from the input. */
export function createAccountRouter(svc: AccountService = liveAccount) {
  return router({
    me: userProcedure.query(async ({ ctx }) => {
      try {
        return accountView.parse(await svc.me(ctx.userId));
      } catch (error) {
        mapAccountError(error);
      }
    }),
    setConsent: userProcedure.input(setConsentInput).mutation(async ({ ctx, input }) => {
      try {
        return accountView.parse(await svc.setConsent(ctx.userId, input));
      } catch (error) {
        mapAccountError(error);
      }
    }),
    setProfile: userProcedure.input(setProfileInput).mutation(async ({ ctx, input }) => {
      try {
        return accountView.parse(await svc.setProfile(ctx.userId, input.profile));
      } catch (error) {
        mapAccountError(error);
      }
    }),
    deleteEverything: userProcedure.mutation(async ({ ctx }) => {
      try {
        return deleteEverythingResult.parse(await svc.deleteEverything(ctx.userId));
      } catch (error) {
        mapAccountError(error);
      }
    }),
  });
}

export const accountRouter = createAccountRouter();
