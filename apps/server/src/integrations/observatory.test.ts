import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bboxAround,
  createObservatoryClient,
  distanceKm,
  londonWallTimeToUtc,
  NEWCASTLE_CITY_CENTRE,
  ObservatoryError,
  type ObservatoryRequest,
  parseReadingPage,
  parseSensorPage,
  parseUtcTimestamp,
  parseVariablePage,
} from "./observatory";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/observatory");

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const sensorsPage = load("sensors-page.json");
const readingsPage = load("readings-page.json");
const readingsPage2 = load("readings-page-2.json");
const readingsEmpty = load("readings-empty.json");
const variablesPage = load("variables.json");

describe("parseSensorPage", () => {
  test("reads a recorded location page", () => {
    const page = parseSensorPage(sensorsPage);
    expect(page.total).toBe(928);
    expect(page.limit).toBe(2);
    expect(page.sensors.map((sensor) => [sensor.id, sensor.name, sensor.broker])).toEqual([
      ["14", "PER_NEWCASTLE_ELDONGARDEN_MULTI_PERCY_STREET", "Newcastle Council RSS feed"],
      ["21", "PER_NEWCASTLE_ELDONSQUARE_MULTI_ELDON_SQUARE_MULTI", "Newcastle Council RSS feed"],
    ]);
    expect(page.sensors[0]).toMatchObject({
      latitude: 54.9760528,
      longitude: -1.6154009,
      heightAboveGround: 2,
    });
    expect(page.next).toContain("http://uoweb3.ncl.ac.uk/sensors/json");
  });
});

describe("parseReadingPage", () => {
  test("treats a timestamp with no offset as UTC", () => {
    const page = parseReadingPage(readingsPage);
    expect(page.readings).toHaveLength(5);
    expect(page.readings[0]).toMatchObject({
      sensorName: "PER_AIRMON_MESH1822245",
      variable: "Max Sound",
      value: 83.9,
      flagged: false,
    });
    expect(page.readings[0]?.time.toISOString()).toBe("2026-11-14T12:01:00.000Z");
    expect(page.sensors[0]).toMatchObject({
      id: "80410",
      latitude: 54.996419,
      longitude: -1.559245,
    });
    expect(page.start.toISOString()).toBe("2026-11-14T12:00:00.000Z");
    expect(page.total).toBe(8);
    expect(page.next).toContain("variables=Max+Sound");
    expect(page.next).not.toContain("variables=Sound");
  });

  test("parses an empty page whose bounds have fractional seconds and no offset", () => {
    const page = parseReadingPage(readingsEmpty);
    expect(page.readings).toEqual([]);
    expect(page.sensors).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.start.toISOString()).toBe("2026-11-13T14:55:49.765Z");
    expect(page.end.toISOString()).toBe("2026-11-14T14:55:49.765Z");
  });

  test("rejects a page that is not the API shape", () => {
    expect(() => parseReadingPage({ Readings: [] })).toThrow(ObservatoryError);
  });
});

describe("parseVariablePage", () => {
  test("keeps the catalogue unit strings", () => {
    const units = Object.fromEntries(
      parseVariablePage(variablesPage).map((item) => [item.name, item.units]),
    );
    expect(units.Sound).toBe("db");
    expect(units["Max Sound"]).toBe("db");
    expect(units.NO2).toBe("ugm -3");
    expect(units["PM2.5"]).toBe("ugm -3");
  });
});

describe("parseUtcTimestamp", () => {
  test("accepts a Z suffix and rejects a date with no time", () => {
    expect(parseUtcTimestamp("2026-11-14T12:00:00Z").toISOString()).toBe(
      "2026-11-14T12:00:00.000Z",
    );
    expect(() => parseUtcTimestamp("2026-11-14")).toThrow(ObservatoryError);
  });
});

