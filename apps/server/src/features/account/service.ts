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
import { AccountDeletingError } from "./errors";
import { type AccountRepo, createAccountRepo, type UserDocument } from "./repo";

// Business logic for `account`. Other features may call only what index.ts re-exports from here,
// so inputs are validated here as well as in the router.
// Nothing here logs: consent choices sit next to special-category health data (docs/DOMAIN.md).

export type AccountService = {
  me(userId: string): Promise<AccountView>;
  setConsent(userId: string, consent: ConsentChoices): Promise<AccountView>;
  setProfile(userId: string, profile: TravellerProfile): Promise<AccountView>;
  /**
   * What an upload may store for this user. Once the user has answered, each data type needs
   * both their stored consent and the upload's own flag. Before that, the upload's flags stand.
   * Throws AccountDeletingError while "delete everything" is running.
   */
  allowedConsent(userId: string, requested: ConsentChoices): Promise<ConsentChoices>;
  /**
   * Marks the user as deleting, removes their nights (Mongo and every Tiger series, through the
   * night service), then the user. Solana memos hold only a hash of a night log and cannot be
   * removed from the chain.
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

function addCounts(a: NightDeleteCounts, b: NightDeleteCounts): NightDeleteCounts {
  return {
    nights: a.nights + b.nights,
    noiseRows: a.noiseRows + b.noiseRows,
    vitalRows: a.vitalRows + b.vitalRows,
    stageRows: a.stageRows + b.stageRows,
  };
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

    async allowedConsent(userId, requested) {
      const asked = consentChoices.parse(requested);
      const user = await deps.repo.get(userId);
      if (user?.deletingSince) throw new AccountDeletingError();
      if (!user || user.consentUpdatedAt === null) return asked;
      return {
        microphone: asked.microphone && user.consent.microphone,
        health: asked.health && user.consent.health,
        location: asked.location && user.consent.location,
      };
    },

    async deleteEverything(userId) {
      // The mark stops new uploads (through allowedConsent) and stays if a store fails, so the
      // delete can be retried. The second pass catches a night that was mid-upload when the
      // first pass ran.
      const existed = await deps.repo.markDeleting(userId, now().toISOString());
      const first = await deps.deleteUserNights(userId);
      const second = await deps.deleteUserNights(userId);
      await deps.repo.remove(userId);
      return deleteEverythingResult.parse({ users: existed ? 1 : 0, ...addCounts(first, second) });
    },
  };
}

export const liveAccount = createAccountService({
  repo: createAccountRepo(),
  // Read at call time, so night can import account without a load-order cycle.
  deleteUserNights: (userId) => deleteUserNights(userId),
});

export const getAccount = liveAccount.me;
export const allowedConsent = liveAccount.allowedConsent;
