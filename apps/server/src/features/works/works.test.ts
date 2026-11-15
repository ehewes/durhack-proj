import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WorkRecord, workRecord } from "@kip/shared/works";
import type { Db } from "mongodb";
import { createApp } from "../../app";
import {
  parsePermitNotification,
  STREET_MANAGER_TOPIC_ARNS,
  type StreetManagerFetch,
  type StreetManagerOptions,
  type StreetManagerSnsMessage,
  streetManagerStringToSign,
} from "../../integrations/street-manager";
import { createCallerFactory } from "../../trpc/init";
import { appRouter } from "../../trpc/router";
import { permitToWork } from "./document";
import { worksNear } from "./query";
import {
  createMongoWorksRepository,
  distanceToWork,
  memoryWorksRepository,
  setWorksRepository,
} from "./repo";
import { setStreetManagerOptions } from "./service";

const fixturesDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../integrations/fixtures/street-manager",
);
const topics = Object.values(STREET_MANAGER_TOPIC_ARNS);

let keyPem = "";
let certPem = "";

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "kip-works-sns-"));
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "2",
      "-nodes",
      "-subj",
      "/CN=sns-test",
    ],
    { stdio: "pipe" },
  );
  keyPem = readFileSync(keyPath, "utf8");
  certPem = readFileSync(certPath, "utf8");
});

function readFixture(name: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`fixture ${name} is not an object`);
  }
  return value as Record<string, unknown>;
}

function snsFixture(name: string): StreetManagerSnsMessage {
  return readFixture(name) as StreetManagerSnsMessage;
}

function signedBody(message: StreetManagerSnsMessage): string {
  const next = { ...message, Signature: "UNSIGNED" };
  const payload = streetManagerStringToSign(next);
  const signer = createSign(message.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256");
  signer.update(payload, "utf8");
  return JSON.stringify({ ...next, Signature: signer.sign(keyPem, "base64") });
}

function withCert(extra: Partial<StreetManagerOptions> = {}): StreetManagerOptions {
  return { allowedTopicArns: topics, loadCertificate: async () => certPem, ...extra };
}

function samplePermits(): Record<string, unknown>[] {
  const file = readFixture("newcastle-permits.json");
  if (!Array.isArray(file.permits)) throw new Error("permits");
  return file.permits as Record<string, unknown>[];
}

function notificationFor(event: unknown): StreetManagerSnsMessage {
  const base = snsFixture("sns-permit-notification.json");
  if (base.Type !== "Notification") throw new Error("fixture type");
  return { ...base, Message: JSON.stringify(event) };
}

describe("works repository", () => {
  test("memory near uses metres and keeps the newer permit", async () => {
    const repo = memoryWorksRepository();
    const [sample] = samplePermits();
    if (!sample) throw new Error("sample");
    const work = permitToWork(parsePermitNotification(sample), { simulated: true });
    expect(work.simulated).toBe(true);
    expect(await repo.upsert(work)).toBe("inserted");
    expect(
      await repo.upsert({ ...work, workStatus: "older", eventTime: "2000-01-01T00:00:00.000Z" }),
    ).toBe("kept");
    expect(repo.all()[0]?.workStatus).toBe(work.workStatus);
    expect(
      await repo.upsert({ ...work, workStatus: "newer", eventTime: "2099-01-01T00:00:00.000Z" }),
    ).toBe("updated");
    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]?.workStatus).toBe("newer");

    const point = work.geometry.type === "Point" ? work.geometry.coordinates : null;
    if (!point) throw new Error("expected a point");
    const [lon, lat] = point;
    const nearby = workRecord.parse({
      ...work,
      permitReferenceNumber: "nearby",
      geometry: { type: "Point", coordinates: [lon, lat + 0.001] },
    });
    const distant = workRecord.parse({
      ...work,
      permitReferenceNumber: "distant",
      geometry: { type: "Point", coordinates: [lon, lat + 0.01] },
    });
    await repo.upsert(nearby);
    await repo.upsert(distant);
    const hits = await repo.findNear(lon, lat, 200);
    expect(hits.map((hit) => hit.permitReferenceNumber)).toEqual([
      work.permitReferenceNumber,
      "nearby",
    ]);
  });

  test("mongo repository upserts on permit reference and queries $near", async () => {
    const saved = new Map<string, WorkRecord>();
    let near: unknown;
    const collection = {
      findOne: async (filter: { permitReferenceNumber: string }) =>
        saved.get(filter.permitReferenceNumber) ?? null,
      replaceOne: async (
        filter: { permitReferenceNumber: string },
        doc: WorkRecord,
        options: { upsert?: boolean },
      ) => {
        expect(options.upsert).toBe(true);
        saved.set(filter.permitReferenceNumber, doc);
        return { acknowledged: true };
      },
      find: (filter: unknown) => {
        near = filter;
        return {
          toArray: async () => [...saved.values()].map((doc) => ({ ...doc, _id: "mongo-id" })),
        };
      },
    };
    const db = { collection: () => collection } as unknown as Db;
    const repo = createMongoWorksRepository(db);
    const [sample] = samplePermits();
    if (!sample) throw new Error("sample");
    const work = permitToWork(parsePermitNotification(sample), { simulated: true });
    expect(await repo.upsert(work)).toBe("inserted");
    expect(await repo.upsert({ ...work, eventTime: "2000-01-01T00:00:00.000Z" })).toBe("kept");
    expect(saved.get(work.permitReferenceNumber)?.eventTime).toBe(work.eventTime);
    const found = await repo.findNear(-1.61, 54.97, 200);
    expect(found).toEqual([work]);
    expect(near).toEqual({
      geometry: {
        $near: {
          $geometry: { type: "Point", coordinates: [-1.61, 54.97] },
          $maxDistance: 200,
        },
      },
    });
  });
});

