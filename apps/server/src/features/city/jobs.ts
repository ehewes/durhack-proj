import {
  bboxAround,
  createObservatoryClient,
  distanceKm,
  NEWCASTLE_CITY_CENTRE,
  OBSERVATORY_VARIABLES,
  type ObservatoryClient,
  type ObservatorySample,
} from "../../integrations/observatory";
import type { Job } from "../../jobs";
import {
  type CityRepo,
  createCityRepo,
  SENSOR_METRICS,
  type SensorMetric,
  type SensorReadingInsert,
  type SensorUpsert,
} from "./repo";
import { refreshSensorLnight } from "./service";

/** Circle around Grey's Monument. The bounding box is only the API query. */
export const CITY_RADIUS_KM = 3;

/**
 * The Sound series lagged the API clock by about an hour on 2026-11-14.
 * Three hours still covers that lag. NO2 and PM2.5 report every few minutes.
 */
export const LOOKBACK_HOURS = 3;

const LIVE_VARIABLES = [
  OBSERVATORY_VARIABLES.sound,
  OBSERVATORY_VARIABLES.no2,
  OBSERVATORY_VARIABLES.pm25,
] as const;

/** Sound is the noise series. Max Sound is a different catalogue variable and is not stored. */
const METRIC_BY_VARIABLE: Record<string, SensorMetric> = {
  [OBSERVATORY_VARIABLES.sound]: "noise_db",
  [OBSERVATORY_VARIABLES.no2]: "no2",
  [OBSERVATORY_VARIABLES.pm25]: "pm25",
};

export type ObservatoryPull = {
  readings: SensorReadingInsert[];
  sensors: SensorUpsert[];
};

function remember(
  sample: ObservatorySample,
  now: Date,
  readings: Map<string, SensorReadingInsert>,
  sensors: Map<string, SensorUpsert>,
): void {
  // The API square has corners outside the circle. The only live Sound sensor
  // on 2026-11-14 (PER_AIRMON_MESH1822245) sits 4.25 km out, so a poll can
  // store no noise_db rows.
  if (distanceKm(NEWCASTLE_CITY_CENTRE, sample.sensor) > CITY_RADIUS_KM) return;
  const metric = METRIC_BY_VARIABLE[sample.reading.variable];
  if (!metric || sample.reading.flagged || !Number.isFinite(sample.reading.value)) return;
  const sensorId = sample.sensor.id;
  if (!sensorId) return;

  const reading: SensorReadingInsert = {
    time: sample.reading.time,
    sensorId,
    metric,
    value: sample.reading.value,
  };
  readings.set(`${reading.time.toISOString()}\0${sensorId}\0${metric}`, reading);

  const existing = sensors.get(sensorId);
  if (existing) {
    if (!existing.metrics.includes(metric)) existing.metrics.push(metric);
    return;
  }
  sensors.set(sensorId, {
    sensorId,
    name: sample.sensor.name,
    longitude: sample.sensor.longitude,
    latitude: sample.sensor.latitude,
    broker: sample.sensor.broker,
    heightAboveGround: sample.sensor.heightAboveGround,
    metrics: [metric],
    updatedAt: now,
  });
}

/**
 * Fetches the newest Sound, NO2 and PM2.5 sample for each live sensor and
 * writes them. Flagged samples are dropped. Running it again asks for the
 * same primary keys; Tiger ignores those conflicts.
 */
export async function pullObservatoryReadings(deps: {
  client: ObservatoryClient;
  repo: CityRepo;
  now?: Date;
}): Promise<ObservatoryPull> {
  const now = deps.now ?? new Date();
  const samples = await deps.client.latestReadings({
    variables: LIVE_VARIABLES,
    bbox: bboxAround(NEWCASTLE_CITY_CENTRE, CITY_RADIUS_KM),
    lookbackHours: LOOKBACK_HOURS,
  });

  const readings = new Map<string, SensorReadingInsert>();
  const sensors = new Map<string, SensorUpsert>();
  for (const sample of samples) remember(sample, now, readings, sensors);

  const byMetric = (a: SensorMetric, b: SensorMetric) =>
    SENSOR_METRICS.indexOf(a) - SENSOR_METRICS.indexOf(b);
  const storedReadings = [...readings.values()].sort(
    (a, b) =>
      a.sensorId.localeCompare(b.sensorId) ||
      byMetric(a.metric, b.metric) ||
      a.time.getTime() - b.time.getTime(),
  );
  const storedSensors = [...sensors.values()].sort((a, b) => a.sensorId.localeCompare(b.sensorId));
  for (const sensor of storedSensors) sensor.metrics.sort(byMetric);

  await deps.repo.insertReadings(storedReadings);
  await deps.repo.upsertSensors(storedSensors);
  return { readings: storedReadings, sensors: storedSensors };
}

function metricCounts(readings: readonly SensorReadingInsert[]): string {
  const counts: Record<SensorMetric, number> = { noise_db: 0, no2: 0, pm25: 0 };
  for (const reading of readings) counts[reading.metric] += 1;
  return `noise_db ${counts.noise_db}, no2 ${counts.no2}, pm25 ${counts.pm25}`;
}

export const jobs: Job[] = [
  {
    name: "city.observatory",
    schedule: "*/5 * * * *",
    run: async () => {
      const pulled = await pullObservatoryReadings({
        client: createObservatoryClient(),
        repo: createCityRepo(),
      });
      console.log(
        `city.observatory stored ${pulled.readings.length} readings (${metricCounts(pulled.readings)}) across ${pulled.sensors.length} sensors`,
      );
    },
  },
  {
    name: "city.lnight",
    schedule: "*/5 * * * *",
    run: async () => {
      const updated = await refreshSensorLnight({ repo: createCityRepo() });
      console.log(`city.lnight updated ${updated} sensors`);
    },
  },
];