describe("londonWallTimeToUtc", () => {
  test("converts the night window in GMT and BST", () => {
    expect(londonWallTimeToUtc("2026-11-14T23:00:00").toISOString()).toBe(
      "2026-11-14T23:00:00.000Z",
    );
    expect(londonWallTimeToUtc("2026-11-15T07:00").toISOString()).toBe("2026-11-15T07:00:00.000Z");
    expect(londonWallTimeToUtc("2026-07-01T23:00:00").toISOString()).toBe(
      "2026-07-01T22:00:00.000Z",
    );
    expect(londonWallTimeToUtc("2026-07-02T07:00:00").toISOString()).toBe(
      "2026-07-02T06:00:00.000Z",
    );
  });

  test("handles the March gap and the October overlap", () => {
    expect(() => londonWallTimeToUtc("2026-03-29T01:30:00")).toThrow(/does not exist/);
    expect(londonWallTimeToUtc("2026-03-29T02:30:00").toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    // 01:30 happens twice. The earlier instant is still BST, 00:30 UTC.
    expect(londonWallTimeToUtc("2026-10-25T01:30:00").toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  test("rejects an offset on a wall time", () => {
    expect(() => londonWallTimeToUtc("2026-11-14T23:00:00Z")).toThrow(ObservatoryError);
  });
});

describe("distanceKm", () => {
  test("places the only live noise sensor just outside 3 km", () => {
    const page = parseReadingPage(readingsPage);
    const sensor = page.sensors[0];
    expect(sensor).toBeDefined();
    if (!sensor) return;
    expect(distanceKm(NEWCASTLE_CITY_CENTRE, sensor)).toBeCloseTo(4.25, 2);
    const box = bboxAround(NEWCASTLE_CITY_CENTRE, 3);
    const inside =
      sensor.longitude >= box.minLongitude &&
      sensor.longitude <= box.maxLongitude &&
      sensor.latitude >= box.minLatitude &&
      sensor.latitude <= box.maxLatitude;
    expect(inside).toBe(false);
  });
});

function clientFor(handler: (request: ObservatoryRequest) => unknown) {
  const calls: ObservatoryRequest[] = [];
  const client = createObservatoryClient({
    minIntervalMs: 0,
    pageSize: 5,
    transport: async (request) => {
      calls.push(request);
      return handler(request);
    },
  });
  return { client, calls };
}

describe("createObservatoryClient", () => {
  test("pages history with offset and keeps every variable", async () => {
    const { client, calls } = clientFor((request) => {
      expect(request.path).toBe("/sensors/PER_AIRMON_MESH1822245/data/json");
      return request.query.get("offset") === "5" ? readingsPage2 : readingsPage;
    });
    const history = await client.history({
      sensorName: "PER_AIRMON_MESH1822245",
      start: "2026-11-14T12:00:00",
      end: "2026-11-14T12:05:00",
      variables: ["Sound", "Max Sound"],
    });
    expect(calls.map((call) => call.query.get("offset"))).toEqual(["0", "5"]);
    for (const call of calls) {
      expect(call.query.getAll("variables")).toEqual(["Sound", "Max Sound"]);
      expect(call.query.get("start")).toBe("2026-11-14T12:00:00.000Z");
      expect(call.query.get("end")).toBe("2026-11-14T12:05:00.000Z");
      expect(call.path.startsWith("http://uoweb3.ncl.ac.uk")).toBe(false);
    }
    expect(history.readings).toHaveLength(8);
    expect(history.readings[0]).toMatchObject({ variable: "Max Sound", value: 83.9 });
    expect(history.readings.at(-1)).toMatchObject({ variable: "Sound", value: 82.1 });
    expect(history.sensors.map((sensor) => sensor.id)).toEqual(["80410"]);
  });

  test("sends a summer night window as UTC", async () => {
    const { client, calls } = clientFor(() => readingsEmpty);
    const history = await client.history({
      start: "2026-07-01T23:00:00",
      end: "2026-07-02T07:00:00",
      variables: ["Sound"],
      bbox: bboxAround(NEWCASTLE_CITY_CENTRE, 3),
    });
    expect(history.readings).toEqual([]);
    expect(calls).toHaveLength(1);
    const query = calls[0]?.query;
    expect(query?.get("start")).toBe("2026-07-01T22:00:00.000Z");
    expect(query?.get("end")).toBe("2026-07-02T06:00:00.000Z");
    expect(query?.get("bbox_p1_y")).toBeTruthy();
  });

  test("keeps the newest sample of each variable", async () => {
    const { client } = clientFor((request) =>
      request.query.get("offset") === "5" ? readingsPage2 : readingsPage,
    );
    const latest = await client.latestReadings({
      sensorName: "PER_AIRMON_MESH1822245",
      variables: ["Sound", "Max Sound"],
      lookbackHours: 3,
    });
    expect(latest.map((sample) => [sample.reading.variable, sample.reading.value])).toEqual([
      ["Max Sound", 85.9],
      ["Sound", 82.1],
    ]);
    expect(latest[0]?.reading.time.toISOString()).toBe("2026-11-14T12:04:00.000Z");
    expect(latest[0]?.sensor.id).toBe("80410");
  });

  test("lists sensors from the recorded page and stops on an empty follow-up", async () => {
    const { client, calls } = clientFor((request) => {
      expect(request.path).toBe("/sensors/json");
      if (request.query.get("offset") === "0") return sensorsPage;
      const page = sensorsPage as { Pagination: { Total: number; Offset: number } };
      return { Sensors: [], Pagination: { ...page.Pagination, Offset: 2, Total: 2 } };
    });
    const sensors = await client.listSensors({ bbox: bboxAround(NEWCASTLE_CITY_CENTRE, 3) });
    expect(sensors.map((sensor) => sensor.id)).toEqual(["14", "21"]);
    expect(calls.map((call) => call.query.get("offset"))).toEqual(["0", "2"]);
  });

  test("reads units from the recorded catalogue", async () => {
    const { client, calls } = clientFor(() => variablesPage);
    const variables = await client.listVariables();
    expect(calls[0]?.path).toBe("/variables/json/");
    expect(variables.find((item) => item.name === "Sound")).toMatchObject({
      units: "db",
      theme: "Noise",
    });
  });

  test("surfaces HTTP failures and non-JSON bodies", async () => {
    const failing = createObservatoryClient({
      minIntervalMs: 0,
      fetch: async () => new Response("busy", { status: 503 }),
    });
    await expect(failing.listSensors()).rejects.toMatchObject({
      name: "ObservatoryError",
      status: 503,
    });

    const garbled = createObservatoryClient({
      minIntervalMs: 0,
      fetch: async () => new Response("nope", { status: 200 }),
    });
    await expect(garbled.listSensors()).rejects.toThrow(/not JSON/);
  });

  test("stops when a page is empty before the reported total", async () => {
    const { client } = clientFor(() => ({
      Readings: [],
      Sensors: {},
      Start: "2026-11-14T12:00:00Z",
      End: "2026-11-14T13:00:00Z",
      Pagination: { Total: 10, Limit: 5, Offset: 0, Next: null, Previous: null },
    }));
    await expect(
      client.history({
        start: "2026-11-14T12:00:00Z",
        end: "2026-11-14T13:00:00Z",
        timeZone: "UTC",
      }),
    ).rejects.toThrow(/empty page/);
  });
});
