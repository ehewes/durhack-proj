import mapboxgl, {
  type GeoJSONSourceSpecification,
  type Map as MapboxMap,
  type MapMouseEvent,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { MissingMapToken } from "./MissingMapToken";
import {
  camerasMatch,
  classifyMapHit,
  featuresToCollections,
  MAP_LAYER,
  MAP_LAYER_ORDER,
  MAP_SOURCE,
  MAPBOX_STYLE,
  type MapGeoJsonSourceSpec,
  type MapLayerSpec,
  MISSING_MAPBOX_TOKEN_MESSAGE,
  mapboxToken,
  mapOverlayLayers,
  NEWCASTLE,
  pointPosition,
  pointSource,
  shapeSource,
} from "./style";
import type { MapCamera, MapFeatureCollection, MapPosition, MapProps, MapSelection } from "./types";

type OverlayState = {
  features: MapFeatureCollection | undefined;
  cluster: boolean;
  selectedId: string | null;
};

export type WebMapHandlers = {
  onSelect?: (selection: MapSelection | null) => void;
  onCameraChange?: (camera: MapCamera) => void;
};

export type WebMapSession = {
  setOverlays: (
    features: MapFeatureCollection | undefined,
    cluster: boolean,
    selectedId: string | null,
  ) => void;
  setCamera: (center: MapPosition, zoom: number) => void;
  destroy: () => void;
};

function layersForSource(id: string): readonly string[] {
  if (id === MAP_SOURCE.points)
    return [MAP_LAYER.clusters, MAP_LAYER.clusterCount, MAP_LAYER.points];
  if (id === MAP_SOURCE.lines) return [MAP_LAYER.lines];
  return [MAP_LAYER.polygons, MAP_LAYER.polygonLine];
}

function syncSource(map: MapboxMap, id: string, spec: MapGeoJsonSourceSpec, recreate: boolean) {
  const existing = map.getSource(id);
  if (existing && !recreate && existing.type === "geojson") {
    existing.setData(spec.data as GeoJSONSourceSpecification["data"] & object);
    return;
  }
  if (existing) {
    for (const layerId of layersForSource(id)) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    map.removeSource(id);
  }
  map.addSource(id, spec as GeoJSONSourceSpecification);
}

function applyPaint(map: MapboxMap, layer: MapLayerSpec) {
  if (!layer.paint) return;
  for (const [key, value] of Object.entries(layer.paint)) {
    map.setPaintProperty(layer.id, key as never, value as never);
  }
}

function applyOverlays(
  map: MapboxMap,
  pending: OverlayState,
  previousCluster: boolean | undefined,
): boolean {
  const collections = featuresToCollections(pending.features);
  const recreatePoints = previousCluster !== undefined && previousCluster !== pending.cluster;
  syncSource(map, MAP_SOURCE.polygons, shapeSource(collections.polygons), false);
  syncSource(map, MAP_SOURCE.lines, shapeSource(collections.lines), false);
  syncSource(
    map,
    MAP_SOURCE.points,
    pointSource(collections.points, pending.cluster),
    recreatePoints,
  );
  for (const layer of mapOverlayLayers(pending.selectedId)) {
    if (!map.getLayer(layer.id)) map.addLayer(layer as never);
    else applyPaint(map, layer);
  }
  return pending.cluster;
}

function expandCluster(
  map: MapboxMap,
  clusterId: number,
  geometry: { type?: string; coordinates?: unknown },
) {
  const source = map.getSource(MAP_SOURCE.points);
  const center = pointPosition(geometry);
  if (source?.type !== "geojson" || !center) return;
  source.getClusterExpansionZoom(clusterId, (error, zoom) => {
    if (error || zoom == null) return;
    map.easeTo({ center, zoom });
  });
}

/**
 * Web map: Mapbox GL JS on the light basemap, centred on Newcastle.
 * Device location is not requested. Attribution stays expanded so it stays visible.
 */
export function openWebMap(
  container: HTMLElement,
  camera: MapCamera,
  token: string,
  handlers: WebMapHandlers,
): WebMapSession {
  const map = new mapboxgl.Map({
    accessToken: token,
    container,
    style: MAPBOX_STYLE,
    center: camera.center,
    zoom: camera.zoom,
    attributionControl: false,
    logoPosition: "bottom-left",
  });
  map.addControl(new mapboxgl.AttributionControl({ compact: false }), "bottom-right");

  let loaded = false;
  let appliedCluster: boolean | undefined;
  let pending: OverlayState = { features: undefined, cluster: false, selectedId: null };

  const apply = () => {
    appliedCluster = applyOverlays(map, pending, appliedCluster);
  };

  map.on("load", () => {
    loaded = true;
    map.resize();
    apply();
  });

  map.on("click", (event: MapMouseEvent) => {
    const present = MAP_LAYER_ORDER.filter((id) => map.getLayer(id));
    const hits =
      present.length === 0 ? [] : map.queryRenderedFeatures(event.point, { layers: [...present] });
    const top = hits[0];
    if (!top) {
      handlers.onSelect?.(null);
      return;
    }
    const props =
      top.properties && typeof top.properties === "object"
        ? (top.properties as Record<string, unknown>)
        : null;
    const hit = classifyMapHit(props, top.id);
    if (hit.kind === "cluster") {
      expandCluster(map, hit.clusterId, top.geometry);
      return;
    }
    if (hit.kind === "feature") {
      handlers.onSelect?.({ id: hit.id });
      return;
    }
    handlers.onSelect?.(null);
  });

  map.on("moveend", () => {
    const center = map.getCenter();
    handlers.onCameraChange?.({
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
    });
  });

  return {
    setOverlays(features, cluster, selectedId) {
      pending = { features, cluster, selectedId };
      if (loaded) apply();
    },
    setCamera(center, zoom) {
      const current = map.getCenter();
      const next = { center, zoom };
      if (camerasMatch({ lng: current.lng, lat: current.lat, zoom: map.getZoom() }, next)) return;
      map.jumpTo({ center, zoom });
    },
    destroy() {
      map.remove();
    },
  };
}

/** Web map. Metro loads this file instead of Map.native.tsx. */
export function MapView({
  center = NEWCASTLE,
  zoom = 13,
  style,
  features,
  cluster = false,
  selectedId = null,
  onSelect,
  onCameraChange,
}: MapProps) {
  const token = mapboxToken({
    EXPO_PUBLIC_MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
  });
  const container = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<WebMapSession | null>(null);
  const handlers = useRef({ onSelect, onCameraChange });
  handlers.current = { onSelect, onCameraChange };
  const initialCamera = useRef<MapCamera>({ center, zoom });

  useEffect(() => {
    if (!container.current || !token) return;
    const session = openWebMap(container.current, initialCamera.current, token, {
      onSelect: (selection) => handlers.current.onSelect?.(selection),
      onCameraChange: (next) => handlers.current.onCameraChange?.(next),
    });
    sessionRef.current = session;
    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    sessionRef.current?.setCamera(center, zoom);
  }, [center, zoom]);

  useEffect(() => {
    sessionRef.current?.setOverlays(features, cluster, selectedId);
  }, [features, cluster, selectedId]);

  if (!token) return <MissingMapToken message={MISSING_MAPBOX_TOKEN_MESSAGE} style={style} />;

  return (
    <View style={[styles.map, style]}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({ map: { flex: 1, minHeight: 240 } });
