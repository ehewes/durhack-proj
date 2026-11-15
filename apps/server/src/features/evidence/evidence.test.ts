import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalJson, memoText, parseMemo } from "@kip/shared/evidence";
import { nightTimeline } from "@kip/shared/night";
import nightTimelineFixture from "../../../../../packages/shared/src/night/fixtures/night-timeline.json";
import { createCallerFactory, router } from "../../trpc/init";
import type { NightRecord } from "../night";
import { createEvidenceRouter } from "./router";
import { createEvidenceService } from "./service";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const timeline = nightTimeline.parse(nightTimelineFixture);

/** A night, a fake Solana (memos by signature) and the night service's evidence write. */
function harness(draft: (prompt: string) => Promise<string> = async () => "Draft text") {
  let record: NightRecord = {
    ...timeline,
    userId: USER,
    consent: { microphone: true, health: true, location: true },
    location: { lat: 54.9738, lon: -1.6131 },
    vitals: null,
  };
  const memos = new Map<string, string>();
  const writes: string[] = [];
  const prompts: string[] = [];
  const svc = createEvidenceService({
    getNight: async (id) => (id === record.nightId ? structuredClone(record) : null),
    setEvidence: async (_user, _id, evidence) => {
      record = { ...record, evidence };
    },
    writeMemo: async (text) => {
      writes.push(text);
      const signature = `sig${memos.size + 1}`;
      memos.set(signature, text);
      return { signature, explorerUrl: `https://explorer.solana.com/tx/${signature}` };
    },
    draftComplaint: async (prompt) => {
      prompts.push(prompt);
      return draft(prompt);
    },
    sha256: (text) => createHash("sha256").update(text).digest("hex"),
    readMemo: async (signature) => {
      const text = memos.get(signature);
      if (!text) throw new Error("Transaction not found");
      return text;
    },
  });
  const caller = (userId: string | null) =>
    createCallerFactory(router({ evidence: createEvidenceRouter(svc) }))({ userId });
  return {
    caller,
    writes,
    prompts,
    nightId: timeline.nightId,
    edit(change: (r: NightRecord) => NightRecord) {
      record = change(record);
    },
  };
}

test("canonicalJson ignores key order and whitespace", () => {
  expect(canonicalJson({ b: 1, a: [2, { d: null, c: "x" }], u: undefined })).toBe(
    '{"a":[2,{"c":"x","d":null}],"b":1}',
  );
  expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
});

test("memo text round-trips and rejects foreign memos", () => {
  const hash = "a".repeat(64);
  expect(parseMemo(memoText(timeline.nightId, hash))).toEqual({ nightId: timeline.nightId, hash });
  expect(parseMemo("hello")).toBeNull();
  expect(parseMemo(`kip:v1:${timeline.nightId}:short`)).toBeNull();
});

test("anchor writes the hash as a memo and stores the signature; verify matches", async () => {
  const { caller, writes, nightId } = harness();
  const anchored = await caller(USER).evidence.anchor({ nightId });
  expect(anchored.alreadyAnchored).toBe(false);
  expect(writes).toEqual([memoText(nightId, anchored.hash)]);
  expect(writes[0]).not.toContain("peakDb");

  const verified = await caller(null).evidence.verify({ nightId });
  expect(verified).toMatchObject({
    status: "match",
    currentHash: anchored.hash,
    anchoredHash: anchored.hash,
    signature: anchored.signature,
  });
  expect(verified.note).toBe("Proves when the log existed, not that the noise happened.");

  const again = await caller(USER).evidence.anchor({ nightId });
  expect(again).toMatchObject({ alreadyAnchored: true, signature: anchored.signature });
  expect(writes).toHaveLength(1);
});

test("editing the log after anchoring shows a mismatch", async () => {
  const { caller, edit, nightId } = harness();
  const anchored = await caller(USER).evidence.anchor({ nightId });
  edit((r) => ({
    ...r,
    events: r.events.map((e, i) => (i === 0 ? { ...e, peakDb: e.peakDb + 1 } : e)),
  }));
  const verified = await caller(null).evidence.verify({ nightId });
  expect(verified.status).toBe("mismatch");
  expect(verified.anchoredHash).toBe(anchored.hash);
  expect(verified.currentHash).not.toBe(anchored.hash);

  const reanchored = await caller(USER).evidence.anchor({ nightId });
  expect(reanchored.alreadyAnchored).toBe(false);
  expect((await caller(null).evidence.verify({ nightId })).status).toBe("match");
});

