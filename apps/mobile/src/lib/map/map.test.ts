import { describe, expect, mock, test } from "bun:test";
import {
  camerasMatch,
  cameraTracker,
  classifyMapHit,
  featuresToCollections,
  MAP_LAYER_ORDER,
  MAP_SOURCE,
  MAPBOX_STYLE,
  MISSING_MAPBOX_TOKEN_MESSAGE,
  MISSING_MOBILE_MAPBOX_TOKEN_MESSAGE,
  mapboxToken,
  mapOverlayLayers,
  mobileMapboxToken,
  NEWCASTLE,
  nativeOverlayLayers,
  pointPosition,
  pointSource,
  pressedHit,
} from "./style";
import type { MapFeatureCollection } from "./types";

const INK = "#1a1a18";
const ACCENT = "#2f5bd3";
const ON_INK = "#ffffff";

const sample: MapFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "sensor-1",
      geometry: { type: "Point", coordinates: [-1.61, 54.97] },
      properties: { name: "Eldon Square" },
    },
    {
      type: "Feature",
      id: "works-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.62, 54.97],
          [-1.6, 54.98],
        ],
      },
      properties: null,
    },
    {
      type: "Feature",
      id: "zone-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1.63, 54.96],
            [-1.6, 54.96],
            [-1.6, 54.99],
            [-1.63, 54.96],
          ],
        ],
      },
    },
    {
      type: "Feature",
      id: "bad-point",
      geometry: { type: "Point", coordinates: [Number.NaN, 54.97] },
    },
  ],
};

describe("mapbox token", () => {
  test("a blank token is missing", () => {
    expect(mapboxToken()).toBeUndefined();
    expect(mapboxToken({ EXPO_PUBLIC_MAPBOX_TOKEN: "  " })).toBeUndefined();
    expect(MISSING_MAPBOX_TOKEN_MESSAGE).toContain("EXPO_PUBLIC_MAPBOX_TOKEN");
    expect(MISSING_MAPBOX_TOKEN_MESSAGE).toContain("Newcastle");
  });

  test("a public token is trimmed and kept", () => {
    expect(mapboxToken({ EXPO_PUBLIC_MAPBOX_TOKEN: "  pk.test-public  " })).toBe("pk.test-public");
  });
});

describe("overlay model", () => {
  test("splits points, lines and polygons and drops invalid coordinates", () => {
    const collections = featuresToCollections(sample);
    expect(collections.points.features.map((feature) => feature.id)).toEqual(["sensor-1"]);
    expect(collections.lines.features.map((feature) => feature.id)).toEqual(["works-1"]);
    expect(collections.polygons.features.map((feature) => feature.id)).toEqual(["zone-1"]);
    expect(collections.points.features[0]?.properties.id).toBe("sensor-1");
    expect(collections.lines.features[0]?.properties.id).toBe("works-1");
  });

  test("clusters only the point source", () => {
    const collections = featuresToCollections(sample);
    expect(pointSource(collections.points, true)).toMatchObject({
      type: "geojson",
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 14,
    });
    expect(pointSource(collections.points, false).cluster).toBe(false);
  });

  test("selection changes stroke width and the palette stays one ink plus one accent", () => {
    const idle = mapOverlayLayers(null);
    const selected = mapOverlayLayers("sensor-1");
    const point = (layers: typeof idle) => layers.find((layer) => layer.id === "kip-points");
    expect(point(idle)?.paint?.["circle-stroke-width"]).toEqual([
      "case",
      ["==", ["get", "id"], ""],
      3,
      0,
    ]);
    expect(point(selected)?.paint?.["circle-stroke-width"]).toEqual([
      "case",
      ["==", ["get", "id"], "sensor-1"],
      3,
      0,
    ]);

    const colors = new Set<string>();
    for (const layer of selected) {
      collectColors(layer.paint, colors);
      collectColors(layer.layout, colors);
    }
    expect([...colors].sort()).toEqual([ACCENT, INK, ON_INK].sort());
    expect(MAPBOX_STYLE).toBe("mapbox://styles/mapbox/light-v11");
  });

  test("classifies selection, clusters and empty hits", () => {
    expect(classifyMapHit({ id: "sensor-1" }, undefined)).toEqual({
      kind: "feature",
      id: "sensor-1",
    });
    expect(classifyMapHit({ cluster: true, cluster_id: 4 }, undefined)).toEqual({
      kind: "cluster",
      clusterId: 4,
    });
    expect(classifyMapHit(null, undefined)).toEqual({ kind: "empty" });
  });

  test("camera equality ignores sub-metre noise", () => {
    expect(
      camerasMatch(
        { lng: NEWCASTLE[0], lat: NEWCASTLE[1], zoom: 13 },
        { center: NEWCASTLE, zoom: 13 },
      ),
    ).toBe(true);
    expect(
      camerasMatch(
        { lng: NEWCASTLE[0] + 0.01, lat: NEWCASTLE[1], zoom: 13 },
        { center: NEWCASTLE, zoom: 13 },
      ),
    ).toBe(false);
  });
});

