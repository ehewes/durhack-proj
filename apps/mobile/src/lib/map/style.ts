import type { StyleSpecification } from "maplibre-gl";
import type {
  MapCamera,
  MapFeatureCollection,
  MapFeatureProperties,
  MapGeometry,
  MapPosition,
} from "./types";

/** Newcastle city centre, [longitude, latitude] */
export const NEWCASTLE: [number, number] = [-1.614, 54.973];

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * OpenStreetMap raster tiles for the native map. The web map uses Mapbox.
 * Kept so Map.native.tsx can stay on MapLibre until that migration lands.
 */
export const osmStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Restrained Mapbox basemap. The default Standard style is busier than this dashboard needs. */
export const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";

export const MAPBOX_TOKEN_ENV = "EXPO_PUBLIC_MAPBOX_TOKEN";

export const MISSING_MAPBOX_TOKEN_MESSAGE =
  "Set EXPO_PUBLIC_MAPBOX_TOKEN to a Mapbox public token to show the Newcastle map.";

/** Ink, one accent, and white. Matches the app theme. No multi-hue scale. */
const INK = "#1a1a18";
const ACCENT = "#2f5bd3";
const ON_INK = "#ffffff";

const CLUSTER_RADIUS = 48;
const CLUSTER_MAX_ZOOM = 14;

export function mapboxToken(env?: { EXPO_PUBLIC_MAPBOX_TOKEN?: string }): string | undefined {
  const raw = env?.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (typeof raw !== "string") return undefined;
  const token = raw.trim();
  return token.length > 0 ? token : undefined;
}

export const MAP_SOURCE = {
  points: "kip-points",
  lines: "kip-lines",
  polygons: "kip-polygons",
} as const;

export const MAP_LAYER = {
  polygons: "kip-polygons",
  polygonLine: "kip-polygon-line",
  lines: "kip-lines",
  clusters: "kip-clusters",
  clusterCount: "kip-cluster-count",
  points: "kip-points",
} as const;

/** Later entries draw above earlier ones. */
export const MAP_LAYER_ORDER = [
  MAP_LAYER.polygons,
  MAP_LAYER.polygonLine,
  MAP_LAYER.lines,
  MAP_LAYER.clusters,
  MAP_LAYER.clusterCount,
  MAP_LAYER.points,
] as const;

export type DrawnFeature = {
  type: "Feature";
  id: string;
  properties: MapFeatureProperties;
  geometry: MapGeometry;
};

export type DrawnCollection = {
  type: "FeatureCollection";
  features: DrawnFeature[];
};

export type MapGeoJsonSourceSpec = {
  type: "geojson";
  data: DrawnCollection;
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoom?: number;
};

export type MapLayerSpec = {
  id: string;
  type: "fill" | "line" | "circle" | "symbol";
  source: string;
  filter?: unknown[];
  layout?: Record<string, string | number | unknown[]>;
  paint?: Record<string, string | number | unknown[]>;
};

export type MapHit =
  | { kind: "cluster"; clusterId: number }
  | { kind: "feature"; id: string }
  | { kind: "empty" };

function emptyCollection(): DrawnCollection {
  return { type: "FeatureCollection", features: [] };
}

function isPosition(value: unknown): value is MapPosition {
  if (!Array.isArray(value) || value.length < 2) return false;
  const lng = value[0];
  const lat = value[1];
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat)
  );
}

function isLine(value: unknown): value is MapPosition[] {
  return Array.isArray(value) && value.length >= 2 && value.every(isPosition);
}

