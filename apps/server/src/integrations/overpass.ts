/**
 * One Overpass client for Newcastle hotels, nightlife, sights and Central Station.
 * A single request, a timeout, and a User-Agent that names the app and not a person.
 * The public instance asks callers not to retry, so a failure is returned as-is.
 */

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Identifies Kip. No name, email or other personal data. */
export const OVERPASS_USER_AGENT = "Kip/0.1 (DurHack Newcastle stay demo)";

/** Seconds, both in the Overpass QL header and as the HTTP abort deadline. */
export const OVERPASS_TIMEOUT_SECONDS = 25;

/**
 * Degrees of slack around the box. A way that crosses the edge has its centre
 * just outside; a relation such as Hadrian's Wall does not.
 */
export const OVERPASS_BBOX_MARGIN = 0.01;

/** tourism=* values the stays pipeline treats as somewhere to sleep. */
export const HOTEL_TOURISM = ["hotel", "guest_house", "hostel", "apartment"] as const;

/** amenity=* values treated as nightlife. */
export const NIGHTLIFE_AMENITY = ["bar", "pub", "nightclub"] as const;

/** tourism=* values treated as sights. */
export const SIGHT_TOURISM = ["attraction", "museum"] as const;

export type OsmKind = "hotel" | "nightlife" | "sight" | "station";

export type BBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/**
 * Newcastle city centre through Jesmond: Central Station, the Quayside and the
 * nightlife north of the monument. About 5 km on a side, so one query stays small.
 */
export const NEWCASTLE_BBOX: BBox = {
  south: 54.958,
  west: -1.652,
  north: 55.002,
  east: -1.568,
};

/** Unique OSM id (`node/123`, `way/123`, `relation/123`), name, tags and WGS84 coordinates. */
export type OsmPlace = {
  id: string;
  name: string;
  kind: OsmKind;
  tags: Record<string, string>;
  latitude: number;
  longitude: number;
};

export class OverpassError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OverpassError";
    this.status = status;
  }
}