describe("native map model", () => {
  test("the iPhone reads its own public token and refuses a secret one", () => {
    expect(mobileMapboxToken()).toBeUndefined();
    expect(mobileMapboxToken({ EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN: " " })).toBeUndefined();
    expect(mobileMapboxToken({ EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN: " pk.phone " })).toBe("pk.phone");
    expect(mobileMapboxToken({ EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN: "sk.secret" })).toBeUndefined();
    expect(MISSING_MOBILE_MAPBOX_TOKEN_MESSAGE).toContain("EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN");
    expect(MISSING_MOBILE_MAPBOX_TOKEN_MESSAGE).toContain("Newcastle");
  });

  test("draws the web layers in the web order with camelCase style props", () => {
    const layers = nativeOverlayLayers("sensor-1");
    expect(layers.map((layer) => layer.id)).toEqual([...MAP_LAYER_ORDER]);
    expect(layers.map((layer) => layer.aboveLayerID)).toEqual([
      undefined,
      ...MAP_LAYER_ORDER.slice(0, -1),
    ]);

    const find = (id: string) => layers.find((layer) => layer.id === id);
    expect(find("kip-points")?.style).toEqual({
      circleColor: INK,
      circleRadius: 6,
      circleStrokeColor: ACCENT,
      circleStrokeWidth: ["case", ["==", ["get", "id"], "sensor-1"], 3, 0],
    });
    expect(find("kip-points")?.filter).toEqual(["!", ["has", "point_count"]]);
    expect(find("kip-lines")?.style).toMatchObject({ lineCap: "round", lineJoin: "round" });
    expect(find("kip-cluster-count")?.style).toMatchObject({
      textField: ["get", "point_count_abbreviated"],
      textColor: ON_INK,
    });
    expect(find("kip-polygons")?.source).toBe(MAP_SOURCE.polygons);
  });

  test("a tap selects the top feature, expands a cluster, or clears", () => {
    expect(
      pressedHit([{ properties: { id: "sensor-1" } }, { properties: { id: "zone-1" } }]),
    ).toEqual({ kind: "feature", id: "sensor-1" });
    expect(pressedHit([{ properties: { cluster: true, cluster_id: 9 } }])).toEqual({
      kind: "cluster",
      clusterId: 9,
    });
    expect(pressedHit([{ id: 12, properties: null }])).toEqual({ kind: "feature", id: "12" });
    expect(pressedHit([])).toEqual({ kind: "empty" });
    expect(pressedHit(undefined)).toEqual({ kind: "empty" });
  });

  test("a cluster centres on its point", () => {
    expect(pointPosition({ type: "Point", coordinates: [-1.62, 54.97] })).toEqual([-1.62, 54.97]);
    expect(pointPosition({ type: "Point", coordinates: [Number.NaN, 54.97] })).toBe(null);
    expect(pointPosition({ type: "LineString", coordinates: [] })).toBe(null);
    expect(pointPosition(null)).toBe(null);
  });

  test("reports only real camera moves and never echoes props back", () => {
    const camera = cameraTracker({ center: NEWCASTLE, zoom: 13 });
    expect(camera.idle(NEWCASTLE, 13)).toBe(null);
    expect(camera.idle([-1.5, 55], 11)).toEqual({ center: [-1.5, 55], zoom: 11 });
    expect(camera.idle([-1.5, 55], 11)).toBe(null);
    expect(camera.idle([Number.NaN, 55], 11)).toBe(null);

    expect(camera.request({ center: NEWCASTLE, zoom: 13 })).toBe(null);
    expect(camera.request({ center: [-1.5, 55], zoom: 11 })).toBe(null);
    expect(camera.request({ center: NEWCASTLE, zoom: 12 })).toEqual({
      center: NEWCASTLE,
      zoom: 12,
    });
    expect(camera.request({ center: NEWCASTLE, zoom: 12 })).toBe(null);
  });
});

