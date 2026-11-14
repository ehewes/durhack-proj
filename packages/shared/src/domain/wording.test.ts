import { describe, expect, test } from "bun:test";
import { OUTSIDE_HOURS_WORDING } from "./construction-hours";
import {
  bannedWording,
  NEVER_BREACH,
  NEVER_CAUSED_BY,
  NEVER_ILLEGAL,
  NEVER_MEASURED_DISTURBANCE,
  NEVER_PROVES_NOISE_HAPPENED,
  NEVER_RESIDENTS_DISTURBED,
  SAY_FOLLOWED,
  SAY_INDICATIVE_ESTIMATE,
  SAY_LINKED_TO,
  SAY_PROVES_WHEN_LOG_EXISTED,
  SAY_RELATIVE_DB,
  SAY_SIMULATED,
  WORDING_RULES,
} from "./wording";

describe("wording rules", () => {
  test("matches the Say / Never say table", () => {
    expect(WORDING_RULES).toEqual([
      { topic: "cause", say: [SAY_LINKED_TO, SAY_FOLLOWED], neverSay: [NEVER_CAUSED_BY] },
      {
        topic: "city",
        say: [SAY_INDICATIVE_ESTIMATE],
        neverSay: [NEVER_MEASURED_DISTURBANCE, NEVER_RESIDENTS_DISTURBED],
      },
      {
        topic: "hours",
        say: [OUTSIDE_HOURS_WORDING],
        neverSay: [NEVER_ILLEGAL, NEVER_BREACH],
      },
      { topic: "phone", say: [SAY_RELATIVE_DB], neverSay: ["dB"] },
      {
        topic: "cohort",
        say: [SAY_SIMULATED],
        neverSay: [],
        note: "Label cohort data as simulated. Never imply those users are real.",
      },
      {
        topic: "evidence",
        say: [SAY_PROVES_WHEN_LOG_EXISTED],
        neverSay: [NEVER_PROVES_NOISE_HAPPENED],
      },
    ]);
    expect(OUTSIDE_HOURS_WORDING).toBe("outside the council's recommended hours");
    expect(SAY_LINKED_TO).toBe("linked to");
    expect(SAY_FOLLOWED).toBe("followed");
    expect(SAY_INDICATIVE_ESTIMATE).toBe("indicative estimate");
    expect(SAY_RELATIVE_DB).toBe("relative dB");
    expect(SAY_SIMULATED).toBe("simulated");
    expect(SAY_PROVES_WHEN_LOG_EXISTED).toBe("proves when the log existed");
    expect(NEVER_CAUSED_BY).toBe("caused by");
    expect(NEVER_MEASURED_DISTURBANCE).toBe("measured disturbance");
    expect(NEVER_RESIDENTS_DISTURBED).toBe("% of residents are disturbed");
    expect(NEVER_ILLEGAL).toBe("illegal");
    expect(NEVER_BREACH).toBe("breach");
    expect(NEVER_PROVES_NOISE_HAPPENED).toBe("proves the noise happened");
  });

  test("say phrases and never-say phrases do not overlap", () => {
    const say = WORDING_RULES.flatMap((rule) => rule.say.map((phrase) => phrase.toLowerCase()));
    const never = WORDING_RULES.flatMap((rule) =>
      rule.neverSay.map((phrase) => phrase.toLowerCase()),
    );
    for (const phrase of say) {
      expect(never).not.toContain(phrase);
    }
  });

  test("flags banned phrases and lets the allowed ones through", () => {
    expect(bannedWording("The wake-up was caused by drilling")).toEqual([NEVER_CAUSED_BY]);
    expect(bannedWording("Two wake-ups followed drilling")).toEqual([]);
    expect(bannedWording("A wake-up linked to drilling")).toEqual([]);
    expect(bannedWording("This is a measured disturbance")).toEqual([NEVER_MEASURED_DISTURBANCE]);
    expect(bannedWording("12% of residents are disturbed")).toEqual([NEVER_RESIDENTS_DISTURBED]);
    expect(bannedWording("The work was illegal")).toEqual([NEVER_ILLEGAL]);
    expect(bannedWording("a breach of the hours")).toEqual([NEVER_BREACH]);
    expect(bannedWording(OUTSIDE_HOURS_WORDING)).toEqual([]);
    expect(bannedWording("The memo proves the noise happened")).toEqual([
      NEVER_PROVES_NOISE_HAPPENED,
    ]);
    expect(bannedWording("The memo proves when the log existed")).toEqual([]);
    expect(bannedWording("City figure, indicative estimate", "city")).toEqual([]);
  });

  test("phone levels must say relative dB", () => {
    expect(bannedWording("The night peaked at 12 relative dB", "phone")).toEqual([]);
    expect(bannedWording("The night peaked at 12 dB", "phone")).toEqual(["dB"]);
    expect(bannedWording("45 dB Lnight, indicative estimate", "city")).toEqual([]);
    expect(bannedWording("45 dB Lnight")).toEqual(["dB"]);
  });
});
