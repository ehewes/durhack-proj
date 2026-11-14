import { describe, expect, spyOn, test } from "bun:test";
import { type ConsentChoices, NO_CONSENT } from "@kip/shared/account";
import type { Db } from "mongodb";
import { createCallerFactory } from "../../trpc/init";
import { type NightDeleteCounts, NightStorageError } from "../night";
import { AccountDeletingError, AccountStorageError } from "./errors";
import { createAccountRepo, type StoredUser } from "./repo";
import { createAccountRouter } from "./router";
import { type AccountService, createAccountService } from "./service";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "2026-11-14T19:00:00.000Z";
const T2 = "2026-11-14T19:05:00.000Z";
const NO_NIGHTS: NightDeleteCounts = { nights: 0, noiseRows: 0, vitalRows: 0, stageRows: 0 };
const ALL: ConsentChoices = { microphone: true, health: true, location: true };

type Filter = { _id: string };
type Update = { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> };
type UpdateOptions = { upsert?: boolean; returnDocument?: "before" | "after" };

/** Just enough of a Mongo collection for the account repo, with Mongo's update-conflict rule. */
class FakeUsers {
  readonly docs = new Map<string, StoredUser>();
  failWith: Error | null = null;

  private check(): void {
    if (this.failWith) throw this.failWith;
  }

  async findOne(filter: Filter): Promise<StoredUser | null> {
    this.check();
    const found = this.docs.get(filter._id);
    return found ? structuredClone(found) : null;
  }

  async findOneAndUpdate(
    filter: Filter,
    update: Update,
    options: UpdateOptions,
  ): Promise<StoredUser | null> {
    this.check();
    const set = update.$set ?? {};
    const onInsert = update.$setOnInsert ?? {};
    const clash = Object.keys(set).find((key) => key in onInsert);
    if (clash) throw new Error(`Updating the path '${clash}' would create a conflict`);
    const before = this.docs.get(filter._id);
    if (!before && !options.upsert) return null;
    const after = (before
      ? { ...before, ...set }
      : { _id: filter._id, ...onInsert, ...set }) as unknown as StoredUser;
    this.docs.set(filter._id, structuredClone(after));
    const returned = options.returnDocument === "after" ? after : before;
    return returned ? structuredClone(returned) : null;
  }

  async deleteOne(filter: Filter): Promise<{ deletedCount: number }> {
    this.check();
    return { deletedCount: this.docs.delete(filter._id) ? 1 : 0 };
  }
}

function fakeDb(users: FakeUsers): () => Db {
  const db = {
    collection(name: string) {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return users;
    },
  };
  return () => db as unknown as Db;
}

/**
 * Real repo over a fake collection. Each night delete returns the next of `nightPasses`
 * (then nothing), after running `whileDeletingNights` if one is set.
 */
function setup(nightPasses: NightDeleteCounts[] = []) {
  const users = new FakeUsers();
  const repo = createAccountRepo(fakeDb(users));
  const passes = [...nightPasses];
  const nightDeletes: string[] = [];
  let failNights: Error | null = null;
  let whileDeletingNights: ((svc: AccountService) => Promise<void>) | null = null;
  let clock = T1;
  const svc: AccountService = createAccountService({
    repo,
    deleteUserNights: async (userId) => {
      nightDeletes.push(userId);
      if (whileDeletingNights) await whileDeletingNights(svc);
      if (failNights) throw failNights;
      return passes.shift() ?? NO_NIGHTS;
    },
    now: () => new Date(clock),
  });
  const callerFor = (userId: string | null) =>
    createCallerFactory(createAccountRouter(svc))({ userId });
  return {
    users,
    repo,
    svc,
    nightDeletes,
    callerFor,
    setClock: (at: string) => {
      clock = at;
    },
    failNightsWith: (error: Error | null) => {
      failNights = error;
    },
    onNightDelete: (run: (svc: AccountService) => Promise<void>) => {
      whileDeletingNights = run;
    },
  };
}

