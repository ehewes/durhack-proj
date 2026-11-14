import { describe, expect, test } from "bun:test";
import {
  accountView,
  consentChoices,
  deleteEverythingResult,
  NO_CONSENT,
  setProfileInput,
} from "./index";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("account schemas", () => {
  test("consent needs an explicit answer for each data type", () => {
    expect(consentChoices.safeParse({ microphone: true, health: false }).success).toBe(false);
    expect(
      consentChoices.safeParse({ microphone: true, health: false, location: true }).success,
    ).toBe(true);
  });

  test("nothing is consented to by default", () => {
    expect(NO_CONSENT).toEqual({ microphone: false, health: false, location: false });
    expect(Object.isFrozen(NO_CONSENT)).toBe(true);
  });

  test("profile is one of the Quiet Stays profiles", () => {
    expect(setProfileInput.safeParse({ profile: "lightSleeper" }).success).toBe(true);
    expect(setProfileInput.safeParse({ profile: "insomniac" }).success).toBe(false);
  });

  test("a user who has never answered has no consent time and no profile", () => {
    const view = accountView.parse({
      userId: USER,
      consent: NO_CONSENT,
      consentUpdatedAt: null,
      profile: null,
    });
    expect(view.consentUpdatedAt).toBeNull();
    expect(view.profile).toBeNull();
  });

  test("delete counts are whole and never negative", () => {
    const counts = { users: 1, nights: 2, noiseRows: 100, vitalRows: 30, stageRows: 8 };
    expect(deleteEverythingResult.parse(counts)).toEqual(counts);
    expect(deleteEverythingResult.safeParse({ ...counts, nights: -1 }).success).toBe(false);
    expect(deleteEverythingResult.safeParse({ ...counts, users: 0.5 }).success).toBe(false);
  });
});
