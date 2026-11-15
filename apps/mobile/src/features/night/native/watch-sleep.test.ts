import { describe, expect, test } from "bun:test";
import { nightUpload } from "@kip/shared/night";
import nightUploadFixture from "../../../../../../packages/shared/src/night/fixtures/night-upload.json";
import {
  createWatchSleepReader,
  type HealthPort,
  type HealthSample,
  lastNight,
  londonIso,
  nightWindow,
  type RawHealth,
  recentNights,
  SLEEP_VALUE,
  stageOf,
  toNightRead,
} from "./watch-sleep";

const WATCH = "com.apple.health.5F1C0A2B";
const PHONE = "com.apple.health";
const APP = "com.example.sleepapp";

function sample(start: string, end: string, value: number, source = WATCH): HealthSample {
  return {
    start: new Date(start),
    end: new Date(end),
    value,
    sourceId: source,
    fromWatch: source === WATCH,
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

  test("last night is the night just ended, morning or evening", () => {
    expect(lastNight(new Date("2026-11-15T09:00:00Z"))).toBe("2026-11-14");
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
  test("maps every HealthKit sleep value, and unspecified sleep to core", () => {
    expect(stageOf(inBed)).toBe("inBed");
    expect(stageOf(awake)).toBe("awake");
    expect(stageOf(asleepCore)).toBe("core");
    expect(stageOf(asleepDeep)).toBe("deep");
    expect(stageOf(asleepREM)).toBe("rem");
    expect(stageOf(asleepUnspecified)).toBe("core");
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
          sample("2026-11-15T10:00:00Z", "2026-11-15T13:00:00Z", asleepREM),
          sample("2026-11-15T02:00:00Z", "2026-11-15T03:00:00Z", asleepCore),
          sample("2026-11-15T02:30:00Z", "2026-11-15T03:30:00Z", asleepDeep),
          sample("2026-11-15T03:30:00Z", "2026-11-15T04:00:00Z", asleepDeep),
        ],
      }),
      WINDOW,
    );
    expect(read?.sleep.stages).toEqual([
      { start: "2026-11-15T02:00:00+00:00", end: "2026-11-15T03:00:00+00:00", stage: "core" },
      { start: "2026-11-15T03:00:00+00:00", end: "2026-11-15T04:00:00+00:00", stage: "deep" },
      { start: "2026-11-15T10:00:00+00:00", end: "2026-11-15T12:00:00+00:00", stage: "rem" },
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

describe("reader", () => {
  const CONSENTED = { health: true };
  const ONE_NIGHT = raw({
    stages: [sample("2026-11-14T23:30:00Z", "2026-11-15T06:30:00Z", asleepCore)],
    heartRate: [point("2026-11-15T01:00:00Z", 57)],
  });

  function fakePort(data: RawHealth, available = true) {
    const calls: string[] = [];
    const windows: { start: Date; end: Date }[] = [];
    const port: HealthPort = {
      isAvailable: () => {
        calls.push("available");
        return available;
      },
      requestRead: async () => {
        calls.push("request");
      },
      read: async (window) => {
        calls.push("read");
        windows.push(window);
        return data;
      },
    };
    return { port, calls, windows };
  }

  const untouchable: HealthPort = {
    isAvailable: () => {
      throw new Error("asked HealthKit before consent");
    },
    requestRead: () => Promise.reject(new Error("asked HealthKit before consent")),
    read: () => Promise.reject(new Error("read HealthKit before consent")),
  };

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
    const { port, calls, windows } = fakePort(ONE_NIGHT);
    const result = await createWatchSleepReader(port).readNight("2026-11-14", CONSENTED);
    expect(calls).toEqual(["available", "request", "read"]);
    expect(windows).toEqual([WINDOW]);
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

  test("exports past nights for pooling from one read, newest first, skipping empty nights", async () => {
    const { port, windows } = fakePort(
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
    expect(windows).toEqual([{ start: nightWindow("2026-11-12").start, end: WINDOW.end }]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.nights.map((n) => [n.night, n.sleep.stages[0]?.stage])).toEqual([
      ["2026-11-14", "deep"],
      ["2026-11-12", "core"],
    ]);
  });
});