export type QueryNewcastlePlacesOptions = {
  /** Injected in tests. A function, so fakes need not carry Bun's fetch extras. */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  endpoint?: string;
  bbox?: BBox;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const OSM_TYPES = new Set(["node", "way", "relation"]);
const HOTELS = new Set<string>(HOTEL_TOURISM);
const NIGHTLIFE = new Set<string>(NIGHTLIFE_AMENITY);
const SIGHTS = new Set<string>(SIGHT_TOURISM);

/** "Newcastle", "Newcastle Central", "Newcastle Station", "Newcastle Central Station". */
const CENTRAL_STATION_NAME = /^newcastle( central)?( station)?$/i;

/** One Overpass QL script. The bounding box is set once, on the header. */
export function newcastlePlacesQuery(bbox: BBox = NEWCASTLE_BBOX): string {
  assertBBox(bbox);
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return [
    `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}][bbox:${box}];`,
    "(",
    `  nwr["tourism"~"^(${HOTEL_TOURISM.join("|")})$"];`,
    `  nwr["amenity"~"^(${NIGHTLIFE_AMENITY.join("|")})$"];`,
    `  nwr["tourism"~"^(${SIGHT_TOURISM.join("|")})$"];`,
    `  nwr["railway"="station"]["ref:crs"="NCL"];`,
    `  nwr["railway"="station"]["name"~"Newcastle",i];`,
    ");",
    "out center;",
  ].join("\n");
}

/**
 * Normalises an Overpass JSON document. Elements that are not one of the four
 * kinds, that have no coordinates, or whose centre sits outside the box, are
 * dropped. The same OSM id is kept once.
 */
export function parseOverpassPlaces(body: unknown, bbox: BBox = NEWCASTLE_BBOX): OsmPlace[] {
  if (!body || typeof body !== "object") {
    throw new OverpassError("Overpass response was not an object");
  }
  const record = body as { elements?: unknown; remark?: unknown };
  if (!Array.isArray(record.elements)) {
    const remark = typeof record.remark === "string" ? record.remark : "missing elements";
    throw new OverpassError(`Overpass response could not be parsed: ${remark}`);
  }

  const places: OsmPlace[] = [];
  const seen = new Set<string>();
  for (const element of record.elements) {
    const place = parseElement(element);
    if (!place || seen.has(place.id) || !insideBox(place, bbox)) continue;
    seen.add(place.id);
    places.push(place);
  }
  return places;
}

/** Posts the Newcastle query once and returns normalised places. */
export async function queryNewcastlePlaces(
  options: QueryNewcastlePlacesOptions = {},
): Promise<OsmPlace[]> {
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? OVERPASS_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? OVERPASS_TIMEOUT_SECONDS * 1000;
  const bbox = options.bbox ?? NEWCASTLE_BBOX;
  const query = newcastlePlacesQuery(bbox);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = combineSignals(timeout, options.signal);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      body: new URLSearchParams({ data: query }),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new OverpassError("Overpass query was cancelled");
    if (timeout.aborted || isAbortError(error)) {
      throw new OverpassError(`Overpass query timed out after ${timeoutMs}ms`);
    }
    const message = error instanceof Error ? error.message : "Overpass request failed";
    throw new OverpassError(message);
  }

  if (!response.ok) {
    throw new OverpassError(`Overpass responded ${response.status}`, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OverpassError("Overpass response was not JSON");
  }
  return parseOverpassPlaces(payload, bbox);
}

function assertBBox(bbox: BBox): void {
  const { south, west, north, east } = bbox;
  if (![south, west, north, east].every((value) => Number.isFinite(value))) {
    throw new OverpassError("Bounding box must be finite");
  }
  if (south >= north || west >= east) throw new OverpassError("Bounding box is empty");
}

function combineSignals(timeout: AbortSignal, parent?: AbortSignal): AbortSignal {
  if (!parent) return timeout;
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  if (timeout.aborted) abortFrom(timeout);
  else timeout.addEventListener("abort", () => abortFrom(timeout), { once: true });
  if (parent.aborted) abortFrom(parent);
  else parent.addEventListener("abort", () => abortFrom(parent), { once: true });
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function parseElement(element: unknown): OsmPlace | null {
  if (!element || typeof element !== "object") return null;
  const row = element as {
    type?: unknown;
    id?: unknown;
    lat?: unknown;
    lon?: unknown;
    center?: unknown;
    tags?: unknown;
  };
  if (typeof row.type !== "string" || !OSM_TYPES.has(row.type)) return null;
  if (typeof row.id !== "number" || !Number.isInteger(row.id)) return null;

  const tags = stringTags(row.tags);
  const kind = kindOf(tags);
  if (!kind) return null;

  const coords = coordinatesOf(row);
  if (!coords) return null;

  return {
    id: `${row.type}/${row.id}`,
    name: tags.name || tags["name:en"] || "",
    kind,
    tags,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}

function kindOf(tags: Record<string, string>): OsmKind | null {
  if (isCentralStation(tags)) return "station";
  const tourism = tags.tourism ?? "";
  if (HOTELS.has(tourism)) return "hotel";
  if (NIGHTLIFE.has(tags.amenity ?? "")) return "nightlife";
  if (SIGHTS.has(tourism)) return "sight";
  return null;
}

function isCentralStation(tags: Record<string, string>): boolean {
  if (tags.railway !== "station") return false;
  // UK stations carry the CRS code on ref:crs. NCL is Newcastle Central.
  if (tags["ref:crs"] === "NCL" || tags.ref === "NCL") return true;
  const name = tags.name || tags["name:en"] || "";
  return CENTRAL_STATION_NAME.test(name);
}

function stringTags(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const tags: Record<string, string> = {};
  for (const [key, tag] of Object.entries(value)) {
    if (typeof tag === "string") tags[key] = tag;
  }
  return tags;
}

function coordinatesOf(row: {
  lat?: unknown;
  lon?: unknown;
  center?: unknown;
}): { latitude: number; longitude: number } | null {
  if (isCoord(row.lat) && isCoord(row.lon)) return { latitude: row.lat, longitude: row.lon };
  if (!row.center || typeof row.center !== "object") return null;
  const center = row.center as { lat?: unknown; lon?: unknown };
  if (isCoord(center.lat) && isCoord(center.lon)) {
    return { latitude: center.lat, longitude: center.lon };
  }
  return null;
}

function isCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function insideBox(place: { latitude: number; longitude: number }, bbox: BBox): boolean {
  return (
    place.latitude >= bbox.south - OVERPASS_BBOX_MARGIN &&
    place.latitude <= bbox.north + OVERPASS_BBOX_MARGIN &&
    place.longitude >= bbox.west - OVERPASS_BBOX_MARGIN &&
    place.longitude <= bbox.east + OVERPASS_BBOX_MARGIN
  );
}
