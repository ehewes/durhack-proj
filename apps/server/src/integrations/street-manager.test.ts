import { beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  StreetManagerFetch,
  StreetManagerOptions,
  StreetManagerSnsMessage,
} from "./street-manager";
import {
  bngToWgs84,
  parsePermitNotification,
  receiveStreetManagerMessage,
  STREET_MANAGER_TOPIC_ARNS,
  StreetManagerError,
  streetManagerStringToSign,
  streetManagerTopics,
} from "./street-manager";

const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures/street-manager");
const topics = Object.values(STREET_MANAGER_TOPIC_ARNS);

let keyPem = "";
let certPem = "";

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "kip-sns-"));
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
  const value = readFixture(name);
  if (typeof value.Type !== "string" || typeof value.Message !== "string") {
    throw new Error(`fixture ${name} is not an SNS message`);
  }
  return value as StreetManagerSnsMessage;
}

function signedBody(message: StreetManagerSnsMessage, version?: "1" | "2"): string {
  const signatureVersion = version ?? message.SignatureVersion;
  const next = { ...message, SignatureVersion: signatureVersion, Signature: "UNSIGNED" };
  const payload = streetManagerStringToSign(next);
  const signer = createSign(signatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256");
  signer.update(payload, "utf8");
  return JSON.stringify({ ...next, Signature: signer.sign(keyPem, "base64") });
}

function withCert(extra: Partial<StreetManagerOptions> = {}): StreetManagerOptions {
  return { allowedTopicArns: topics, loadCertificate: async () => certPem, ...extra };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(StreetManagerError);
    return (error as StreetManagerError).code;
  }
  throw new Error("expected StreetManagerError");
}

