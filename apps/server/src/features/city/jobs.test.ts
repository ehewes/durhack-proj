import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bboxAround,
  createObservatoryClient,
  distanceKm,
  NEWCASTLE_CITY_CENTRE,
  type ObservatoryRequest,
} from "../../integrations/observatory";
import { CITY_RADIUS_KM, jobs, LOOKBACK_HOURS, pullObservatoryReadings } from "./jobs";
import type { CityRepo, SensorReadingInsert, SensorUpsert } from "./repo";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../integrations/fixtures/observatory",
);

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const readingsPage = load("readings-page.json");
const readingsPage2 = load("readings-page-2.json");
const readingsEmpty = load("readings-empty.json");

type RawSensor = {
  Sensor_Name: string;
  Location_WKT: string;
  Sensor_Centroid_Longitude: number;
  Ground_Height_Above_Sea_Level: number;
  Sensor_Centroid_Latitude: number;
  Sensor_Height_Above_Ground: number | null;
  Broker_Name: string;
  Raw_ID: string;
};

type RawReading = {
  Sensor_Name: string;
  Variable: string;
  Value: number;
  Timestamp: string;
  Flagged: boolean;
};

function recordedNoiseSensor(): RawSensor {
  const page = readingsPage as { Sensors: Record<string, RawSensor> };
  const sensor = page.Sensors.PER_AIRMON_MESH1822245;
  if (!sensor) throw new Error("fixture is missing PER_AIRMON_MESH1822245");
  return sensor;
}

function sensorFromFixture(
  overrides: Partial<RawSensor> & Pick<RawSensor, "Sensor_Name" | "Raw_ID">,
): RawSensor {
  const sensor = { ...structuredClone(recordedNoiseSensor()), ...overrides };
  sensor.Location_WKT = `POINT(${sensor.Sensor_Centroid_Longitude} ${sensor.Sensor_Centroid_Latitude})`;
  return sensor;
}

function page(readings: RawReading[], sensors: RawSensor[]): unknown {
  return {
    Readings: readings,
    Sensors: Object.fromEntries(sensors.map((sensor) => [sensor.Sensor_Name, sensor])),
    Start: "2026-11-14T11:00:00Z",
    End: "2026-11-14T15:00:00Z",
    Pagination: {
      Total: readings.length,
      Limit: Math.max(readings.length, 1),
      Offset: 0,
      Next: null,
      Previous: null,
    },
  };
}

function clientFor(handler: (request: ObservatoryRequest) => unknown) {
  const calls: ObservatoryRequest[] = [];
  const client = createObservatoryClient({
    minIntervalMs: 0,
    transport: async (request) => {
      calls.push(request);
      return handler(request);
    },
  });
  return { client, calls };
}

function mockRepo() {
  const readings: SensorReadingInsert[][] = [];
  const sensors: SensorUpsert[][] = [];
  const repo: CityRepo = {
    insertReadings: async (rows) => {
      readings.push(rows);
    },
    upsertSensors: async (points) => {
      sensors.push(points);
    },
    lnight30: async () => [],
    writeSensorLevels: async () => {},
    listSensors: async () => [],
  };
  return { repo, readings, sensors };
}

const now = new Date("2026-11-14T15:00:00.000Z");

function expectLiveQuery(calls: ObservatoryRequest[]) {
  const first = calls[0];
  expect(first?.path).toBe("/sensors/data/json");
  expect(first?.query.get("last_n_hours")).toBe(String(LOOKBACK_HOURS));
  expect(first?.query.getAll("variables")).toEqual(["Sound", "NO2", "PM2.5"]);
  const box = bboxAround(NEWCASTLE_CITY_CENTRE, CITY_RADIUS_KM);
  expect(first?.query.get("bbox_p1_x")).toBe(String(box.minLongitude));
  expect(first?.query.get("bbox_p1_y")).toBe(String(box.minLatitude));
  expect(first?.query.get("bbox_p2_x")).toBe(String(box.maxLongitude));
  expect(first?.query.get("bbox_p2_y")).toBe(String(box.maxLatitude));
}

