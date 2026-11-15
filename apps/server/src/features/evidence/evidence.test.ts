import { expect, test } from "bun:test";
import { canonicalJson, memoText, parseMemo } from "@kip/shared/evidence";
import { nightTimeline } from "@kip/shared/night";
import nightTimelineFixture from "../../../../../packages/shared/src/night/fixtures/night-timeline.json";
import { createCallerFactory, router } from "../../trpc/init";
import type { NightRecord } from "../night";
import { createEvidenceRouter } from "./router";
import { createEvidenceService, hashLog } from "./service";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const timeline = nightTimeline.parse(nightTimelineFixture);

/** A night, a fake Solana (memos by signature) and the night service's evidence write. */
function harness() {
  let record: NightRecord = {
    ...timeline,
    userId: USER,
    consent: { microphone: true, health: true, location: true },
    location: { lat: 54.9738, lon: -1.6131 },
    vitals: null,
  };
  const memos = new Map<string, string>();
  const writes: string[] = [];
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
  expect(before.currentHash).toBe(hashLog({ ...timeline, userId: USER } as unknown as NightRecord));
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
  });
  const c = createCallerFactory(router({ evidence: createEvidenceRouter(failing) }))({
    userId: USER,
  });
  await expect(c.evidence.anchor({ nightId })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
});