function metresApart(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 111_320;
  const dLon = (lon2 - lon1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

describe("streetManagerTopics", () => {
  test("defaults to the three DfT topics and can narrow to one", () => {
    const previous = process.env.STREET_MANAGER_TOPIC_ARN;
    delete process.env.STREET_MANAGER_TOPIC_ARN;
    try {
      expect([...streetManagerTopics()].sort()).toEqual([...topics].sort());
      process.env.STREET_MANAGER_TOPIC_ARN = STREET_MANAGER_TOPIC_ARNS.activity;
      expect(streetManagerTopics()).toEqual([STREET_MANAGER_TOPIC_ARNS.activity]);
      process.env.STREET_MANAGER_TOPIC_ARN =
        "arn:aws:sns:eu-west-2:111111111111:not-street-manager";
      expect(() => streetManagerTopics()).toThrow(StreetManagerError);
    } finally {
      if (previous === undefined) delete process.env.STREET_MANAGER_TOPIC_ARN;
      else process.env.STREET_MANAGER_TOPIC_ARN = previous;
    }
  });

  test("rejects an override that is not a Street Manager topic", () => {
    expect(() =>
      streetManagerTopics(["arn:aws:sns:eu-west-2:111111111111:not-street-manager"]),
    ).toThrow(StreetManagerError);
    expect(() => streetManagerTopics([])).toThrow(StreetManagerError);
  });
});

describe("British National Grid", () => {
  test("matches the Ordnance Survey Helmert worked examples", () => {
    // Caister Water Tower, OS guide annex: grid 651409.903, 313177.270.
    const caister = bngToWgs84(651409.903, 313177.27);
    expect(caister.lat).toBeCloseTo(52.6579786, 6);
    expect(caister.lon).toBeCloseTo(1.7160519, 6);
    // OSTN15 ETRS89 of the same tower is 52°39'28.8282" N, 1°42'57.8663" E.
    // The published Helmert is within about 5 metres of OSTN15.
    const ostnLat = 52 + 39 / 60 + 28.8282 / 3600;
    const ostnLon = 1 + 42 / 60 + 57.8663 / 3600;
    expect(metresApart(caister.lat, caister.lon, ostnLat, ostnLon)).toBeLessThan(5);

    // Second worked example: 53°36'42.2972" N, 1°39'46.5416" W projects to this grid.
    const other = bngToWgs84(422297.792, 412878.741);
    expect(other.lat).toBeCloseTo(53.6119904, 6);
    expect(other.lon).toBeCloseTo(-1.6644423, 6);
  });

  test("rejects a point outside Great Britain", () => {
    expect(() => bngToWgs84(900_000, 100)).toThrow(StreetManagerError);
  });
});

describe("SNS canonical string", () => {
  test("lists notification fields in the AWS order", () => {
    const notification: StreetManagerSnsMessage = {
      Type: "Notification",
      Message: "hello",
      MessageId: "id-1",
      TopicArn: STREET_MANAGER_TOPIC_ARNS.permit,
      Timestamp: "2020-06-04T10:05:15.215Z",
      SignatureVersion: "1",
      Signature: "UNSIGNED",
      SigningCertURL:
        "https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pem",
    };
    expect(streetManagerStringToSign(notification)).toBe(
      [
        "Message",
        "hello",
        "MessageId",
        "id-1",
        "Timestamp",
        "2020-06-04T10:05:15.215Z",
        "TopicArn",
        STREET_MANAGER_TOPIC_ARNS.permit,
        "Type",
        "Notification",
        "",
      ].join("\n"),
    );
    expect(streetManagerStringToSign({ ...notification, Subject: "permit" })).toContain(
      "MessageId\nid-1\nSubject\npermit\nTimestamp\n",
    );
  });

  test("keeps a newline inside a subscription Message", () => {
    const confirmation = snsFixture("sns-subscription-confirmation.json");
    expect(confirmation.Type).toBe("SubscriptionConfirmation");
    if (confirmation.Type !== "SubscriptionConfirmation") return;
    expect(confirmation.Message).toContain("\n");
    expect(streetManagerStringToSign(confirmation)).toBe(
      [
        "Message",
        confirmation.Message,
        "MessageId",
        confirmation.MessageId,
        "SubscribeURL",
        confirmation.SubscribeURL,
        "Timestamp",
        confirmation.Timestamp,
        "Token",
        confirmation.Token,
        "TopicArn",
        confirmation.TopicArn,
        "Type",
        confirmation.Type,
        "",
      ].join("\n"),
    );
  });
});

describe("receiveStreetManagerMessage", () => {
  test("fixtures cover each SNS message type", () => {
    expect(snsFixture("sns-subscription-confirmation.json").Type).toBe("SubscriptionConfirmation");
    expect(snsFixture("sns-unsubscribe-confirmation.json").Type).toBe("UnsubscribeConfirmation");
    expect(snsFixture("sns-permit-notification.json").Type).toBe("Notification");
    expect(snsFixture("sns-activity-notification.json").Type).toBe("Notification");
    expect(snsFixture("sns-section-58-notification.json").Type).toBe("Notification");
    const permit = JSON.parse(snsFixture("sns-permit-notification.json").Message) as {
      object_type: string;
    };
    const activity = JSON.parse(snsFixture("sns-activity-notification.json").Message) as {
      object_type: string;
    };
    const section = JSON.parse(snsFixture("sns-section-58-notification.json").Message) as {
      object_type: string;
    };
    expect(permit.object_type).toBe("PERMIT");
    expect(activity.object_type).toBe("ACTIVITY");
    expect(section.object_type).toBe("SECTION_58");
  });

  test("confirms a signed subscription by GET on SubscribeURL", async () => {
    const calls: Array<{ url: string; method: string; redirect: string | undefined }> = [];
    const confirmation = snsFixture("sns-subscription-confirmation.json");
    const fetchImpl: StreetManagerFetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, method: init?.method ?? "GET", redirect: init?.redirect });
      return new Response("<ConfirmSubscriptionResponse/>", { status: 200 });
    };
    const receipt = await receiveStreetManagerMessage(signedBody(confirmation), {
      ...withCert(),
      fetch: fetchImpl,
    });
    expect(receipt).toEqual({
      kind: "subscription_confirmed",
      topicArn: STREET_MANAGER_TOPIC_ARNS.permit,
      status: 200,
    });
    expect(calls).toEqual([
      {
        url: confirmation.Type === "SubscriptionConfirmation" ? confirmation.SubscribeURL : "",
        method: "GET",
        redirect: "error",
      },
    ]);
  });

  test("does not confirm when the signature, topic, or SubscribeURL is wrong", async () => {
    const confirmation = snsFixture("sns-subscription-confirmation.json");
    const calls: string[] = [];
    const fetchImpl: StreetManagerFetch = async (input) => {
      calls.push(String(input));
      return new Response("ok", { status: 200 });
    };
    const options = { ...withCert(), fetch: fetchImpl };

    const tampered = JSON.parse(signedBody(confirmation)) as StreetManagerSnsMessage;
    if (tampered.Type !== "SubscriptionConfirmation") throw new Error("fixture type");
    tampered.Message = "tampered";
    expect(await errorCode(receiveStreetManagerMessage(JSON.stringify(tampered), options))).toBe(
      "signature",
    );

    const otherTopic = {
      ...confirmation,
      TopicArn: "arn:aws:sns:eu-west-2:111111111111:not-street-manager",
    } as StreetManagerSnsMessage;
    expect(await errorCode(receiveStreetManagerMessage(signedBody(otherTopic), options))).toBe(
      "topic",
    );

    const evilUrl = {
      ...confirmation,
      SubscribeURL: "https://example.com/?Action=ConfirmSubscription",
    } as StreetManagerSnsMessage;
    expect(await errorCode(receiveStreetManagerMessage(signedBody(evilUrl), options))).toBe(
      "subscription",
    );

    const evilCert = {
      ...confirmation,
      SigningCertURL:
        "https://example.com/SimpleNotificationService-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pem",
    } as StreetManagerSnsMessage;
    let loaded = false;
    expect(
      await errorCode(
        receiveStreetManagerMessage(signedBody(evilCert), {
          ...options,
          loadCertificate: async () => {
            loaded = true;
            return certPem;
          },
        }),
      ),
    ).toBe("certificate");
    expect(loaded).toBe(false);
    expect(calls).toEqual([]);
  });

  test("surfaces a rejected confirmation and ignores unsubscribe", async () => {
    const confirmation = snsFixture("sns-subscription-confirmation.json");
    const fetchImpl: StreetManagerFetch = async () => new Response("no", { status: 403 });
    expect(
      await errorCode(
        receiveStreetManagerMessage(signedBody(confirmation), { ...withCert(), fetch: fetchImpl }),
      ),
    ).toBe("subscription");

    const calls: string[] = [];
    const unsubscribe = await receiveStreetManagerMessage(
      signedBody(snsFixture("sns-unsubscribe-confirmation.json")),
      {
        ...withCert(),
        fetch: async (input) => {
          calls.push(String(input));
          return new Response("ok");
        },
      },
    );
    expect(unsubscribe).toEqual({
      kind: "unsubscribe_confirmation",
      topicArn: STREET_MANAGER_TOPIC_ARNS.permit,
    });
    expect(calls).toEqual([]);
  });

  test("parses a signed permit and ignores activity and section 58", async () => {
    const permit = await receiveStreetManagerMessage(
      signedBody(snsFixture("sns-permit-notification.json")),
      withCert(),
    );
    expect(permit.kind).toBe("permit");
    if (permit.kind !== "permit") return;
    expect(permit.permit).toMatchObject({
      eventType: "WORK_START",
      streetName: "CHURCH STREET",
      workCategory: "Minor",
      trafficManagementType: "Road closure",
      proposedStart: { date: "2020-06-23T23:00:00.000Z", time: null },
      proposedEnd: { date: "2020-06-27T23:00:00.000Z", time: null },
      actualStart: "2020-06-24T10:11:00.000Z",
      actualEnd: null,
    });
    expect(permit.permit.location.easting).toBeCloseTo(527155.3328125, 4);
    expect(permit.permit.location.northing).toBeCloseTo(182227.946386719, 4);
    expect(permit.permit.location.lat).toBeCloseTo(51.5246596, 5);
    expect(permit.permit.location.lon).toBeCloseTo(-0.1685142, 5);

    const activity = await receiveStreetManagerMessage(
      signedBody(snsFixture("sns-activity-notification.json")),
      withCert(),
    );
    expect(activity).toEqual({
      kind: "ignored",
      topicArn: STREET_MANAGER_TOPIC_ARNS.activity,
      objectType: "ACTIVITY",
    });
    const section = await receiveStreetManagerMessage(
      signedBody(snsFixture("sns-section-58-notification.json")),
      withCert(),
    );
    expect(section).toEqual({
      kind: "ignored",
      topicArn: STREET_MANAGER_TOPIC_ARNS.section58,
      objectType: "SECTION_58",
    });
  });

  test("accepts signature version 2 and caches the signing certificate", async () => {
    const certUrl = `https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-${"cd".repeat(16)}.pem`;
    const message = { ...snsFixture("sns-permit-notification.json"), SigningCertURL: certUrl };
    let certFetches = 0;
    const fetchImpl: StreetManagerFetch = async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === certUrl) {
        certFetches += 1;
        return new Response(certPem, { status: 200 });
      }
      return new Response("no", { status: 500 });
    };
    const body = signedBody(message, "2");
    const options = { allowedTopicArns: topics, fetch: fetchImpl };
    const first = await receiveStreetManagerMessage(body, options);
    const second = await receiveStreetManagerMessage(body, options);
    expect(first.kind).toBe("permit");
    expect(second.kind).toBe("permit");
    expect(certFetches).toBe(1);
  });

  test("rejects a certificate response that is not a PEM", async () => {
    const certUrl = `https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-${"ef".repeat(16)}.pem`;
    const message = { ...snsFixture("sns-permit-notification.json"), SigningCertURL: certUrl };
    const fetchImpl: StreetManagerFetch = async () =>
      new Response("not a certificate", { status: 200 });
    expect(
      await errorCode(
        receiveStreetManagerMessage(signedBody(message), {
          allowedTopicArns: topics,
          fetch: fetchImpl,
        }),
      ),
    ).toBe("certificate");
  });

  test("rejects malformed bodies", async () => {
    expect(await errorCode(receiveStreetManagerMessage("not-json", withCert()))).toBe("malformed");
    const broken = snsFixture("sns-permit-notification.json");
    if (broken.Type !== "Notification") throw new Error("fixture type");
    expect(
      await errorCode(
        receiveStreetManagerMessage(signedBody({ ...broken, Message: "not-json" }), withCert()),
      ),
    ).toBe("malformed");
  });
});