describe("city.observatory", () => {
  test("runs every five minutes", () => {
    expect(jobs.map((job) => [job.name, job.schedule])).toEqual([
      ["city.observatory", "*/5 * * * *"],
      ["city.lnight", "*/5 * * * *"],
    ]);
  });

  test("drops the recorded noise sensor, which sits outside 3 km", async () => {
    const noise = recordedNoiseSensor();
    expect(
      distanceKm(NEWCASTLE_CITY_CENTRE, {
        latitude: noise.Sensor_Centroid_Latitude,
        longitude: noise.Sensor_Centroid_Longitude,
      }),
    ).toBeGreaterThan(CITY_RADIUS_KM);

    const { client, calls } = clientFor((request) =>
      request.query.get("offset") === "5" ? readingsPage2 : readingsPage,
    );
    const { repo, readings, sensors } = mockRepo();
    const pulled = await pullObservatoryReadings({ client, repo, now });

    expectLiveQuery(calls);
    expect(calls.map((call) => call.query.get("offset"))).toEqual(["0", "5"]);
    expect(pulled).toEqual({ readings: [], sensors: [] });
    expect(readings).toEqual([[]]);
    expect(sensors).toEqual([[]]);
  });

  test("stores in-circle NO2, PM2.5 and Sound from a fixture-shaped page", async () => {
    const outside = recordedNoiseSensor();
    const mesh = sensorFromFixture({
      Sensor_Name: "PER_AIRMON_MESH1921150",
      Raw_ID: "79164",
      Sensor_Centroid_Latitude: 54.972662,
      Sensor_Centroid_Longitude: -1.614127,
    });
    const flaggedOnly = sensorFromFixture({
      Sensor_Name: "PER_TTN_AIRQUALITY004",
      Raw_ID: "80137",
      Sensor_Centroid_Latitude: 54.979118,
      Sensor_Centroid_Longitude: -1.617676,
      Sensor_Height_Above_Ground: null,
    });
    expect(
      distanceKm(NEWCASTLE_CITY_CENTRE, {
        latitude: mesh.Sensor_Centroid_Latitude,
        longitude: mesh.Sensor_Centroid_Longitude,
      }),
    ).toBeLessThanOrEqual(CITY_RADIUS_KM);

    const { client, calls } = clientFor(() =>
      page(
        [
          {
            Sensor_Name: outside.Sensor_Name,
            Variable: "Sound",
            Value: 82.1,
            Timestamp: "2026-11-14T12:04:00",
            Flagged: false,
          },
          {
            Sensor_Name: mesh.Sensor_Name,
            Variable: "Sound",
            Value: 55.2,
            Timestamp: "2026-11-14T14:28:00",
            Flagged: false,
          },
          {
            Sensor_Name: mesh.Sensor_Name,
            Variable: "Max Sound",
            Value: 89,
            Timestamp: "2026-11-14T14:29:00",
            Flagged: false,
          },
          {
            Sensor_Name: mesh.Sensor_Name,
            Variable: "NO2",
            Value: 40,
            Timestamp: "2026-11-14T14:00:00",
            Flagged: false,
          },
          {
            Sensor_Name: mesh.Sensor_Name,
            Variable: "NO2",
            Value: 45.51,
            Timestamp: "2026-11-14T14:29:00",
            Flagged: false,
          },
          {
            Sensor_Name: mesh.Sensor_Name,
            Variable: "PM2.5",
            Value: 5.01,
            Timestamp: "2026-11-14T14:29:00",
            Flagged: false,
          },
          {
            Sensor_Name: flaggedOnly.Sensor_Name,
            Variable: "NO2",
            Value: 10,
            Timestamp: "2026-11-14T14:00:00",
            Flagged: false,
          },
          {
            Sensor_Name: flaggedOnly.Sensor_Name,
            Variable: "NO2",
            Value: 65,
            Timestamp: "2026-11-14T14:45:00",
            Flagged: true,
          },
        ],
        [outside, mesh, flaggedOnly],
      ),
    );
    const { repo, readings, sensors } = mockRepo();
    const pulled = await pullObservatoryReadings({ client, repo, now });
    await pullObservatoryReadings({ client, repo, now });

    expectLiveQuery(calls);
    const expectedReadings: SensorReadingInsert[] = [
      {
        time: new Date("2026-11-14T14:28:00.000Z"),
        sensorId: "79164",
        metric: "noise_db",
        value: 55.2,
      },
      {
        time: new Date("2026-11-14T14:29:00.000Z"),
        sensorId: "79164",
        metric: "no2",
        value: 45.51,
      },
      {
        time: new Date("2026-11-14T14:29:00.000Z"),
        sensorId: "79164",
        metric: "pm25",
        value: 5.01,
      },
    ];
    const expectedSensors: SensorUpsert[] = [
      {
        sensorId: "79164",
        name: "PER_AIRMON_MESH1921150",
        longitude: -1.614127,
        latitude: 54.972662,
        broker: "aq_mesh_api",
        heightAboveGround: 2,
        metrics: ["noise_db", "no2", "pm25"],
        updatedAt: now,
      },
    ];
    expect(pulled).toEqual({ readings: expectedReadings, sensors: expectedSensors });
    expect(readings).toEqual([expectedReadings, expectedReadings]);
    expect(sensors).toEqual([expectedSensors, expectedSensors]);
  });

  test("writes nothing for an empty recorded page", async () => {
    const { client } = clientFor(() => readingsEmpty);
    const { repo, readings, sensors } = mockRepo();
    const pulled = await pullObservatoryReadings({ client, repo, now });
    expect(pulled).toEqual({ readings: [], sensors: [] });
    expect(readings).toEqual([[]]);
    expect(sensors).toEqual([[]]);
  });

  test("does not write when Observatory fails", async () => {
    const { client } = clientFor(() => {
      throw new Error("observatory down");
    });
    const { repo, readings, sensors } = mockRepo();
    await expect(pullObservatoryReadings({ client, repo, now })).rejects.toThrow(
      "observatory down",
    );
    expect(readings).toEqual([]);
    expect(sensors).toEqual([]);
  });
});
