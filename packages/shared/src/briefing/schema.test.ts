import { describe, expect, test } from "bun:test";
import { OUTSIDE_HOURS_WORDING, SAY_FOLLOWED, SAY_RELATIVE_DB, WORDING_RULES } from "../domain";
import {
  acceptBriefingText,
  briefingAudioPath,
  briefingGetOutput,
  briefingText,
  briefingViolations,
  briefingWordCount,
  MAX_BRIEFING_WORDS,
} from "./schema";

const EXAMPLE = "Two wake-ups followed drilling at 06:41, before the 8am limit";

describe("briefing wording", () => {
  test("rejects any briefing that uses a never-say phrase", () => {
    const phrases = WORDING_RULES.flatMap((rule) => rule.neverSay);
    expect(phrases.length).toBeGreaterThan(0);
    for (const phrase of phrases) {
      const text = `Last night: ${phrase}.`;
      expect(briefingViolations(text)).toContain(phrase);
      expect(briefingText.safeParse(text).success).toBe(false);
      expect(acceptBriefingText(text)).toBeNull();
    }
  });

  test("rejects a briefing that mentions handling", () => {
    expect(briefingViolations("The handling noise woke you")).toContain("handling");
    expect(acceptBriefingText("The handling noise woke you")).toBeNull();
  });

  test("allows the morning example and the approved hours phrase", () => {
    expect(briefingViolations(EXAMPLE)).toEqual([]);
    expect(briefingWordCount(EXAMPLE)).toBeLessThanOrEqual(MAX_BRIEFING_WORDS);
    expect(briefingText.parse(EXAMPLE)).toBe(EXAMPLE);
    expect(briefingViolations(`Drilling at 06:41 was ${OUTSIDE_HOURS_WORDING}.`)).toEqual([]);
    expect(briefingViolations(`Two wake-ups ${SAY_FOLLOWED} drilling.`)).toEqual([]);
    expect(briefingViolations(`Phone levels are ${SAY_RELATIVE_DB}.`)).toEqual([]);
  });

  test("rejects a bare dB and a briefing longer than 40 words", () => {
    expect(briefingViolations("The phone reached 40 dB")).toContain("dB");
    expect(acceptBriefingText("The phone reached 40 dB")).toBeNull();
    const tooLong = Array.from({ length: MAX_BRIEFING_WORDS + 1 }, () => "word").join(" ");
    expect(briefingWordCount(tooLong)).toBe(MAX_BRIEFING_WORDS + 1);
    expect(acceptBriefingText(tooLong)).toBeNull();
    const exact = Array.from({ length: MAX_BRIEFING_WORDS }, () => "word").join(" ");
    expect(acceptBriefingText(exact)).toBe(exact);
  });

  test("collapses whitespace before counting words", () => {
    expect(briefingText.parse("  Two   wake-ups\nfollowed drilling.  ")).toBe(
      "Two wake-ups followed drilling.",
    );
  });
});

describe("briefing.get contract", () => {
  test("returns text and an audio path", () => {
    const nightId = "4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
    const parsed = briefingGetOutput.parse({ text: EXAMPLE, audioUrl: briefingAudioPath(nightId) });
    expect(parsed.audioUrl).toBe(`/briefing/${nightId}/audio`);
    expect(parsed.text).toBe(EXAMPLE);
  });
});