describe("Newcastle permit sample", () => {
  test("parses 22 simulated permits inside Newcastle", () => {
    const file = readFixture("newcastle-permits.json");
    expect(file.simulated).toBe(true);
    expect(String(file.source).toLowerCase()).toContain("simulated");
    expect(String(file.source)).toContain("Not a recorded Street Manager feed");
    if (!Array.isArray(file.permits)) throw new Error("permits");
    expect(file.permits.length).toBeGreaterThanOrEqual(20);

    const parsed = file.permits.map((permit) => parsePermitNotification(permit));
    expect(new Set(parsed.map((permit) => permit.permitReferenceNumber)).size).toBe(parsed.length);
    for (const permit of parsed) {
      expect(permit.highwayAuthority).toBe("NEWCASTLE CITY COUNCIL");
      expect(permit.workCategory.length).toBeGreaterThan(0);
      expect(permit.trafficManagementType.length).toBeGreaterThan(0);
      expect(permit.location.lat).toBeGreaterThan(54.95);
      expect(permit.location.lat).toBeLessThan(55.05);
      expect(permit.location.lon).toBeGreaterThan(-1.8);
      expect(permit.location.lon).toBeLessThan(-1.5);
    }

    const neville = parsed.find((permit) => permit.streetName === "Neville Street");
    expect(neville).toBeDefined();
    expect(neville?.location.easting).toBeCloseTo((424520 + 424600) / 2, 5);
    expect(neville?.location.northing).toBeCloseTo((563860 + 563900) / 2, 5);
    expect(neville?.proposedStart.time).toBe(neville?.proposedStart.date);

    const undated = parsed.find((permit) => permit.streetName === "Grainger Street");
    expect(undated?.proposedStart.date).toEqual(expect.any(String));
    expect(undated?.proposedStart.time).toBeNull();
  });

  test("refuses an activity event and a permit with no work category", () => {
    const activity = JSON.parse(snsFixture("sns-activity-notification.json").Message) as unknown;
    expect(() => parsePermitNotification(activity)).toThrow(StreetManagerError);

    const file = readFixture("newcastle-permits.json");
    const first = Array.isArray(file.permits) ? structuredClone(file.permits[0]) : undefined;
    if (!first || typeof first !== "object") throw new Error("permit");
    const record = first as { object_data?: { work_category?: string } };
    if (!record.object_data) throw new Error("object_data");
    delete record.object_data.work_category;
    expect(() => parsePermitNotification(record)).toThrow(StreetManagerError);
  });
});