function isRing(value: unknown): value is MapPosition[] {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function withId(
  id: string,
  properties: MapFeatureProperties | null | undefined,
): MapFeatureProperties {
  return { ...(properties ?? {}), id };
}

/** Split a feature collection into the three sources the web map draws. Invalid features are dropped. */
export function featuresToCollections(features: MapFeatureCollection | undefined): {
  points: DrawnCollection;
  lines: DrawnCollection;
  polygons: DrawnCollection;
} {
  const points = emptyCollection();
  const lines = emptyCollection();
  const polygons = emptyCollection();
  for (const feature of features?.features ?? []) {
    if (feature?.type !== "Feature" || feature.id.length === 0) continue;
    const drawn: DrawnFeature = {
      type: "Feature",
      id: feature.id,
      properties: withId(feature.id, feature.properties),
      geometry: feature.geometry,
    };
    if (feature.geometry.type === "Point" && isPosition(feature.geometry.coordinates)) {
      points.features.push(drawn);
    } else if (feature.geometry.type === "LineString" && isLine(feature.geometry.coordinates)) {
      lines.features.push(drawn);
    } else if (
      feature.geometry.type === "Polygon" &&
      feature.geometry.coordinates.length > 0 &&
      feature.geometry.coordinates.every(isRing)
    ) {
      polygons.features.push(drawn);
    }
  }
  return { points, lines, polygons };
}

export function shapeSource(data: DrawnCollection): MapGeoJsonSourceSpec {
  return { type: "geojson", data };
}

export function pointSource(data: DrawnCollection, cluster: boolean): MapGeoJsonSourceSpec {
  return {
    type: "geojson",
    data,
    cluster,
    clusterRadius: CLUSTER_RADIUS,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
  };
}

function selectedCase(selectedId: string | null, selected: number, idle: number): unknown[] {
  return ["case", ["==", ["get", "id"], selectedId ?? ""], selected, idle];
}

function selectedColor(selectedId: string | null): unknown[] {
  return ["case", ["==", ["get", "id"], selectedId ?? ""], ACCENT, INK];
}

/** Overlay layers. Point clusters use one ink, not a colour scale. */
export function mapOverlayLayers(selectedId: string | null): MapLayerSpec[] {
  return [
    {
      id: MAP_LAYER.polygons,
      type: "fill",
      source: MAP_SOURCE.polygons,
      paint: {
        "fill-color": INK,
        "fill-opacity": selectedCase(selectedId, 0.45, 0.18),
      },
    },
    {
      id: MAP_LAYER.polygonLine,
      type: "line",
      source: MAP_SOURCE.polygons,
      paint: {
        "line-color": ACCENT,
        "line-width": selectedCase(selectedId, 2, 0),
      },
    },
    {
      id: MAP_LAYER.lines,
      type: "line",
      source: MAP_SOURCE.lines,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": selectedColor(selectedId),
        "line-width": selectedCase(selectedId, 4, 2),
      },
    },
    {
      id: MAP_LAYER.clusters,
      type: "circle",
      source: MAP_SOURCE.points,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": INK,
        "circle-radius": 16,
        "circle-stroke-color": ON_INK,
        "circle-stroke-width": 1,
      },
    },
    {
      id: MAP_LAYER.clusterCount,
      type: "symbol",
      source: MAP_SOURCE.points,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
      },
      paint: { "text-color": ON_INK },
    },
    {
      id: MAP_LAYER.points,
      type: "circle",
      source: MAP_SOURCE.points,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": INK,
        "circle-radius": 6,
        "circle-stroke-color": ACCENT,
        "circle-stroke-width": selectedCase(selectedId, 3, 0),
      },
    },
  ];
}

/** A click target from a rendered feature. Clusters zoom; other hits select. */
export function classifyMapHit(
  properties: Record<string, unknown> | null | undefined,
  featureId: unknown,
): MapHit {
  const props = properties ?? {};
  const clustered = props.cluster === true || props.cluster === "true";
  if (clustered) {
    const clusterId = Number(props.cluster_id);
    if (!Number.isInteger(clusterId)) return { kind: "empty" };
    return { kind: "cluster", clusterId };
  }
  if (typeof props.id === "string" && props.id.length > 0) return { kind: "feature", id: props.id };
  if (typeof props.id === "number" && Number.isFinite(props.id)) {
    return { kind: "feature", id: String(props.id) };
  }
  if (typeof featureId === "string" && featureId.length > 0)
    return { kind: "feature", id: featureId };
  if (typeof featureId === "number" && Number.isFinite(featureId)) {
    return { kind: "feature", id: String(featureId) };
  }
  return { kind: "empty" };
}

const CAMERA_EPSILON = 1e-6;
const ZOOM_EPSILON = 1e-3;

export function camerasMatch(
  current: { lng: number; lat: number; zoom: number },
  next: MapCamera,
): boolean {
  return (
    Math.abs(current.lng - next.center[0]) < CAMERA_EPSILON &&
    Math.abs(current.lat - next.center[1]) < CAMERA_EPSILON &&
    Math.abs(current.zoom - next.zoom) < ZOOM_EPSILON
  );
}