describe.serial("POST /sns/street-manager", () => {
  const app = createApp();
  let store = memoryWorksRepository();

  beforeEach(() => {
    store = memoryWorksRepository();
    setWorksRepository(store);
    setStreetManagerOptions(withCert());
  });

  afterEach(() => {
    setWorksRepository(undefined);
    setStreetManagerOptions(undefined);
  });

  async function post(body: string): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await app.request("/sns/street-manager", {
      method: "POST",
      headers: { "content-type": "text/plain; charset=UTF-8" },
      body,
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  test("confirms a subscription without storing a permit", async () => {
    setWorksRepository(undefined);
    const calls: string[] = [];
    const confirmation = snsFixture("sns-subscription-confirmation.json");
    setStreetManagerOptions(
      withCert({
        fetch: async (input) => {
          calls.push(String(input));
          return new Response("<ConfirmSubscriptionResponse/>", { status: 200 });
        },
      }),
    );
    const result = await post(signedBody(confirmation));
    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      ok: true,
      kind: "subscription_confirmed",
      topicArn: STREET_MANAGER_TOPIC_ARNS.permit,
    });
    expect(calls).toEqual([
      confirmation.Type === "SubscriptionConfirmation" ? confirmation.SubscribeURL : "",
    ]);
  });

  test("a rejected confirmation is not stored", async () => {
    const fetchImpl: StreetManagerFetch = async () => new Response("no", { status: 403 });
    setStreetManagerOptions(withCert({ fetch: fetchImpl }));
    const result = await post(signedBody(snsFixture("sns-subscription-confirmation.json")));
    expect(result).toEqual({ status: 502, json: { ok: false, error: "subscription" } });
    expect(store.all()).toEqual([]);
  });

  test("ignores activity, section 58 and unsubscribe", async () => {
    const fetchImpl: StreetManagerFetch = async () => {
      throw new Error("unsubscribe must not be fetched");
    };
    setStreetManagerOptions(withCert({ fetch: fetchImpl }));
    const activity = await post(signedBody(snsFixture("sns-activity-notification.json")));
    const section = await post(signedBody(snsFixture("sns-section-58-notification.json")));
    const unsubscribe = await post(signedBody(snsFixture("sns-unsubscribe-confirmation.json")));
    expect(activity.json).toMatchObject({ ok: true, kind: "ignored", objectType: "ACTIVITY" });
    expect(section.json).toMatchObject({ ok: true, kind: "ignored", objectType: "SECTION_58" });
    expect(unsubscribe.json).toMatchObject({ ok: true, kind: "unsubscribe_confirmation" });
    expect(store.all()).toEqual([]);
  });

  test("stores a Newcastle permit and drops one outside the area", async () => {
    const grey = samplePermits().find(
      (permit) =>
        (permit.object_data as { street_name?: string } | undefined)?.street_name === "Grey Street",
    );
    if (!grey) throw new Error("Grey Street");
    const stored = await post(signedBody(notificationFor(grey)));
    expect(stored.status).toBe(200);
    expect(stored.json).toMatchObject({
      ok: true,
      kind: "permit",
      stored: true,
      nightWork: true,
    });
    const saved = store.all();
    expect(saved).toHaveLength(1);
    const work = saved[0];
    if (!work) throw new Error("stored");
    expect(work.simulated).toBe(false);
    expect(work.streetName).toBe("Grey Street");
    expect(work.geometry.type).toBe("Point");
    expect(work.proposedStart).toEqual({
      date: "2026-11-15T00:00:00.000Z",
      time: "2026-11-15T22:00:00.000Z",
    });
    expect(work.proposedEnd.time).toBe("2026-11-16T18:30:00.000Z");
    expect(work.actualStart).toBeNull();
    expect(work.actualEnd).toBeNull();
    expect(work.nightWork).toBe(true);

    const london = await post(signedBody(snsFixture("sns-permit-notification.json")));
    expect(london.status).toBe(200);
    expect(london.json).toMatchObject({
      ok: true,
      kind: "permit",
      stored: false,
      reason: "outside_newcastle",
    });
    expect(store.all()).toHaveLength(1);
  });

  test("an older redelivery does not replace the stored permit", async () => {
    const grey = samplePermits().find(
      (permit) =>
        (permit.object_data as { street_name?: string } | undefined)?.street_name === "Grey Street",
    );
    if (!grey) throw new Error("Grey Street");
    await post(signedBody(notificationFor(grey)));
    const older = structuredClone(grey);
    older.event_time = "2020-01-01T00:00:00.000Z";
    (older.object_data as { work_status: string }).work_status = "should not win";
    const replay = await post(signedBody(notificationFor(older)));
    expect(replay.json).toMatchObject({ stored: true });
    expect(store.all()[0]?.workStatus).toBe("Works in progress");
    expect(store.all()).toHaveLength(1);
  });

  test("rejects a bad signature and a body that is not JSON", async () => {
    const signed = JSON.parse(signedBody(snsFixture("sns-permit-notification.json"))) as {
      Message: string;
    };
    signed.Message = "tampered";
    const bad = await post(JSON.stringify(signed));
    expect(bad).toEqual({ status: 403, json: { ok: false, error: "signature" } });
    const malformed = await post("not-json");
    expect(malformed).toEqual({ status: 400, json: { ok: false, error: "malformed" } });
    expect(store.all()).toEqual([]);
  });

  test("the Newcastle sample is stored with night flags, lines and dates", async () => {
    for (const permit of samplePermits()) {
      const result = await post(signedBody(notificationFor(permit)));
      expect(result.status).toBe(200);
      expect(result.json).toMatchObject({ kind: "permit", stored: true });
    }
    const works = store.all();
    expect(works).toHaveLength(22);
    expect(works.every((work) => work.simulated === false)).toBe(true);

    const byStreet = new Map(works.map((work) => [work.streetName, work]));
    expect(byStreet.get("Grey Street")?.nightWork).toBe(true);
    expect(byStreet.get("Northumberland Street")?.nightWork).toBe(false);
    expect(byStreet.get("Neville Street")?.nightWork).toBe(true);
    expect(byStreet.get("Neville Street")?.geometry.type).toBe("LineString");
    expect(byStreet.get("Heaton Road")?.nightWork).toBe(false);
    expect(byStreet.get("Grainger Street")?.nightWork).toBe(true);
    expect(byStreet.get("Clayton Street")?.nightWork).toBe(true);
    expect(byStreet.get("Scotswood Road")?.nightWork).toBe(false);
    expect(byStreet.get("Acorn Road")?.nightWork).toBe(true);
    const neville = byStreet.get("Neville Street");
    if (neville?.geometry.type !== "LineString") throw new Error("line");
    expect(neville.geometry.coordinates).toHaveLength(2);

    const grey = byStreet.get("Grey Street");
    if (grey?.geometry.type !== "Point") throw new Error("point");
    const [lon, lat] = grey.geometry.coordinates;
    const caller = createCallerFactory(appRouter)({ userId: null });
    const onTheNight = await caller.works.near({
      lat,
      lon,
      radiusM: 30,
      from: "2026-11-15",
      to: "2026-11-15",
    });
    expect(onTheNight.works.map((work) => work.streetName)).toEqual(["Grey Street"]);
    const anotherWeek = await caller.works.near({
      lat,
      lon,
      radiusM: 30,
      from: "2026-11-20",
      to: "2026-11-21",
    });
    expect(anotherWeek.works).toEqual([]);
    await expect(
      caller.works.near({ lat, lon, from: "2026-11-16", to: "2026-11-15" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe.serial("works.near", () => {
  afterEach(() => {
    setWorksRepository(undefined);
  });

  test("returns simulated sample permits for the stay dates inside the default radius", async () => {
    const repo = memoryWorksRepository();
    setWorksRepository(repo);
    const works = samplePermits().map((permit) =>
      permitToWork(parsePermitNotification(permit), { simulated: true }),
    );
    for (const work of works) await repo.upsert(work);
    const grey = works.find((work) => work.streetName === "Grey Street");
    if (grey?.geometry.type !== "Point") throw new Error("Grey Street");
    const [lon, lat] = grey.geometry.coordinates;
    const close = workRecord.parse({
      ...grey,
      permitReferenceNumber: "close",
      streetName: "Close",
      geometry: { type: "Point", coordinates: [lon, lat + 0.0013] },
    });
    const far = workRecord.parse({
      ...grey,
      permitReferenceNumber: "far",
      streetName: "Far",
      geometry: { type: "Point", coordinates: [lon, lat + 0.0025] },
    });
    await repo.upsert(close);
    await repo.upsert(far);

    const caller = createCallerFactory(appRouter)({ userId: null });
    const result = await caller.works.near({ lat, lon, from: "2026-11-15", to: "2026-11-16" });
    const names = result.works.map((work) => work.streetName);
    expect(names).toContain("Grey Street");
    expect(names).toContain("Close");
    expect(names).not.toContain("Far");
    expect(names).not.toContain("Northumberland Street");
    expect(result.works.every((work) => work.simulated)).toBe(true);

    await expect(
      worksNear({ lat, lon, radiusM: 200, from: "2026-11-16", to: "2026-11-15" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("returns a real extent, a point, an unknown schedule and counts bad geometry", async () => {
    const works = samplePermits().map((permit) =>
      permitToWork(parsePermitNotification(permit), { simulated: true }),
    );
    const neville = works.find((work) => work.streetName === "Neville Street");
    if (neville?.geometry.type !== "LineString") throw new Error("Neville Street");
    const [lon, lat] = neville.geometry.coordinates[0] ?? [0, 0];
    const dateOnly = {
      ...neville,
      permitReferenceNumber: "date-only",
      nightWork: false,
      proposedStart: { date: neville.proposedStart.date, time: null },
      proposedEnd: { date: neville.proposedEnd.date, time: null },
      geometry: { type: "Point", coordinates: [lon, lat] },
    };
    const absent = { ...neville, permitReferenceNumber: "absent", geometry: undefined };
    const malformed = {
      ...neville,
      permitReferenceNumber: "bad",
      geometry: { type: "Point", coordinates: [lon, 154] },
    };
    setWorksRepository({
      upsert: async () => "inserted",
      findNear: async () => [neville, dateOnly, absent, malformed],
    });
    const from = neville.proposedStart.date?.slice(0, 10) ?? "";
    const result = await worksNear({ lat, lon, radiusM: 200, from, to: from });
    const byRef = new Map(result.works.map((work) => [work.permitReferenceNumber, work]));
    expect(byRef.get(neville.permitReferenceNumber)).toMatchObject({
      precision: "extent",
      geometry: { type: "LineString" },
    });
    expect(byRef.get("date-only")).toMatchObject({ precision: "point", nightWork: "unknown" });
    expect(byRef.has("absent")).toBe(false);
    expect(byRef.has("bad")).toBe(false);
    expect(result.omitted).toEqual({ absentGeometry: 1, malformedGeometry: 1 });
  });

  test("distance to a polygon is zero inside and measured to the edge outside", () => {
    const [sample] = samplePermits();
    if (!sample) throw new Error("sample");
    const base = permitToWork(parsePermitNotification(sample), { simulated: true });
    const ring: Array<[number, number]> = [
      [-1.62, 54.97],
      [-1.61, 54.97],
      [-1.61, 54.98],
      [-1.62, 54.98],
      [-1.62, 54.97],
    ];
    const area = { ...base, geometry: { type: "Polygon" as const, coordinates: [ring] } };
    expect(distanceToWork(54.975, -1.615, area)).toBe(0);
    expect(distanceToWork(54.969, -1.615, area)).toBeGreaterThan(100);
    expect(distanceToWork(54.969, -1.615, area)).toBeLessThan(120);
  });
});
