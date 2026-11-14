import { z } from "zod";

/** Public Urban Observatory API v2. No key. */
export const OBSERVATORY_BASE_URL = "https://api.v2.urbanobservatory.ac.uk";

/**
 * Grey's Monument, 54°58′26″N 1°36′47″W, used as Newcastle city centre.
 * Distances in docs/data/observatory.md are haversine kilometres from here.
 */
export const NEWCASTLE_CITY_CENTRE = { latitude: 54.973889, longitude: -1.613056 };

/** Variable names as the catalogue spells them. Units come from `listVariables`. */
export const OBSERVATORY_VARIABLES = {
  sound: "Sound",
  maxSound: "Max Sound",
  no2: "NO2",
  pm25: "PM2.5",
} as const;

const LONDON = "Europe/London";

export class ObservatoryError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ObservatoryError";
    this.status = status;
  }
}

export type LatLon = { latitude: number; longitude: number };

export type BBox = {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
};

export type ObservatorySensor = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  broker: string;
  /** Metres. Null when the catalogue omits it. */
  heightAboveGround: number | null;
};

export type ObservatoryReading = {
  sensorName: string;
  variable: string;
  value: number;
  /** UTC instant. The API writes UTC and usually omits the offset. */
  time: Date;
  flagged: boolean;
};

export type ObservatorySample = {
  sensor: ObservatorySensor;
  reading: ObservatoryReading;
};

export type ObservatoryHistory = {
  start: Date;
  end: Date;
  readings: ObservatoryReading[];
  sensors: ObservatorySensor[];
};

export type ObservatoryVariable = {
  name: string;
  /** Catalogue spelling, for example `db` or `ugm -3`. */
  units: string | null;
  theme: string | null;
};

export type ObservatoryRequest = {
  path: string;
  query: URLSearchParams;
};

export type ObservatoryTransport = (request: ObservatoryRequest) => Promise<unknown>;

type Page<T> = { items: T[]; total: number; limit: number };

const sensorSchema = z.object({
  Sensor_Name: z.string(),
  Sensor_Centroid_Latitude: z.number(),
  Sensor_Centroid_Longitude: z.number(),
  Broker_Name: z.string(),
  Raw_ID: z.string(),
  Sensor_Height_Above_Ground: z.number().nullable().optional(),
});

const paginationSchema = z.object({
  Total: z.number(),
  Limit: z.number(),
  Offset: z.number(),
  Next: z.string().nullable().optional(),
  Previous: z.string().nullable().optional(),
});

const sensorPageSchema = z.object({
  Sensors: z.array(sensorSchema),
  Pagination: paginationSchema,
});

const readingSchema = z.object({
  Sensor_Name: z.string(),
  Variable: z.string(),
  Value: z.number(),
  Timestamp: z.string(),
  Flagged: z.boolean(),
});

const readingPageSchema = z.object({
  Readings: z.array(readingSchema),
  Sensors: z.record(z.string(), sensorSchema),
  Start: z.string(),
  End: z.string(),
  Pagination: paginationSchema,
});

const variableSchema = z.object({
  Name: z.string(),
  Units: z.string().nullable().optional(),
  Theme: z.string().nullable().optional(),
});

const variablePageSchema = z.object({
  Variables: z.array(variableSchema),
});

function invalid(label: string, error: z.ZodError): ObservatoryError {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";
  const message = issue?.message ?? "invalid";
  return new ObservatoryError(`${label}${path ? ` (${path})` : ""}: ${message}`);
}

function toSensor(raw: z.infer<typeof sensorSchema>): ObservatorySensor {
  return {
    id: raw.Raw_ID,
    name: raw.Sensor_Name,
    latitude: raw.Sensor_Centroid_Latitude,
    longitude: raw.Sensor_Centroid_Longitude,
    broker: raw.Broker_Name,
    heightAboveGround: raw.Sensor_Height_Above_Ground ?? null,
  };
}

/** Square around `centre` that contains the circle of `radiusKm`. Corners lie outside the circle. */
export function bboxAround(centre: LatLon, radiusKm: number): BBox {
  if (!(radiusKm > 0)) throw new ObservatoryError("radius must be positive");
  const latRad = (centre.latitude * Math.PI) / 180;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos(latRad));
  return {
    minLongitude: centre.longitude - dLon,
    minLatitude: centre.latitude - dLat,
    maxLongitude: centre.longitude + dLon,
    maxLatitude: centre.latitude + dLat,
  };
}

