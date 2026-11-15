import { describe, expect, test } from "bun:test";
import { type AccountView, accountView } from "@kip/shared/account";
import { nightUpload } from "@kip/shared/night";
import { QueryClient } from "@tanstack/react-query";
import nightUploadFixture from "../../../../../../packages/shared/src/night/fixtures/night-upload.json";
import {
  createWatchSleepReader,
  type HealthPort,
  type HealthSample,
  healthConsentOf,
  healthKitFilter,
  lastNight,
  londonIso,
  nightWindow,
  quietWindow,
  type RawHealth,
  recentNights,
  SLEEP_VALUE,
  type SleepWindow,
  stageOf,
  toNightRead,
  watchNightStaleMs,
} from "./watch-sleep";

const WATCH = "com.apple.health.5F1C0A2B";
const PHONE = "com.apple.health";
const APP = "com.example.sleepapp";
/** A sleep app running on the Watch: a Watch sample, but not Apple's own tracking. */
const WATCH_APP = "com.example.sleepapp.watchkitapp";

function sample(start: string, end: string, value: number, source = WATCH): HealthSample {
  return {
    start: new Date(start),
    end: new Date(end),
    value,
    sourceId: source,
    fromWatch: source === WATCH || source === WATCH_APP,
  };
}

const point = (t: string, value: number, source = WATCH) => sample(t, t, value, source);
const raw = (parts: Partial<RawHealth>): RawHealth => ({
  stages: [],
  heartRate: [],
  hrv: [],
  respiratoryRate: [],
  ...parts,
});
const { inBed, asleepUnspecified, awake, asleepCore, asleepDeep, asleepREM } = SLEEP_VALUE;
const WINDOW = nightWindow("2026-11-14");

