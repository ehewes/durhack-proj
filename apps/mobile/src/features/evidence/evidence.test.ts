import { describe, expect, test } from "bun:test";
import { buildReport, type EvidenceNight, explorerUrl, shortHash, sortNights } from "./model";

const night = (n: string, signature: string | null, events = 2): EvidenceNight => ({
  nightId: `00000000-0000-4000-8000-00000000000${n}`,
  night: `2026-11-0${n}`,
  eventCount: events,
  outsideRecommendedHoursCount: 1,
  wakeUpCount: 1,
  evidence: { hash: signature ? "a".repeat(64) : null, memoSignature: signature },
});

describe("evidence model", () => {
  test("report counts only anchored nights", () => {
    const r = buildReport([night("1", "sig"), night("2", null, 9), night("3", "sig2", 3)]);
    expect(r).toEqual({ nights: 2, events: 5, outsideHours: 2, wakeUps: 2 });
  });
  test("sorts newest first", () => {
    expect(sortNights([night("1", null), night("3", null)]).map((n) => n.night)).toEqual([
      "2026-11-03",
      "2026-11-01",
    ]);
  });
  test("explorer link and short hash", () => {
    expect(explorerUrl("abc")).toBe("https://explorer.solana.com/tx/abc");
    expect(shortHash("a".repeat(64))).toBe("aaaaaaaa...aaaaaaaa");
  });
});