describe("web map session", () => {
  const maps: FakeMap[] = [];
  const attributions: FakeAttribution[] = [];
  let geolocateCount = 0;
  let geoCalls = 0;

  mock.module("react-native", () => ({
    StyleSheet: { create: (styles: unknown) => styles },
    View: null,
    Text: null,
  }));
  mock.module("@/lib/ui", () => ({
    Text: null,
    useColors: () => ({
      surface: "#f6f6f4",
      border: "#e2e2de",
      text: "#1a1a18",
    }),
  }));
  mock.module("mapbox-gl/dist/mapbox-gl.css", () => ({}));
  mock.module("mapbox-gl", () => ({
    default: {
      Map: class {
        options: Record<string, unknown>;
        controls: unknown[] = [];
        listeners = new Map<string, Array<(event?: unknown) => void>>();
        sources = new Map<string, FakeSource>();
        layers = new Map<string, { paint: Record<string, unknown> }>();
        hits: Array<{ id?: string; properties?: Record<string, unknown>; geometry?: unknown }> = [];
        center: [number, number];
        zoom: number;
        removed = false;
        constructor(options: Record<string, unknown>) {
          this.options = options;
          this.center = options.center as [number, number];
          this.zoom = options.zoom as number;
          maps.push(this as unknown as FakeMap);
        }
        addControl(control: unknown) {
          this.controls.push(control);
          return this;
        }
        on(event: string, handler: (event?: unknown) => void) {
          const list = this.listeners.get(event) ?? [];
          list.push(handler);
          this.listeners.set(event, list);
          return this;
        }
        resize() {
          return this;
        }
        remove() {
          this.removed = true;
        }
        getCenter() {
          return { lng: this.center[0], lat: this.center[1] };
        }
        getZoom() {
          return this.zoom;
        }
        jumpTo(camera: { center: [number, number]; zoom: number }) {
          this.center = camera.center;
          this.zoom = camera.zoom;
        }
        easeTo(camera: { center: [number, number]; zoom: number }) {
          this.jumpTo(camera);
        }
        getSource(id: string) {
          return this.sources.get(id);
        }
        addSource(id: string, spec: { data: unknown; cluster?: boolean }) {
          const source: FakeSource = {
            type: "geojson",
            data: spec.data,
            spec,
            setData(data: unknown) {
              source.data = data;
            },
            getClusterExpansionZoom(
              _clusterId: number,
              callback: (error: null, zoom: number) => void,
            ) {
              callback(null, 15);
            },
          };
          this.sources.set(id, source);
        }
        removeSource(id: string) {
          this.sources.delete(id);
        }
        getLayer(id: string) {
          return this.layers.get(id);
        }
        addLayer(layer: { id: string; paint?: Record<string, unknown> }) {
          this.layers.set(layer.id, { paint: { ...(layer.paint ?? {}) } });
        }
        removeLayer(id: string) {
          this.layers.delete(id);
        }
        setPaintProperty(id: string, key: string, value: unknown) {
          const layer = this.layers.get(id);
          if (layer) layer.paint[key] = value;
        }
        queryRenderedFeatures() {
          return this.hits;
        }
      },
      AttributionControl: class {
        options: unknown;
        constructor(options: unknown) {
          this.options = options;
          attributions.push(this);
        }
      },
      GeolocateControl: class {
        constructor() {
          geolocateCount += 1;
        }
      },
    },
  }));

  test("opens Newcastle on the light style with visible attribution and no device location", async () => {
    const previousNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition() {
            geoCalls += 1;
          },
          watchPosition() {
            geoCalls += 1;
          },
        },
      },
    });

    try {
      const { openWebMap } = await import("./Map.web");
      const selected: string[] = [];
      const cameras: Array<{ zoom: number }> = [];
      const session = openWebMap(
        {} as HTMLElement,
        { center: NEWCASTLE, zoom: 13 },
        "pk.test-public",
        {
          onSelect: (selection) => {
            if (selection) selected.push(selection.id);
          },
          onCameraChange: (camera) => cameras.push(camera),
        },
      );

      const map = maps[0];
      expect(map).toBeDefined();
      if (!map) return;
      expect(map.options).toMatchObject({
        accessToken: "pk.test-public",
        style: MAPBOX_STYLE,
        center: NEWCASTLE,
        zoom: 13,
        attributionControl: false,
      });
      expect(JSON.stringify(map.options)).not.toContain("geolocate");
      expect(attributions).toHaveLength(1);
      expect(attributions[0]?.options).toEqual({ compact: false });
      expect(geolocateCount).toBe(0);
      expect(geoCalls).toBe(0);
      expect(map.controls).toHaveLength(1);

      session.setOverlays(sample, true, null);
      fire(map, "load");
      const points = map.sources.get(MAP_SOURCE.points);
      expect(points?.spec.cluster).toBe(true);
      expect(points?.data).toMatchObject({
        features: [expect.objectContaining({ id: "sensor-1" })],
      });
      expect(map.layers.has("kip-points")).toBe(true);
      expect(map.layers.has("kip-clusters")).toBe(true);

      map.hits = [
        {
          id: "sensor-1",
          properties: { id: "sensor-1" },
          geometry: { type: "Point", coordinates: NEWCASTLE },
        },
      ];
      fire(map, "click", { point: { x: 1, y: 1 } });
      expect(selected).toEqual(["sensor-1"]);

      map.hits = [
        {
          properties: { cluster: true, cluster_id: 7 },
          geometry: { type: "Point", coordinates: [-1.62, 54.97] },
        },
      ];
      fire(map, "click", { point: { x: 2, y: 2 } });
      expect(map.zoom).toBe(15);
      expect(selected).toEqual(["sensor-1"]);

      map.center = [-1.5, 55];
      map.zoom = 11;
      fire(map, "moveend");
      expect(cameras.at(-1)).toEqual({ center: [-1.5, 55], zoom: 11 });

      session.setCamera([-1.5, 55], 11);
      expect(map.zoom).toBe(11);
      session.setCamera(NEWCASTLE, 12);
      expect(map.center).toEqual(NEWCASTLE);
      expect(map.zoom).toBe(12);

      session.destroy();
      expect(map.removed).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: previousNavigator,
      });
    }
  });
});

type FakeSource = {
  type: "geojson";
  data: unknown;
  spec: { data: unknown; cluster?: boolean };
  setData: (data: unknown) => void;
  getClusterExpansionZoom: (
    clusterId: number,
    callback: (error: null, zoom: number) => void,
  ) => void;
};

type FakeMap = {
  options: Record<string, unknown>;
  controls: unknown[];
  listeners: Map<string, Array<(event?: unknown) => void>>;
  sources: Map<string, FakeSource>;
  layers: Map<string, { paint: Record<string, unknown> }>;
  hits: Array<{ id?: string; properties?: Record<string, unknown>; geometry?: unknown }>;
  center: [number, number];
  zoom: number;
  removed: boolean;
};

type FakeAttribution = { options: unknown };

function fire(map: FakeMap, event: string, payload?: unknown) {
  for (const handler of map.listeners.get(event) ?? []) handler(payload);
}

function collectColors(value: unknown, colors: Set<string>) {
  if (typeof value === "string" && value.startsWith("#")) colors.add(value);
  else if (Array.isArray(value)) for (const item of value) collectColors(item, colors);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectColors(item, colors);
  }
}