describe("London time", () => {
  test("writes GMT and BST offsets and drops milliseconds", () => {
    expect(londonIso(new Date("2026-11-14T23:05:07.250Z"))).toBe("2026-11-14T23:05:07+00:00");
    expect(londonIso(new Date("2026-07-14T22:05:07Z"))).toBe("2026-07-14T23:05:07+01:00");
  });

  test("a night's window runs 18:00 to 12:00 London time, across a clock change", () => {
    expect(WINDOW.start.toISOString()).toBe("2026-11-14T18:00:00.000Z");
    expect(WINDOW.end.toISOString()).toBe("2026-11-15T12:00:00.000Z");
    const summer = nightWindow("2026-07-14");
    expect(summer.start.toISOString()).toBe("2026-07-14T17:00:00.000Z");
    expect(summer.end.toISOString()).toBe("2026-07-15T11:00:00.000Z");
    // Clocks go back at 02:00 BST on 25 October 2026.
    const change = nightWindow("2026-10-24");
    expect(change.start.toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(change.end.toISOString()).toBe("2026-10-25T12:00:00.000Z");
  });

  test("the quiet window is 23:00 to 07:00 London time", () => {
    expect(quietWindow("2026-11-14")).toEqual({
      start: new Date("2026-11-14T23:00:00Z"),
      end: new Date("2026-11-15T07:00:00Z"),
    });
    expect(quietWindow("2026-07-14")).toEqual({
      start: new Date("2026-07-14T22:00:00Z"),
      end: new Date("2026-07-15T06:00:00Z"),
    });
  });

  test("last night is the one slept, from 06:00 until the next 06:00", () => {
    expect(lastNight(new Date("2026-11-16T00:30:00Z"))).toBe("2026-11-14");
    expect(lastNight(new Date("2026-11-15T05:59:00Z"))).toBe("2026-11-13");
    expect(lastNight(new Date("2026-11-15T06:00:00Z"))).toBe("2026-11-14");
    expect(lastNight(new Date("2026-11-15T09:00:00Z"))).toBe("2026-11-14");
    // Clocks go forward at 01:00 GMT on 29 March and back at 01:00 GMT on 25 October 2026.
    expect(lastNight(new Date("2026-03-29T06:30:00+01:00"))).toBe("2026-03-28");
    expect(lastNight(new Date("2026-03-29T05:30:00+01:00"))).toBe("2026-03-27");
    expect(lastNight(new Date("2026-10-25T05:30:00Z"))).toBe("2026-10-23");
    expect(lastNight(new Date("2026-10-25T06:00:00Z"))).toBe("2026-10-24");
    expect(lastNight(new Date("2026-11-15T20:00:00Z"))).toBe("2026-11-14");
    expect(lastNight(new Date("2026-11-15T11:59:00Z"))).toBe("2026-11-14");
    expect(recentNights(3, new Date("2026-11-15T09:00:00Z"))).toEqual([
      "2026-11-14",
      "2026-11-13",
      "2026-11-12",
    ]);
  });
});

describe("sleep stages", () => {
  test("maps every staged HealthKit value, and leaves unstaged sleep out", () => {
    expect(stageOf(inBed)).toBe("inBed");
    expect(stageOf(awake)).toBe("awake");
    expect(stageOf(asleepCore)).toBe("core");
    expect(stageOf(asleepDeep)).toBe("deep");
    expect(stageOf(asleepREM)).toBe("rem");
    expect(stageOf(asleepUnspecified)).toBeNull();
    expect(stageOf(42)).toBeNull();
  });

  test("uses only the Watch when it recorded the night", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-14T22:30:00Z", "2026-11-15T07:30:00Z", inBed, PHONE),
          sample("2026-11-14T23:00:00Z", "2026-11-15T02:00:00Z", asleepCore, APP),
          sample("2026-11-14T23:10:00Z", "2026-11-15T01:00:00Z", asleepCore),
          sample("2026-11-15T01:00:00Z", "2026-11-15T01:04:00Z", awake),
        ],
      }),
      WINDOW,
    );
    expect(read?.fromWatch).toBe(true);
    expect(read?.sleep.stages).toEqual([
      { start: "2026-11-14T23:10:00+00:00", end: "2026-11-15T01:00:00+00:00", stage: "core" },
      { start: "2026-11-15T01:00:00+00:00", end: "2026-11-15T01:04:00+00:00", stage: "awake" },
    ]);
  });

  test("Apple's own Watch tracking beats a sleep app on the Watch", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-14T23:00:00Z", "2026-11-15T00:00:00Z", asleepCore, WATCH_APP),
          sample("2026-11-15T00:00:00Z", "2026-11-15T02:00:00Z", asleepREM, WATCH_APP),
          sample("2026-11-14T23:10:00Z", "2026-11-15T01:00:00Z", asleepDeep),
        ],
      }),
      WINDOW,
    );
    expect(read?.fromWatch).toBe(true);
    expect(read?.sleep.stages).toEqual([
      { start: "2026-11-14T23:10:00+00:00", end: "2026-11-15T01:00:00+00:00", stage: "deep" },
    ]);
  });

  test("in bed fills only the gaps between stages", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-14T23:00:00Z", "2026-11-15T07:00:00Z", inBed),
          sample("2026-11-14T23:30:00Z", "2026-11-15T03:00:00Z", asleepCore),
          sample("2026-11-15T03:00:00Z", "2026-11-15T04:00:00Z", asleepDeep),
        ],
      }),
      WINDOW,
    );
    expect(
      read?.sleep.stages.map((s) => [s.start.slice(11, 16), s.end.slice(11, 16), s.stage]),
    ).toEqual([
      ["23:00", "23:30", "inBed"],
      ["23:30", "03:00", "core"],
      ["03:00", "04:00", "deep"],
      ["04:00", "07:00", "inBed"],
    ]);
  });

  test("trims overlaps, joins touching runs of one stage and clips to the window", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-15T11:00:00Z", "2026-11-15T13:00:00Z", asleepREM),
          sample("2026-11-15T09:00:00Z", "2026-11-15T10:00:00Z", asleepCore),
          sample("2026-11-15T09:30:00Z", "2026-11-15T10:30:00Z", asleepDeep),
          sample("2026-11-15T10:30:00Z", "2026-11-15T11:00:00Z", asleepDeep),
        ],
      }),
      WINDOW,
    );
    expect(read?.sleep.stages).toEqual([
      { start: "2026-11-15T09:00:00+00:00", end: "2026-11-15T10:00:00+00:00", stage: "core" },
      { start: "2026-11-15T10:00:00+00:00", end: "2026-11-15T11:00:00+00:00", stage: "deep" },
      { start: "2026-11-15T11:00:00+00:00", end: "2026-11-15T12:00:00+00:00", stage: "rem" },
    ]);
  });

  test("without a Watch, keeps one source so two apps never interleave", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-14T22:30:00Z", "2026-11-15T07:30:00Z", inBed, PHONE),
          sample("2026-11-14T23:00:00Z", "2026-11-15T02:00:00Z", asleepCore, APP),
          sample("2026-11-15T02:00:00Z", "2026-11-15T03:00:00Z", asleepDeep, APP),
        ],
      }),
      WINDOW,
    );
    expect(read?.fromWatch).toBe(false);
    expect(read?.sleep.stages.map((s) => s.stage)).toEqual(["core", "deep"]);
  });
});