describe("account repo", () => {
  test("first consent creates the user with no profile", async () => {
    const { repo } = setup();
    const consent = { microphone: true, health: false, location: true };
    expect(await repo.saveConsent(USER, consent, T1)).toEqual({
      userId: USER,
      consent,
      consentUpdatedAt: T1,
      profile: null,
      deletingSince: null,
      createdAt: T1,
      updatedAt: T1,
    });
  });

  test("first profile creates the user with every consent off", async () => {
    const { repo } = setup();
    const user = await repo.saveProfile(USER, "nightOut", T1);
    expect(user.consent).toEqual({ ...NO_CONSENT });
    expect(user.consentUpdatedAt).toBeNull();
    expect(user.profile).toBe("nightOut");
  });

  test("a profile change keeps the consent choices and when they were made", async () => {
    const { repo } = setup();
    const consent = { microphone: true, health: true, location: false };
    await repo.saveConsent(USER, consent, T1);
    const user = await repo.saveProfile(USER, "business", T2);
    expect(user).toMatchObject({ consent, consentUpdatedAt: T1, createdAt: T1, updatedAt: T2 });
  });

  test("a consent change keeps the profile", async () => {
    const { repo } = setup();
    await repo.saveProfile(USER, "lightSleeper", T1);
    const user = await repo.saveConsent(USER, { ...NO_CONSENT, microphone: true }, T2);
    expect(user).toMatchObject({ profile: "lightSleeper", consentUpdatedAt: T2, createdAt: T1 });
  });

  test("marking a delete keeps the user's choices, or creates a bare user", async () => {
    const { repo } = setup();
    await repo.saveConsent(USER, ALL, T1);
    expect(await repo.markDeleting(USER, T2)).toBe(true);
    expect(await repo.get(USER)).toMatchObject({ consent: ALL, deletingSince: T2 });
    expect(await repo.markDeleting(OTHER, T2)).toBe(false);
    expect(await repo.get(OTHER)).toMatchObject({ consent: NO_CONSENT, deletingSince: T2 });
  });

  test("remove reports how many users it deleted", async () => {
    const { repo } = setup();
    await repo.saveProfile(USER, "bestValue", T1);
    expect(await repo.remove(USER)).toBe(1);
    expect(await repo.remove(USER)).toBe(0);
    expect(await repo.get(USER)).toBeNull();
  });

  test("a driver failure becomes a storage error that echoes nothing", async () => {
    const { repo, users } = setup();
    users.failWith = new Error('E11000 {"consent":{"health":true}}');
    const failure = await repo.saveConsent(USER, NO_CONSENT, T1).catch((error) => error);
    expect(failure).toBeInstanceOf(AccountStorageError);
    expect(failure.message).toBe("Could not store the account");
    expect(await repo.get(USER).catch((error) => error.message)).toBe("Could not read the account");
  });
});