/** Haversine distance in kilometres. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const earthKm = 6371.0088;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

const wallPartsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function londonWall(instant: Date): string {
  const parts = Object.fromEntries(
    wallPartsFormat.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  let hour = parts.hour ?? "00";
  if (hour === "24") hour = "00";
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/**
 * Europe/London wall time (`YYYY-MM-DDTHH:mm` or with seconds, no offset) as a UTC instant.
 * The UK is GMT or BST. On the October overlap the earlier instant (still BST) is used.
 * A time in the March gap throws.
 */
export function londonWallTimeToUtc(wall: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall);
  if (!match) {
    throw new ObservatoryError(
      "Europe/London wall time must look like YYYY-MM-DDTHH:mm:ss and must not include an offset",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${String(second).padStart(2, "0")}`;
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Offset of the zone east of UTC, in minutes. GMT is 0, BST is 60.
  const candidates = [0, 60]
    .map((offsetMinutes) => new Date(wallAsUtc - offsetMinutes * 60_000))
    .filter((instant) => londonWall(instant) === normalized)
    .sort((a, b) => a.getTime() - b.getTime());
  const earlier = candidates[0];
  if (!earlier) throw new ObservatoryError(`${wall} does not exist in Europe/London`);
  return earlier;
}

/** Reading timestamps are UTC. A missing offset is UTC, not local time. */
export function parseUtcTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(trimmed)) {
    throw new ObservatoryError(`timestamp is not a UTC date-time: ${trimmed}`);
  }
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const time = new Date(withZone);
  if (Number.isNaN(time.getTime())) throw new ObservatoryError(`timestamp is invalid: ${trimmed}`);
  return time;
}

export type SensorPage = {
  sensors: ObservatorySensor[];
  total: number;
  limit: number;
  offset: number;
  /** Present on live responses. It points at an internal host; do not follow it. */
  next: string | null;
};

export function parseSensorPage(payload: unknown): SensorPage {
  const parsed = sensorPageSchema.safeParse(payload);
  if (!parsed.success) throw invalid("sensor page", parsed.error);
  return {
    sensors: parsed.data.Sensors.map(toSensor),
    total: parsed.data.Pagination.Total,
    limit: parsed.data.Pagination.Limit,
    offset: parsed.data.Pagination.Offset,
    next: parsed.data.Pagination.Next ?? null,
  };
}

export type ReadingPage = {
  readings: ObservatoryReading[];
  sensors: ObservatorySensor[];
  start: Date;
  end: Date;
  total: number;
  limit: number;
  offset: number;
  next: string | null;
};

export function parseReadingPage(payload: unknown): ReadingPage {
  const parsed = readingPageSchema.safeParse(payload);
  if (!parsed.success) throw invalid("reading page", parsed.error);
  return {
    readings: parsed.data.Readings.map((raw) => ({
      sensorName: raw.Sensor_Name,
      variable: raw.Variable,
      value: raw.Value,
      time: parseUtcTimestamp(raw.Timestamp),
      flagged: raw.Flagged,
    })),
    sensors: Object.values(parsed.data.Sensors).map(toSensor),
    start: parseUtcTimestamp(parsed.data.Start),
    end: parseUtcTimestamp(parsed.data.End),
    total: parsed.data.Pagination.Total,
    limit: parsed.data.Pagination.Limit,
    offset: parsed.data.Pagination.Offset,
    next: parsed.data.Pagination.Next ?? null,
  };
}

export function parseVariablePage(payload: unknown): ObservatoryVariable[] {
  const parsed = variablePageSchema.safeParse(payload);
  if (!parsed.success) throw invalid("variable page", parsed.error);
  return parsed.data.Variables.map((raw) => ({
    name: raw.Name,
    units: raw.Units ?? null,
    theme: raw.Theme ?? null,
  }));
}

function appendBBox(query: URLSearchParams, bbox: BBox | undefined): void {
  if (!bbox) return;
  query.append("bbox_p1_x", String(bbox.minLongitude));
  query.append("bbox_p1_y", String(bbox.minLatitude));
  query.append("bbox_p2_x", String(bbox.maxLongitude));
  query.append("bbox_p2_y", String(bbox.maxLatitude));
}

function appendVariables(query: URLSearchParams, variables: readonly string[] | undefined): void {
  if (!variables) return;
  for (const variable of variables) {
    if (!variable) throw new ObservatoryError("variable name is empty");
    query.append("variables", variable);
  }
}

function resolveInstant(value: Date | string, timeZone: "Europe/London" | "UTC"): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new ObservatoryError("invalid date");
    return value;
  }
  if (timeZone === "UTC") return parseUtcTimestamp(value);
  return londonWallTimeToUtc(value);
}

export type HistoryQuery = {
  /** Date is a UTC instant. A string is a wall time in `timeZone` (default Europe/London). */
  start: Date | string;
  end: Date | string;
  timeZone?: "Europe/London" | "UTC";
  variables?: readonly string[];
  bbox?: BBox;
  sensorName?: string;
};

export type LatestQuery = {
  variables: readonly string[];
  bbox?: BBox;
  sensorName?: string;
  /** How far back to look for the newest sample. Default 3 hours. */
  lookbackHours?: number;
};

export type ObservatoryClient = {
  listSensors(query?: { bbox?: BBox }): Promise<ObservatorySensor[]>;
  /** Newest sample of each sensor and variable inside the lookback window. */
  latestReadings(query: LatestQuery): Promise<ObservatorySample[]>;
  history(query: HistoryQuery): Promise<ObservatoryHistory>;
  listVariables(): Promise<ObservatoryVariable[]>;
};

type FetchLike = (input: URL, init?: RequestInit) => Promise<Response>;

export type ObservatoryClientOptions = {
  baseUrl?: string;
  transport?: ObservatoryTransport;
  /** Defaults to the global fetch. A stand-in only needs to accept a URL. */
  fetch?: FetchLike;
  /** Readings or sensors per page. Default 1000, the API default. */
  pageSize?: number;
  /**
   * Minimum gap between request starts. Default 1000 ms, so a fast response
   * stays at or under the survey pace of about one request a second. Tests pass 0.
   */
  minIntervalMs?: number;
  /** Safety stop so a stuck `Total` cannot loop. Default 250 pages. */
  maxPages?: number;
};

/**
 * Client for sensor locations, the latest reading of each series, and history.
 *
 * Pagination uses `limit` and `offset` on the public host. `Pagination.Next` points at
 * `http://uoweb3.ncl.ac.uk` and drops every variable except the last, so it is ignored.
 * History bounds are sent as UTC. Strings are Europe/London wall times unless `timeZone` is `UTC`.
 */
export function createObservatoryClient(options: ObservatoryClientOptions = {}): ObservatoryClient {
  const baseUrl = options.baseUrl ?? OBSERVATORY_BASE_URL;
  const pageSize = options.pageSize ?? 1000;
  const minIntervalMs = options.minIntervalMs ?? 1000;
  const maxPages = options.maxPages ?? 250;
  if (!(pageSize > 0)) throw new ObservatoryError("pageSize must be positive");
  const fetchImpl = options.fetch ?? fetch;
  const transport =
    options.transport ??
    (async (request: ObservatoryRequest) => {
      const url = new URL(request.path, baseUrl);
      url.search = request.query.toString();
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { accept: "application/json", "user-agent": "kip/observatory" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Observatory request failed";
        throw new ObservatoryError(message);
      }
      if (!response.ok) {
        throw new ObservatoryError(
          `Observatory request failed (${response.status})`,
          response.status,
        );
      }
      try {
        return await response.json();
      } catch {
        throw new ObservatoryError("Observatory response was not JSON");
      }
    });

  let lastStart = 0;
  async function send(path: string, query: URLSearchParams): Promise<unknown> {
    const now = Date.now();
    const wait = lastStart === 0 ? 0 : minIntervalMs - (now - lastStart);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStart = Date.now();
    return transport({ path, query });
  }

  async function eachPage<T>(load: (offset: number) => Promise<Page<T>>): Promise<T[]> {
    const items: T[] = [];
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const result = await load(offset);
      if (!(result.limit > 0))
        throw new ObservatoryError("Observatory page limit was not positive");
      items.push(...result.items);
      const next = offset + result.limit;
      if (result.items.length === 0) {
        if (offset < result.total) {
          throw new ObservatoryError("Observatory returned an empty page before the last result");
        }
        return items;
      }
      if (next >= result.total) return items;
      offset = next;
    }
    throw new ObservatoryError(`Observatory pagination stopped after ${maxPages} pages`);
  }

  function sensorPath(sensorName: string | undefined, bbox: BBox | undefined): string {
    if (sensorName && bbox) {
      throw new ObservatoryError("pass a sensorName or a bbox, not both");
    }
    if (!sensorName) return "/sensors/data/json";
    if (!sensorName.trim()) throw new ObservatoryError("sensorName is empty");
    return `/sensors/${encodeURIComponent(sensorName)}/data/json`;
  }

  async function readAll(
    path: string,
    base: URLSearchParams,
  ): Promise<{
    readings: ObservatoryReading[];
    sensors: ObservatorySensor[];
    start: Date;
    end: Date;
  }> {
    const sensors = new Map<string, ObservatorySensor>();
    let start: Date | undefined;
    let end: Date | undefined;
    const readings = await eachPage(async (offset) => {
      const query = new URLSearchParams(base);
      query.set("limit", String(pageSize));
      query.set("offset", String(offset));
      const page = parseReadingPage(await send(path, query));
      start ??= page.start;
      end ??= page.end;
      for (const sensor of page.sensors) sensors.set(sensor.name, sensor);
      return { items: page.readings, total: page.total, limit: page.limit };
    });
    if (!start || !end) throw new ObservatoryError("Observatory history had no time range");
    return { readings, sensors: [...sensors.values()], start, end };
  }

  return {
    async listSensors(query) {
      const sensors = await eachPage(async (offset) => {
        const params = new URLSearchParams();
        appendBBox(params, query?.bbox);
        params.set("limit", String(pageSize));
        params.set("offset", String(offset));
        const page = parseSensorPage(await send("/sensors/json", params));
        return { items: page.sensors, total: page.total, limit: page.limit };
      });
      return sensors.sort((a, b) => a.name.localeCompare(b.name));
    },

    async latestReadings(query) {
      if (query.variables.length === 0)
        throw new ObservatoryError("latestReadings needs a variable");
      const lookback = query.lookbackHours ?? 3;
      if (!(lookback > 0)) throw new ObservatoryError("lookbackHours must be positive");
      const params = new URLSearchParams();
      params.set("last_n_hours", String(lookback));
      appendVariables(params, query.variables);
      appendBBox(params, query.bbox);
      const { readings, sensors } = await readAll(sensorPath(query.sensorName, query.bbox), params);
      const bySensor = new Map(sensors.map((sensor) => [sensor.name, sensor]));
      const newest = new Map<string, ObservatoryReading>();
      for (const reading of readings) {
        const key = `${reading.sensorName}\0${reading.variable}`;
        const previous = newest.get(key);
        if (!previous || reading.time.getTime() >= previous.time.getTime())
          newest.set(key, reading);
      }
      const samples: ObservatorySample[] = [];
      for (const reading of newest.values()) {
        const sensor = bySensor.get(reading.sensorName);
        if (!sensor) throw new ObservatoryError(`no location for sensor ${reading.sensorName}`);
        samples.push({ sensor, reading });
      }
      return samples.sort(
        (a, b) =>
          a.sensor.name.localeCompare(b.sensor.name) ||
          a.reading.variable.localeCompare(b.reading.variable),
      );
    },

    async history(query) {
      const zone = query.timeZone ?? LONDON;
      const start = resolveInstant(query.start, zone);
      const end = resolveInstant(query.end, zone);
      if (!(end.getTime() > start.getTime())) {
        throw new ObservatoryError("history end must be after start");
      }
      const params = new URLSearchParams();
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
      appendVariables(params, query.variables);
      appendBBox(params, query.bbox);
      const collected = await readAll(sensorPath(query.sensorName, query.bbox), params);
      collected.readings.sort(
        (a, b) =>
          a.time.getTime() - b.time.getTime() ||
          a.sensorName.localeCompare(b.sensorName) ||
          a.variable.localeCompare(b.variable),
      );
      collected.sensors.sort((a, b) => a.name.localeCompare(b.name));
      return collected;
    },

    async listVariables() {
      const page = parseVariablePage(await send("/variables/json/", new URLSearchParams()));
      return page.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