describe("vitals", () => {
  test("heart rate, HRV and breathing become sorted [epoch seconds, value] samples", () => {
    const read = toNightRead(
      raw({
        heartRate: [
          point("2026-11-15T01:02:00.400Z", 61.04),
          point("2026-11-15T01:01:00Z", 58),
          point("2026-11-15T01:01:00.900Z", 59),
          point("2026-11-15T01:01:30Z", 90, APP),
          point("2026-11-14T17:00:00Z", 70),
        ],
        hrv: [sample("2026-11-15T01:00:00Z", "2026-11-15T01:01:00Z", 43.2871)],
        respiratoryRate: [sample("2026-11-15T01:00:00Z", "2026-11-15T01:05:00Z", 14.5)],
      }),
      WINDOW,
    );
    const t = (iso: string) => Date.parse(iso) / 1000;
    expect(read?.sleep.heartRate).toEqual([
      [t("2026-11-15T01:01:00Z"), 58],
      [t("2026-11-15T01:02:00Z"), 61],
    ]);
    expect(read?.sleep.hrv).toEqual([[t("2026-11-15T01:00:00Z"), 43.3]]);
    expect(read?.sleep.respiratoryRate).toEqual([[t("2026-11-15T01:00:00Z"), 14.5]]);
    expect(read?.sleep.stages).toEqual([]);
  });

  test("a night with only vitals still counts, and spans its first to last reading", () => {
    const read = toNightRead(
      raw({ heartRate: [point("2026-11-15T00:10:00Z", 55), point("2026-11-15T06:40:00Z", 66)] }),
      WINDOW,
    );
    expect(read?.startedAt).toBe("2026-11-15T00:10:00+00:00");
    expect(read?.endedAt).toBe("2026-11-15T06:40:00+00:00");
  });

  test("keeps vitals inside the sleep session, so waking hours never count as sleep", () => {
    const read = toNightRead(
      raw({
        stages: [sample("2026-11-14T23:00:00Z", "2026-11-15T07:00:00Z", asleepCore)],
        heartRate: [
          point("2026-11-14T18:05:00Z", 150),
          point("2026-11-15T01:00:00Z", 55),
          point("2026-11-15T07:00:00Z", 60),
          point("2026-11-15T11:50:00Z", 95),
        ],
      }),
      WINDOW,
    );
    expect(read?.sleep.heartRate.map(([, bpm]) => bpm)).toEqual([55, 60]);
    expect(read?.startedAt).toBe("2026-11-14T23:00:00+00:00");
    expect(read?.endedAt).toBe("2026-11-15T07:00:00+00:00");
  });

  test("an evening nap stays out, and so do the vitals between it and the night", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-14T19:00:00Z", "2026-11-14T19:40:00Z", asleepCore),
          sample("2026-11-14T23:00:00Z", "2026-11-15T07:00:00Z", asleepCore),
        ],
        heartRate: [point("2026-11-14T19:20:00Z", 58), point("2026-11-14T21:00:00Z", 110)],
      }),
      WINDOW,
    );
    expect(read?.sleep.stages.map((s) => s.start)).toEqual(["2026-11-14T23:00:00+00:00"]);
    expect(read?.sleep.heartRate).toEqual([]);
  });

  test("a night without stages keeps only the vitals of its quiet window", () => {
    const read = toNightRead(
      raw({
        heartRate: [
          point("2026-11-14T19:00:00Z", 120),
          point("2026-11-15T02:00:00Z", 54),
          point("2026-11-15T09:00:00Z", 80),
        ],
      }),
      WINDOW,
      quietWindow("2026-11-14"),
    );
    expect(read?.sleep.heartRate.map(([, bpm]) => bpm)).toEqual([54]);
    expect(read?.startedAt).toBe("2026-11-15T02:00:00+00:00");
  });

  test("no Watch data at all is null, so the upload leaves sleep out", () => {
    expect(toNightRead(raw({}), WINDOW)).toBeNull();
    expect(toNightRead(raw({ heartRate: [point("2026-11-14T12:00:00Z", 60)] }), WINDOW)).toBeNull();
  });

  test("the result is a valid NightUpload.sleep", () => {
    const read = toNightRead(
      raw({
        stages: [
          sample("2026-11-14T23:00:00Z", "2026-11-15T07:00:00Z", inBed),
          sample("2026-11-14T23:20:00Z", "2026-11-15T06:50:00Z", asleepCore),
        ],
        heartRate: [point("2026-11-15T01:00:00Z", 57)],
        hrv: [point("2026-11-15T01:00:00Z", 40)],
        respiratoryRate: [point("2026-11-15T01:00:00Z", 13)],
      }),
      WINDOW,
    );
    expect(read).toBeDefined();
    const upload = nightUpload.parse({ ...nightUploadFixture, sleep: read?.sleep });
    expect(upload.sleep?.stages).toHaveLength(3);
    expect(read?.startedAt).toBe("2026-11-14T23:00:00+00:00");
    expect(read?.endedAt).toBe("2026-11-15T07:00:00+00:00");
  });
});