describe("account procedures", () => {
  test("me before any answer: every consent off, no profile", async () => {
    const { callerFor, users } = setup();
    expect(await callerFor(USER).me()).toEqual({
      userId: USER,
      consent: { ...NO_CONSENT },
      consentUpdatedAt: null,
      profile: null,
    });
    expect(users.docs.size).toBe(0);
  });

  test("consent is stored per data type with the time it was given", async () => {
    const { callerFor } = setup();
    const caller = callerFor(USER);
    const consent = { microphone: true, health: false, location: true };
    expect(await caller.setConsent(consent)).toMatchObject({ consent, consentUpdatedAt: T1 });
    expect((await caller.me()).consent).toEqual(consent);
  });

  test("profile is stored without touching consent", async () => {
    const { callerFor, setClock } = setup();
    const caller = callerFor(USER);
    await caller.setConsent(ALL);
    setClock(T2);
    expect(await caller.setProfile({ profile: "lightSleeper" })).toEqual({
      userId: USER,
      consent: ALL,
      consentUpdatedAt: T1,
      profile: "lightSleeper",
    });
  });

  test("inputs are validated", async () => {
    const caller = setup().callerFor(USER);
    // @ts-expect-error: not a Quiet Stays profile
    await expect(caller.setProfile({ profile: "insomniac" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // @ts-expect-error: every data type needs an answer
    await expect(caller.setConsent({ microphone: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("every procedure needs x-kip-user", async () => {
    const caller = setup().callerFor(null);
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.deleteEverything()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("a storage failure is a server error with a fixed message", async () => {
    const { callerFor, users } = setup();
    users.failWith = new Error("connection reset");
    await expect(callerFor(USER).me()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not read the account",
    });
  });
});

describe("allowed consent for uploads", () => {
  const asked = { microphone: true, health: true, location: false };

  test("before the user answers, the upload's own choices stand", async () => {
    const { svc } = setup();
    expect(await svc.allowedConsent(USER, asked)).toEqual(asked);
    await svc.setProfile(USER, "nightOut");
    expect(await svc.allowedConsent(USER, asked)).toEqual(asked);
  });

  test("once answered, each data type needs both the stored and the upload's consent", async () => {
    const { svc } = setup();
    await svc.setConsent(USER, { microphone: true, health: false, location: true });
    expect(await svc.allowedConsent(USER, asked)).toEqual({
      microphone: true,
      health: false,
      location: false,
    });
  });

  test("withdrawing health consent stops health data, whatever the upload says", async () => {
    const { svc } = setup();
    await svc.setConsent(USER, ALL);
    await svc.setConsent(USER, { ...ALL, health: false });
    expect((await svc.allowedConsent(USER, ALL)).health).toBe(false);
  });
});

describe("delete everything", () => {
  test("removes the user and their nights, and returns counts", async () => {
    const { callerFor, nightDeletes, users } = setup([
      { nights: 2, noiseRows: 57600, vitalRows: 2880, stageRows: 24 },
    ]);
    const caller = callerFor(USER);
    await caller.setConsent({ microphone: true, health: true, location: false });
    await caller.setProfile({ profile: "business" });

    expect(await caller.deleteEverything()).toEqual({
      users: 1,
      nights: 2,
      noiseRows: 57600,
      vitalRows: 2880,
      stageRows: 24,
    });
    expect(nightDeletes).toEqual([USER, USER]);
    expect(users.docs.has(USER)).toBe(false);
    expect(await caller.me()).toMatchObject({ consent: { ...NO_CONSENT }, profile: null });
  });

  test("uploads are refused from the moment the delete starts", async () => {
    const { svc, onNightDelete } = setup();
    await svc.setConsent(USER, ALL);
    const seen: unknown[] = [];
    onNightDelete(async (live) => {
      seen.push(await live.allowedConsent(USER, ALL).catch((error) => error));
    });
    await svc.deleteEverything(USER);
    expect(seen.length).toBe(2);
    for (const result of seen) expect(result).toBeInstanceOf(AccountDeletingError);
  });

  test("a night that lands during the first pass is caught by the second", async () => {
    const { callerFor } = setup([
      { nights: 1, noiseRows: 100, vitalRows: 10, stageRows: 4 },
      { nights: 1, noiseRows: 50, vitalRows: 5, stageRows: 2 },
    ]);
    const caller = callerFor(USER);
    await caller.setConsent(ALL);
    expect(await caller.deleteEverything()).toEqual({
      users: 1,
      nights: 2,
      noiseRows: 150,
      vitalRows: 15,
      stageRows: 6,
    });
  });

  test("twice finds nothing the second time", async () => {
    const { callerFor } = setup([{ nights: 1, noiseRows: 10, vitalRows: 0, stageRows: 0 }]);
    const caller = callerFor(USER);
    await caller.setProfile({ profile: "nightOut" });
    await caller.deleteEverything();
    expect(await caller.deleteEverything()).toEqual({ users: 0, ...NO_NIGHTS });
  });

  test("only touches the caller", async () => {
    const { callerFor, nightDeletes } = setup();
    await callerFor(OTHER).setProfile({ profile: "bestValue" });
    await callerFor(USER).setProfile({ profile: "nightOut" });
    await callerFor(USER).deleteEverything();
    expect(nightDeletes).toEqual([USER, USER]);
    expect((await callerFor(OTHER).me()).profile).toBe("bestValue");
  });

  test("if the night stores fail, uploads stay blocked until a retry finishes", async () => {
    const { callerFor, svc, failNightsWith, users } = setup();
    const caller = callerFor(USER);
    await caller.setProfile({ profile: "nightOut" });
    failNightsWith(new NightStorageError("Could not store the night"));
    await expect(caller.deleteEverything()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not store the night",
    });
    expect(users.docs.has(USER)).toBe(true);
    await expect(svc.allowedConsent(USER, ALL)).rejects.toBeInstanceOf(AccountDeletingError);

    failNightsWith(null);
    expect((await caller.deleteEverything()).users).toBe(1);
    expect(await svc.allowedConsent(USER, ALL)).toEqual(ALL);
  });
});

describe("privacy", () => {
  test("nothing in the account feature writes to the logs", async () => {
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const spies = methods.map((method) => spyOn(console, method));
    try {
      const { callerFor, svc, users } = setup([
        { nights: 1, noiseRows: 5, vitalRows: 5, stageRows: 5 },
      ]);
      const caller = callerFor(USER);
      await caller.me();
      await caller.setConsent(ALL);
      await caller.setProfile({ profile: "lightSleeper" });
      await svc.allowedConsent(USER, ALL);
      await caller.deleteEverything();
      users.failWith = new Error("boom");
      await caller.setConsent({ ...NO_CONSENT }).catch(() => undefined);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