test("verify before anchoring says not-anchored; private fields are not hashed", async () => {
  const { caller, edit, nightId } = harness();
  const before = await caller(null).evidence.verify({ nightId });
  expect(before).toMatchObject({ status: "not-anchored", anchoredHash: null, signature: null });
  edit((r) => ({ ...r, location: { lat: 1, lon: 2 } }));
  expect((await caller(null).evidence.verify({ nightId })).currentHash).toBe(before.currentHash);
});

test("another user cannot anchor a night, and chain failures map to BAD_GATEWAY", async () => {
  const { caller, nightId } = harness();
  await expect(caller(OTHER).evidence.anchor({ nightId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(caller(null).evidence.anchor({ nightId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  const failing = createEvidenceService({
    getNight: async () => ({ ...timeline, userId: USER }) as unknown as NightRecord,
    setEvidence: async () => {},
    writeMemo: async () => {
      throw new Error("Solana sendTransaction failed (500)");
    },
    readMemo: async () => "",
    draftComplaint: async () => "",
    sha256: () => "0".repeat(64),
  });
  const c = createCallerFactory(router({ evidence: createEvidenceRouter(failing) }))({
    userId: USER,
  });
  await expect(c.evidence.anchor({ nightId })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
});

const construction = (id: string, t: number, peakDb: number, outside: boolean | null) => ({
  id,
  t,
  peakDb,
  label: "construction" as const,
  labelSources: { gemini: "construction" as const, scribe: "construction" as const },
  outsideRecommendedHours: outside,
});

test("report lists outside-hours construction with times, relative dB and the memo link", async () => {
  const { caller, edit, prompts, nightId } = harness();
  // 2026-11-16 (Monday) 06:41 London = 06:41Z; 12:00Z is inside hours.
  const early = Date.parse("2026-11-16T06:41:00Z") / 1000;
  const noon = Date.parse("2026-11-16T12:00:00Z") / 1000;
  edit((r) => ({
    ...r,
    events: [
      ...r.events,
      construction("late", early + 60, 64.26, null),
      construction("early", early, 70, true),
      construction("noon", noon, 80, null),
    ],
  }));
  const anchored = await caller(USER).evidence.anchor({ nightId });
  const report = await caller(USER).evidence.report({ nightId });

  expect(report.events.map((e) => e.id)).toEqual(["clip-4", "early", "late"]);
  expect(report.events.find((e) => e.id === "early")).toMatchObject({
    at: "2026-11-16T06:41:00.000Z",
    localTime: "Mon 16 Nov, 06:41",
    label: "construction",
    relativeDb: 70,
  });
  expect(report.events.find((e) => e.id === "late")?.relativeDb).toBe(64.3);
  expect(report.events.some((e) => e.id === "noon")).toBe(false);
  expect(report.memo).toEqual({
    signature: anchored.signature,
    explorerUrl: anchored.explorerUrl,
    hash: anchored.hash,
  });
  expect(report).toMatchObject({ draft: "Draft text", draftSource: "gemini" });
  expect(prompts[0]).toContain(anchored.explorerUrl);
  expect(prompts[0]).toContain("Mon 16 Nov, 06:41: construction, 70 relative dB");
  expect(report.note).toBe("Proves when the log existed, not that the noise happened.");
});

test("report has no memo before anchoring or after the log changed", async () => {
  const { caller, edit, nightId } = harness();
  expect((await caller(USER).evidence.report({ nightId })).memo).toBeNull();
  await caller(USER).evidence.anchor({ nightId });
  edit((r) => ({ ...r, events: r.events.map((e) => ({ ...e, peakDb: e.peakDb + 1 })) }));
  expect((await caller(USER).evidence.report({ nightId })).memo).toBeNull();
});

test("report falls back to Kip's wording when Gemini fails or breaks the wording rules", async () => {
  for (const draft of [
    async () => {
      throw new Error("Gemini request failed (500)");
    },
    async () => "This work is illegal and caused by the site.",
    async () => "  ",
  ]) {
    const { caller, nightId } = harness(draft);
    const report = await caller(USER).evidence.report({ nightId });
    expect(report.draftSource).toBe("template");
    expect(report.draft).toContain("outside the council's recommended hours");
    expect(report.draft).toContain("relative dB");
    expect(report.draft).not.toMatch(/illegal|breach|caused by/i);
  }
});

test("report with nothing outside hours skips Gemini; others cannot read it", async () => {
  const { caller, edit, prompts, nightId } = harness();
  edit((r) => ({ ...r, events: r.events.filter((e) => e.label !== "construction") }));
  expect(await caller(USER).evidence.report({ nightId })).toMatchObject({
    events: [],
    draft: null,
    draftSource: null,
  });
  expect(prompts).toHaveLength(0);
  await expect(caller(OTHER).evidence.report({ nightId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(caller(null).evidence.report({ nightId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
