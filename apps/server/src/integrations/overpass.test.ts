import { describe, expect, test } from "bun:test";
import newcastleOverpass from "./fixtures/newcastle-overpass.json";
import {
  HOTEL_TOURISM,
  NEWCASTLE_BBOX,
  NIGHTLIFE_AMENITY,
  newcastlePlacesQuery,
  type OsmKind,
  OVERPASS_BBOX_MARGIN,
  OVERPASS_ENDPOINT,
  OVERPASS_TIMEOUT_SECONDS,
  OVERPASS_USER_AGENT,
  OverpassError,
  parseOverpassPlaces,
  queryNewcastlePlaces,
  SIGHT_TOURISM,
} from "./overpass";

describe("newcastlePlacesQuery", () => {
  test("is one query for hotels, nightlife, sights and the station", () => {
    const query = newcastlePlacesQuery();
    expect(query.match(/\[out:json\]/g)).toHaveLength(1);
    expect(query.match(/\[timeout:25\]/g)).toHaveLength(1);
    expect(OVERPASS_TIMEOUT_SECONDS).toBe(25);
    expect(query.match(/\[bbox:/g)).toHaveLength(1);
    expect(query).toContain("[bbox:54.958,-1.652,55.002,-1.568]");
    expect(query).toContain('["tourism"~"^(hotel|guest_house|hostel|apartment)$"]');
    expect(query).toContain('["amenity"~"^(bar|pub|nightclub)$"]');
    expect(query).toContain('["tourism"~"^(attraction|museum)$"]');
    expect(query).toContain('["railway"="station"]["ref:crs"="NCL"]');
    expect(query).toContain('["railway"="station"]["name"~"Newcastle",i]');
    expect(query.match(/^out center;$/m)).toHaveLength(1);
    expect(query.includes("@")).toBe(false);
  });

  test("rejects an empty bounding box", () => {
    expect(() => newcastlePlacesQuery({ south: 1, west: 0, north: 1, east: 1 })).toThrow(/empty/);
  });
});

describe("parseOverpassPlaces", () => {
  test("reads a node, a way centre and a relation centre", () => {
    const places = parseOverpassPlaces({
      elements: [
        node(1, { name: "The Castle", tourism: "hotel" }),
        {
          type: "way",
          id: 2,
          center: { lat: 54.98, lon: -1.6 },
          tags: { name: "The Forth", amenity: "pub" },
        },
        {
          type: "relation",
          id: 3,
          center: { lat: 54.99, lon: -1.62 },
          tags: { name: "Great North Museum", tourism: "museum" },
        },
      ],
    });
    expect(places).toEqual([
      {
        id: "node/1",
        name: "The Castle",
        kind: "hotel",
        tags: { name: "The Castle", tourism: "hotel" },
        latitude: 54.97,
        longitude: -1.61,
      },
      {
        id: "way/2",
        name: "The Forth",
        kind: "nightlife",
        tags: { name: "The Forth", amenity: "pub" },
        latitude: 54.98,
        longitude: -1.6,
      },
      {
        id: "relation/3",
        name: "Great North Museum",
        kind: "sight",
        tags: { name: "Great North Museum", tourism: "museum" },
        latitude: 54.99,
        longitude: -1.62,
      },
    ]);
  });

  test("classifies every hotel, nightlife and sight tag", () => {
    const elements = [
      ...HOTEL_TOURISM.map((tourism, index) => node(index + 1, { name: tourism, tourism })),
      ...NIGHTLIFE_AMENITY.map((amenity, index) => node(index + 10, { name: amenity, amenity })),
      ...SIGHT_TOURISM.map((tourism, index) => node(index + 20, { name: tourism, tourism })),
    ];
    const places = parseOverpassPlaces({ elements });
    const kinds: OsmKind[] = [
      ...HOTEL_TOURISM.map((): OsmKind => "hotel"),
      ...NIGHTLIFE_AMENITY.map((): OsmKind => "nightlife"),
      ...SIGHT_TOURISM.map((): OsmKind => "sight"),
    ];
    expect(places.map((place) => place.kind)).toEqual(kinds);
  });

  test("keeps Newcastle Central by name or by the NCL code", () => {
    const places = parseOverpassPlaces({
      elements: [
        node(1, { name: "Newcastle", railway: "station" }),
        node(2, { name: "Newcastle Central Station", railway: "station" }),
        node(3, { name: "Central", railway: "station", "ref:crs": "NCL" }),
        node(4, { name: "Newcastle Airport", railway: "station" }),
      ],
    });
    expect(places.map((place) => place.id)).toEqual(["node/1", "node/2", "node/3"]);
    expect(places.every((place) => place.kind === "station")).toBe(true);
  });

  test("drops a relation whose centre is far outside the box", () => {
    const places = parseOverpassPlaces({
      elements: [
        {
          type: "relation",
          id: 5538074,
          center: { lat: 54.969, lon: -2.371 },
          tags: { name: "Hadrian's Wall", tourism: "attraction" },
        },
        node(1, { name: "Castle Keep", tourism: "attraction" }),
      ],
    });
    expect(places.map((place) => place.name)).toEqual(["Castle Keep"]);
  });

  test("drops elements without coordinates or a known kind, and repeats", () => {
    const hotel = node(1, { name: "Motel", tourism: "hotel" });
    const places = parseOverpassPlaces({
      elements: [
        hotel,
        hotel,
        { type: "way", id: 2, tags: { name: "Pub", amenity: "pub" } },
        node(3, { name: "Cafe", amenity: "cafe" }),
        { type: "note", id: 4 },
      ],
    });
    expect(places.map((place) => place.id)).toEqual(["node/1"]);
  });

  test("uses name:en and ignores tags that are not strings", () => {
    const places = parseOverpassPlaces({
      elements: [
        node(1, { tourism: "hostel", "name:en": "Hostel", stars: 4 as unknown as string }),
      ],
    });
    expect(places[0]?.name).toBe("Hostel");
    expect(places[0]?.tags).toEqual({ tourism: "hostel", "name:en": "Hostel" });
  });

  test("rejects a document that is not an Overpass result", () => {
    expect(() => parseOverpassPlaces(null)).toThrow(OverpassError);
    expect(() => parseOverpassPlaces({ remark: "runtime error: Query timed out" })).toThrow(
      /Query timed out/,
    );
  });
});

describe("recorded Newcastle fixture", () => {
  // Recorded 2026-11-14 from the public Overpass API. The main instance was at
  // capacity, so this copy came from overpass.openstreetmap.fr. Tests never refetch it.
  const places = parseOverpassPlaces(newcastleOverpass);

  test("normalises id, name, tags and coordinates inside the box", () => {
    expect(places.length).toBeGreaterThan(50);
    const ids = new Set<string>();
    for (const place of places) {
      expect(place.id).toMatch(/^(node|way|relation)\/\d+$/);
      expect(ids.has(place.id)).toBe(false);
      ids.add(place.id);
      expect(typeof place.name).toBe("string");
      expect(typeof place.tags.name === "string" || place.name === "").toBe(true);
      expect(place.latitude).toBeGreaterThanOrEqual(NEWCASTLE_BBOX.south - OVERPASS_BBOX_MARGIN);
      expect(place.latitude).toBeLessThanOrEqual(NEWCASTLE_BBOX.north + OVERPASS_BBOX_MARGIN);
      expect(place.longitude).toBeGreaterThanOrEqual(NEWCASTLE_BBOX.west - OVERPASS_BBOX_MARGIN);
      expect(place.longitude).toBeLessThanOrEqual(NEWCASTLE_BBOX.east + OVERPASS_BBOX_MARGIN);
    }
    expect(places.some((place) => place.id.startsWith("way/"))).toBe(true);
    expect(places.some((place) => place.id.startsWith("relation/"))).toBe(true);
    expect(places.some((place) => place.name === "Hadrian's Wall")).toBe(false);
  });

  test("includes hotels, nightlife, sights and Newcastle station", () => {
    for (const tourism of HOTEL_TOURISM) {
      expect(places.some((place) => place.kind === "hotel" && place.tags.tourism === tourism)).toBe(
        true,
      );
    }
    for (const amenity of NIGHTLIFE_AMENITY) {
      expect(
        places.some((place) => place.kind === "nightlife" && place.tags.amenity === amenity),
      ).toBe(true);
    }
    for (const tourism of SIGHT_TOURISM) {
      expect(places.some((place) => place.kind === "sight" && place.tags.tourism === tourism)).toBe(
        true,
      );
    }
    const stations = places.filter((place) => place.kind === "station");
    expect(stations).toEqual([
      expect.objectContaining({
        id: "node/195885858",
        name: "Newcastle",
        kind: "station",
        latitude: 54.9683364,
        longitude: -1.616046,
        tags: expect.objectContaining({ railway: "station", "ref:crs": "NCL" }),
      }),
    ]);
  });
});

describe("queryNewcastlePlaces", () => {
  test("posts one request with a timeout and an impersonal User-Agent", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const places = await queryNewcastlePlaces({
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify(newcastleOverpass), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one Overpass request");
    expect(call.url).toBe(OVERPASS_ENDPOINT);
    expect(call.init.method).toBe("POST");
    expect(call.init.signal).toBeDefined();
    const headers = new Headers(call.init.headers);
    expect(headers.get("User-Agent")).toBe(OVERPASS_USER_AGENT);
    expect(headers.get("Authorization")).toBeNull();
    expect(OVERPASS_USER_AGENT.includes("@")).toBe(false);
    expect(call.init.body).toBeInstanceOf(URLSearchParams);
    if (call.init.body instanceof URLSearchParams) {
      expect(call.init.body.get("data")).toBe(newcastlePlacesQuery());
    }
    expect(places.some((place) => place.kind === "station" && place.name === "Newcastle")).toBe(
      true,
    );
  });

  test("times out instead of sending a second query", async () => {
    let calls = 0;
    const fetchImpl = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    await expect(queryNewcastlePlaces({ fetch: fetchImpl, timeoutMs: 30 })).rejects.toThrow(
      /timed out after 30ms/,
    );
    expect(calls).toBe(1);
  });

  test("surfaces an HTTP error with its status", async () => {
    const fetchImpl = async () => new Response("busy", { status: 429 });
    const error = await queryNewcastlePlaces({ fetch: fetchImpl }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(OverpassError);
    if (error instanceof OverpassError) expect(error.status).toBe(429);
  });

  test("rejects a body that is not JSON", async () => {
    const fetchImpl = async () => new Response("nope", { status: 200 });
    await expect(queryNewcastlePlaces({ fetch: fetchImpl })).rejects.toThrow(/not JSON/);
  });
});

function node(id: number, tags: Record<string, string>, lat = 54.97, lon = -1.61) {
  return { type: "node", id, lat, lon, tags };
}
