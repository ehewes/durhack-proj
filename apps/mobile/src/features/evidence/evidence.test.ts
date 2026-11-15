import { describe, expect, test } from "bun:test";
import { explorerUrl, plural, shortHash, sortNights, verifyHeadline } from "./model";

describe("evidence model", () => {
  test("sorts newest first", () => {
    expect(sortNights([{ night: "2026-11-01" }, { night: "2026-11-03" }])).toEqual([
      { night: "2026-11-03" },
      { night: "2026-11-01" },
    ]);
  });
  test("explorer link and short hash", () => {
    expect(explorerUrl("abc")).toBe("https://explorer.solana.com/tx/abc");
    expect(shortHash("a".repeat(64))).toBe("aaaaaaaa...aaaaaaaa");
  });
  test("plural", () => {
    expect(plural(1, "noise event")).toBe("1 noise event");
    expect(plural(2, "noise event")).toBe("2 noise events");
  });
  test("verify headlines", () => {
    expect(verifyHeadline("match")).toBe("Match");
    expect(verifyHeadline("mismatch")).toBe("Mismatch");
  });
});
