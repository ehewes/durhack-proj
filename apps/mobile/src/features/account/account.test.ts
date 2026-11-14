import { describe, expect, test } from "bun:test";
import { type AccountView, accountView, NO_CONSENT } from "@kip/shared/account";
import { bannedWording, SAY_RELATIVE_DB, TRAVELLER_PROFILES } from "@kip/shared/domain";
import {
  accountState,
  answer,
  CONSENT_TYPES,
  consentOf,
  draftChoices,
  EMPTY_DRAFT,
  hasAnswered,
  ONBOARDING_STEPS,
  saveOnboarding,
  withChoice,
} from "./consent";
import { ALL_COPY, CONSENT_COPY, deletionSummary, PROFILE_OPTIONS } from "./copy";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const fresh: AccountView = accountView.parse({
  userId: USER,
  consent: NO_CONSENT,
  consentUpdatedAt: null,
  profile: null,
});

const answered: AccountView = accountView.parse({
  userId: USER,
  consent: { microphone: true, health: false, location: true },
  consentUpdatedAt: "2026-11-14T20:00:00.000Z",
  profile: "nightOut",
});

const noop = () => {};

describe("consent state", () => {
  test("onboarding asks about every data type the server stores, once each", () => {
    expect([...CONSENT_TYPES].sort()).toEqual(Object.keys(NO_CONSENT).sort());
    expect(ONBOARDING_STEPS).toEqual(["microphone", "health", "location", "profile"]);
  });

  test("nothing is consented to until the user answers, or while the account is unknown", () => {
    expect(consentOf(undefined)).toEqual(NO_CONSENT);
    expect(consentOf(fresh)).toEqual(NO_CONSENT);
    expect(
      consentOf({ ...fresh, consent: { microphone: true, health: true, location: true } }),
    ).toEqual(NO_CONSENT);
    expect(consentOf(answered)).toEqual({ microphone: true, health: false, location: true });
  });

  test("onboarding shows until consentUpdatedAt is set", () => {
    expect(hasAnswered(undefined)).toBe(false);
    expect(hasAnswered(fresh)).toBe(false);
    expect(hasAnswered(answered)).toBe(true);
    expect(accountState(fresh, false, noop)).toEqual({ status: "onboarding", view: fresh });
    expect(accountState(answered, false, noop)).toEqual({ status: "ready", view: answered });
  });

  test("a failed load is an error only when nothing is cached", () => {
    expect(accountState(undefined, false, noop)).toEqual({ status: "loading" });
    expect(accountState(undefined, true, noop).status).toBe("error");
    expect(accountState(answered, true, noop).status).toBe("ready");
  });
});

describe("onboarding answers", () => {
  test("there is no choice to send until each type has its own answer", () => {
    let draft = answer({ ...EMPTY_DRAFT }, "microphone", true);
    expect(draftChoices(draft)).toBe(null);
    draft = answer(draft, "health", false);
    expect(draftChoices(draft)).toBe(null);
    draft = answer(draft, "location", false);
    expect(draftChoices(draft)).toEqual({ microphone: true, health: false, location: false });
    expect(EMPTY_DRAFT).toEqual({ microphone: null, health: null, location: null });
  });

  test("changing one answer on the Account tab keeps the other two", () => {
    expect(withChoice(answered.consent, "health", true)).toEqual({
      microphone: true,
      health: true,
      location: true,
    });
    expect(answered.consent.health).toBe(false);
  });

  test("the profile is saved before consent, so onboarding ends only once both are stored", async () => {
    const calls: string[] = [];
    const writes = {
      setProfile: async () => {
        calls.push("profile");
        return { ...fresh, profile: "business" as const };
      },
      setConsent: async () => {
        calls.push("consent");
        return answered;
      },
    };
    const consent = { microphone: true, health: false, location: true };
    expect(await saveOnboarding(writes, { consent, profile: "business" })).toEqual(answered);
    expect(calls).toEqual(["profile", "consent"]);

    calls.length = 0;
    await saveOnboarding(writes, { consent, profile: null });
    expect(calls).toEqual(["consent"]);
  });

  test("if the profile cannot be saved, consent is not saved either", async () => {
    let consentSaved = false;
    const writes = {
      setProfile: async (): Promise<AccountView> => {
        throw new Error("offline");
      },
      setConsent: async () => {
        consentSaved = true;
        return answered;
      },
    };
    let failed = false;
    try {
      await saveOnboarding(writes, { consent: NO_CONSENT, profile: "lightSleeper" });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(consentSaved).toBe(false);
  });
});

describe("account copy", () => {
  test("every data type has a plain explanation and its own yes answer", () => {
    for (const type of CONSENT_TYPES) {
      const copy = CONSENT_COPY[type];
      expect(copy.explain.length > 0).toBe(true);
      expect(copy.allow.startsWith("Allow ")).toBe(true);
    }
    expect(new Set(CONSENT_TYPES.map((type) => CONSENT_COPY[type].allow)).size).toBe(3);
  });

  test("the microphone is described in relative dB", () => {
    expect(CONSENT_COPY.microphone.explain.join(" ")).toContain(SAY_RELATIVE_DB);
    expect(CONSENT_COPY.microphone.summary).toContain(SAY_RELATIVE_DB);
  });

  test("the profile question offers every Quiet Stays profile, in order", () => {
    expect(PROFILE_OPTIONS.map((option) => option.profile)).toEqual([...TRAVELLER_PROFILES]);
  });

  test("no sentence uses a banned phrase or an em dash", () => {
    const summaries = [
      deletionSummary({ users: 1, nights: 3, noiseRows: 28_800, vitalRows: 1, stageRows: 40 }),
      deletionSummary({ users: 0, nights: 0, noiseRows: 0, vitalRows: 0, stageRows: 0 }),
    ];
    for (const line of [...ALL_COPY, ...summaries]) {
      expect(bannedWording(line)).toEqual([]);
      expect(line.includes("—")).toBe(false);
    }
  });
});

describe("deletion summary", () => {
  test("counts each store in words, with plurals and grouped digits", () => {
    expect(
      deletionSummary({ users: 1, nights: 3, noiseRows: 28_800, vitalRows: 1, stageRows: 40 }),
    ).toBe(
      "Kip removed your choices, 3 nights, 28,800 noise readings, 1 health reading and 40 sleep stages.",
    );
  });

  test("skips stores that held nothing", () => {
    expect(deletionSummary({ users: 1, nights: 1, noiseRows: 0, vitalRows: 0, stageRows: 0 })).toBe(
      "Kip removed your choices and 1 night.",
    );
    expect(deletionSummary({ users: 1, nights: 0, noiseRows: 0, vitalRows: 0, stageRows: 0 })).toBe(
      "Kip removed your choices.",
    );
    expect(deletionSummary({ users: 0, nights: 0, noiseRows: 0, vitalRows: 0, stageRows: 0 })).toBe(
      "Kip had nothing stored for you.",
    );
  });
});
