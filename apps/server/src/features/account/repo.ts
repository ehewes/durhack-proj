import { type ConsentChoices, NO_CONSENT } from "@kip/shared/account";
import type { TravellerProfile } from "@kip/shared/domain";
import type { Collection, Db } from "mongodb";
import { mongo } from "../../db/mongo";
import { AccountStorageError } from "./errors";

/** One per user in Mongo `users`: consent choices and the Quiet Stays profile, nothing else. */
export type UserDocument = {
  userId: string;
  consent: ConsentChoices;
  consentUpdatedAt: string | null;
  profile: TravellerProfile | null;
  /** Set when "delete everything" starts; the document goes when it finishes */
  deletingSince: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountRepo = {
  get(userId: string): Promise<UserDocument | null>;
  /** Creates the user on first write. `at` is an ISO timestamp */
  saveConsent(userId: string, consent: ConsentChoices, at: string): Promise<UserDocument>;
  saveProfile(userId: string, profile: TravellerProfile, at: string): Promise<UserDocument>;
  /** Sets `deletingSince`, creating a bare user if needed. True if the user already existed */
  markDeleting(userId: string, at: string): Promise<boolean>;
  /** Number of user documents removed: 1, or 0 if there was none */
  remove(userId: string): Promise<number>;
};

export type StoredUser = Omit<UserDocument, "userId"> & { _id: string };

type UserFields = Partial<Omit<StoredUser, "_id" | "createdAt" | "updatedAt">>;

function documentOf({ _id, ...rest }: StoredUser): UserDocument {
  return { userId: _id, ...rest, deletingSince: rest.deletingSince ?? null };
}

async function guard<T>(action: "read" | "write", run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccountStorageError) throw error;
    // The driver's message can echo the update. Report the action only.
    throw new AccountStorageError(`Could not ${action === "read" ? "read" : "store"} the account`);
  }
}

/**
 * Mongo `users`, keyed by user ID. Connecting waits until the first call, so imports stay
 * side-effect free. Tests pass their own `db`.
 */
export function createAccountRepo(db: () => Db = mongo): AccountRepo {
  const users = (): Collection<StoredUser> => db().collection<StoredUser>("users");

  /** `set` and `onInsert` must not share a field: Mongo rejects the update if they do. */
  async function upsert(
    userId: string,
    set: UserFields,
    onInsert: UserFields,
    at: string,
  ): Promise<UserDocument> {
    const stored = await users().findOneAndUpdate(
      { _id: userId },
      { $set: { ...set, updatedAt: at }, $setOnInsert: { ...onInsert, createdAt: at } },
      { upsert: true, returnDocument: "after" },
    );
    if (!stored) throw new AccountStorageError("Could not store the account");
    return documentOf(stored);
  }

  return {
    get: (userId) =>
      guard("read", async () => {
        const stored = await users().findOne({ _id: userId });
        return stored ? documentOf(stored) : null;
      }),
    saveConsent: (userId, consent, at) =>
      guard("write", () =>
        upsert(
          userId,
          { consent, consentUpdatedAt: at },
          { profile: null, deletingSince: null },
          at,
        ),
      ),
    saveProfile: (userId, profile, at) =>
      guard("write", () =>
        upsert(
          userId,
          { profile },
          { consent: { ...NO_CONSENT }, consentUpdatedAt: null, deletingSince: null },
          at,
        ),
      ),
    markDeleting: (userId, at) =>
      guard("write", async () => {
        const before = await users().findOneAndUpdate(
          { _id: userId },
          {
            $set: { deletingSince: at, updatedAt: at },
            $setOnInsert: {
              consent: { ...NO_CONSENT },
              consentUpdatedAt: null,
              profile: null,
              createdAt: at,
            },
          },
          { upsert: true, returnDocument: "before" },
        );
        return before !== null;
      }),
    remove: (userId) =>
      guard("write", async () => (await users().deleteOne({ _id: userId })).deletedCount),
  };
}