const untouchable: HealthPort = {
  isAvailable: () => {
    throw new Error("asked HealthKit before consent");
  },
  requestRead: () => Promise.reject(new Error("asked HealthKit before consent")),
  read: () => Promise.reject(new Error("read HealthKit before consent")),
};

describe("reader", () => {
  const CONSENTED = { health: true };
  const ONE_NIGHT = raw({
    stages: [sample("2026-11-14T23:30:00Z", "2026-11-15T06:30:00Z", asleepCore)],
    heartRate: [point("2026-11-15T01:00:00Z", 57)],
  });

  function fakePort(data: RawHealth, available = true) {
    const calls: string[] = [];
    const reads: (readonly SleepWindow[])[] = [];
    const port: HealthPort = {
      isAvailable: () => {
        calls.push("available");
        return available;
      },
      requestRead: async () => {
        calls.push("request");
      },
      read: async (windows) => {
        calls.push("read");
        reads.push(windows);
        return data;
      },
    };
    return { port, calls, reads };
  }

  test("never touches HealthKit without health consent", async () => {
    const reader = createWatchSleepReader(untouchable);
    expect(await reader.readNight("2026-11-14", { health: false })).toEqual({
      status: "no-consent",
    });
    expect(await reader.readPastNights(["2026-11-14"], { health: false })).toEqual({
      status: "no-consent",
    });
  });

  test("is unavailable on the web and where HealthKit is missing", async () => {
    const web = createWatchSleepReader(null);
    expect(await web.readNight("2026-11-14", CONSENTED)).toEqual({ status: "unavailable" });
    expect(await web.readNight("2026-11-14", { health: false })).toEqual({ status: "unavailable" });
    const { port, calls } = fakePort(ONE_NIGHT, false);
    expect(await createWatchSleepReader(port).readNight("2026-11-14", CONSENTED)).toEqual({
      status: "unavailable",
    });
    expect(calls).toEqual(["available"]);
  });

  test("asks iOS for read access, then reads the night's window", async () => {
    const { port, calls, reads } = fakePort(ONE_NIGHT);
    const result = await createWatchSleepReader(port).readNight("2026-11-14", CONSENTED);
    expect(calls).toEqual(["available", "request", "read"]);
    expect(reads).toEqual([[WINDOW]]);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.sleep.stages).toHaveLength(1);
  });

  test("reports no data and HealthKit errors without throwing", async () => {
    const { port } = fakePort(raw({}));
    expect(await createWatchSleepReader(port).readNight("2026-11-14", CONSENTED)).toEqual({
      status: "no-data",
    });
    const failing: HealthPort = { ...port, read: () => Promise.reject(new Error("denied")) };
    expect(await createWatchSleepReader(failing).readNight("2026-11-14", CONSENTED)).toEqual({
      status: "error",
      message: "denied",
    });
  });

  test("exports past nights for pooling from one read of their windows, newest first", async () => {
    const { port, reads } = fakePort(
      raw({
        stages: [
          sample("2026-11-12T23:00:00Z", "2026-11-13T06:00:00Z", asleepCore),
          sample("2026-11-14T23:30:00Z", "2026-11-15T06:30:00Z", asleepDeep),
        ],
      }),
    );
    const result = await createWatchSleepReader(port).readPastNights(
      ["2026-11-12", "2026-11-14", "2026-11-13"],
      CONSENTED,
    );
    expect(reads).toEqual([["2026-11-14", "2026-11-13", "2026-11-12"].map(nightWindow)]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.nights.map((n) => [n.night, n.sleep.stages[0]?.stage])).toEqual([
      ["2026-11-14", "deep"],
      ["2026-11-12", "core"],
    ]);
  });
});

