import {
  type AccountView,
  accountView,
  type ConsentChoices,
  consentChoices,
  type DeleteEverythingResult,
  deleteEverythingResult,
  NO_CONSENT,
  travellerProfile,
} from "@kip/shared/account";
import type { TravellerProfile } from "@kip/shared/domain";
import { deleteUserNights, type NightDeleteCounts } from "../night";
import { type AccountRepo, createAccountRepo, type UserDocument } from "./repo";

// Business logic for `account`. Other features may call only what index.ts re-exports from here.
// Nothing here logs: consent choices sit next to special-category health data (docs/DOMAIN.md).

export type AccountService = {
  me(userId: string): Promise<AccountView>;
  setConsent(userId: string, consent: ConsentChoices): Promise<AccountView>;
  setProfile(userId: string, profile: TravellerProfile): Promise<AccountView>;
  /**
   * Removes the user's nights (Mongo and every Tiger series, through the night service), then
   * the user. Solana memos hold only a hash of a night log and cannot be removed from the chain.
   */
  deleteEverything(userId: string): Promise<DeleteEverythingResult>;
};

export type AccountDeps = {
  repo: AccountRepo;
  deleteUserNights: (userId: string) => Promise<NightDeleteCounts>;
  now?: () => Date;
};

function toView(userId: string, user: UserDocument | null): AccountView {
  return accountView.parse({
    userId,
    consent: user ? user.consent : NO_CONSENT,
    consentUpdatedAt: user ? user.consentUpdatedAt : null,
    profile: user ? user.profile : null,
  });
}

export function createAccountService(deps: AccountDeps): AccountService {
  const now = deps.now ?? (() => new Date());

  return {
    async me(userId) {
      return toView(userId, await deps.repo.get(userId));
    },

    async setConsent(userId, consent) {
      const choices = consentChoices.parse(consent);
      return toView(userId, await deps.repo.saveConsent(userId, choices, now().toISOString()));
    },

    async setProfile(userId, profile) {
      const chosen = travellerProfile.parse(profile);
      return toView(userId, await deps.repo.saveProfile(userId, chosen, now().toISOString()));
    },

    async deleteEverything(userId) {
      // Nights go first, so if a store fails the user record remains and the delete can be retried.
      const nights = await deps.deleteUserNights(userId);
      const users = await deps.repo.remove(userId);
      return deleteEverythingResult.parse({ users, ...nights });
    },
  };
}

export const liveAccount = createAccountService({ repo: createAccountRepo(), deleteUserNights });