describe("consent when a read starts", () => {
  const view = (health: boolean, answered = true): AccountView =>
    accountView.parse({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      consent: { microphone: true, health, location: false },
      consentUpdatedAt: answered ? "2026-11-14T20:00:00+00:00" : null,
      profile: null,
    });

  test("is on only once the user has answered yes", () => {
    expect(healthConsentOf(undefined)).toEqual({ health: false });
    expect(healthConsentOf(view(true, false))).toEqual({ health: false });
    expect(healthConsentOf(view(false))).toEqual({ health: false });
    expect(healthConsentOf(view(true))).toEqual({ health: true });
  });

  test("after delete everything resets the cache, a read finds no consent and skips HealthKit", async () => {
    const client = new QueryClient();
    const key = ["account", "me"];
    client.setQueryData(key, view(true));
    expect(healthConsentOf(client.getQueryData<AccountView>(key))).toEqual({ health: true });
    await client.resetQueries();
    const consent = healthConsentOf(client.getQueryData<AccountView>(key));
    expect(await createWatchSleepReader(untouchable).readNight("2026-11-14", consent)).toEqual({
      status: "no-consent",
    });
  });
});

describe("HealthKit query and freshness", () => {
  test("one window is one date range; several are one OR query", () => {
    expect(healthKitFilter([WINDOW])).toEqual({
      date: { startDate: WINDOW.start, endDate: WINDOW.end },
    });
    const earlier = nightWindow("2026-11-13");
    expect(healthKitFilter([WINDOW, earlier])).toEqual({
      OR: [
        { date: { startDate: WINDOW.start, endDate: WINDOW.end } },
        { date: { startDate: earlier.start, endDate: earlier.end } },
      ],
    });
  });

  test("only a night with data stays fresh, so a no-consent or no-data read is read again", () => {
    expect(watchNightStaleMs({ status: "ok" })).toBe(600_000);
    expect(watchNightStaleMs({ status: "no-consent" })).toBe(0);
    expect(watchNightStaleMs({ status: "no-data" })).toBe(0);
    expect(watchNightStaleMs(undefined)).toBe(0);
  });
});
