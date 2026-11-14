import Mapbox, {
  Camera,
  CircleLayer,
  type CircleLayerStyle,
  FillLayer,
  type FillLayerStyle,
  LineLayer,
  type LineLayerStyle,
  MapView as MapboxMapView,
  type MapState,
  ShapeSource,
  SymbolLayer,
  type SymbolLayerStyle,
} from "@rnmapbox/maps";
import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { MissingMapToken } from "./MissingMapToken";
import {
  cameraTracker,
  featuresToCollections,
  MAP_SOURCE,
  MAPBOX_STYLE,
  MISSING_MOBILE_MAPBOX_TOKEN_MESSAGE,
  mobileMapboxToken,
  type NativeLayerSpec,
  NEWCASTLE,
  nativeOverlayLayers,
  pointPosition,
  pointSource,
  pressedHit,
} from "./style";
import type { MapProps } from "./types";

// Expo inlines EXPO_PUBLIC_ variables when it bundles, so the full name has to appear here.
const token = mobileMapboxToken({
  EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN,
});
if (token) void Mapbox.setAccessToken(token);

type PressEvent = Parameters<NonNullable<ComponentProps<typeof ShapeSource>["onPress"]>>[0];
type PressedJson = PressEvent["features"][number];
type LayerFilter = ComponentProps<typeof CircleLayer>["filter"];

/** Matches the web map's easeTo when a cluster is tapped. */
const CLUSTER_EASE_MS = 500;

function OverlayLayer({ layer }: { layer: NativeLayerSpec }) {
  // ShapeSource hands sourceID only to its direct children, and this wrapper is that child,
  // so the layer names its source itself.
  const common = {
    id: layer.id,
    sourceID: layer.source,
    aboveLayerID: layer.aboveLayerID,
    filter: layer.filter as LayerFilter,
  };
  switch (layer.type) {
    case "fill":
      return <FillLayer {...common} style={layer.style as FillLayerStyle} />;
    case "line":
      return <LineLayer {...common} style={layer.style as LineLayerStyle} />;
    case "circle":
      return <CircleLayer {...common} style={layer.style as CircleLayerStyle} />;
    case "symbol":
      return <SymbolLayer {...common} style={layer.style as SymbolLayerStyle} />;
  }
}

function NativeMap({
  center = NEWCASTLE,
  zoom = 13,
  style,
  features,
  cluster = false,
  selectedId = null,
  onSelect,
  onCameraChange,
}: MapProps) {
  const cameraRef = useRef<Camera>(null);
  const pointsRef = useRef<ShapeSource>(null);
  const handlers = useRef({ onSelect, onCameraChange });
  handlers.current = { onSelect, onCameraChange };
  const [initial] = useState(() => ({ centerCoordinate: center, zoomLevel: zoom }));
  const [camera] = useState(() => cameraTracker({ center, zoom }));

  const collections = useMemo(() => featuresToCollections(features), [features]);
  const layers = useMemo(() => nativeOverlayLayers(selectedId), [selectedId]);
  const points = pointSource(collections.points, cluster);

  useEffect(() => {
    const next = camera.request({ center, zoom });
    if (!next) return;
    cameraRef.current?.setCamera({
      centerCoordinate: next.center,
      zoomLevel: next.zoom,
      animationDuration: 0,
    });
  }, [camera, center, zoom]);

  const expandCluster = (feature: PressedJson) => {
    const target = pointPosition(feature.geometry);
    const source = pointsRef.current;
    if (!target || !source) return;
    source.getClusterExpansionZoom(feature).then(
      (zoomLevel) =>
        cameraRef.current?.setCamera({
          centerCoordinate: target,
          zoomLevel,
          animationDuration: CLUSTER_EASE_MS,
          animationMode: "easeTo",
        }),
      () => undefined,
    );
  };

  // The SDK hands a tap to the touched source drawn highest, so points beat lines beat polygons.
  const pressSource = (event: PressEvent) => {
    const hit = pressedHit(event.features);
    if (hit.kind === "cluster") {
      const top = event.features[0];
      if (top) expandCluster(top);
      return;
    }
    handlers.current.onSelect?.(hit.kind === "feature" ? { id: hit.id } : null);
  };

  const mapIdle = (state: MapState) => {
    const moved = camera.idle(state.properties.center, state.properties.zoom);
    if (moved) handlers.current.onCameraChange?.(moved);
  };

  const layersOf = (source: string) =>
    layers
      .filter((layer) => layer.source === source)
      .map((layer) => <OverlayLayer key={layer.id} layer={layer} />);

  return (
    <MapboxMapView
      style={[styles.map, style]}
      styleURL={MAPBOX_STYLE}
      // Mapbox requires its logo and attribution. A scale bar adds nothing to a city map.
      logoEnabled
      attributionEnabled
      scaleBarEnabled={false}
      onPress={() => handlers.current.onSelect?.(null)}
      onMapIdle={mapIdle}
    >
      <Camera ref={cameraRef} defaultSettings={initial} />
      <ShapeSource id={MAP_SOURCE.polygons} shape={collections.polygons} onPress={pressSource}>
        {layersOf(MAP_SOURCE.polygons)}
      </ShapeSource>
      <ShapeSource id={MAP_SOURCE.lines} shape={collections.lines} onPress={pressSource}>
        {layersOf(MAP_SOURCE.lines)}
      </ShapeSource>
      <ShapeSource
        // Clustering is fixed when a source is created, so switching it rebuilds the source.
        key={points.cluster ? "clustered" : "plain"}
        ref={pointsRef}
        id={MAP_SOURCE.points}
        shape={collections.points}
        cluster={points.cluster}
        clusterRadius={points.clusterRadius}
        clusterMaxZoomLevel={points.clusterMaxZoom}
        onPress={pressSource}
      >
        {layersOf(MAP_SOURCE.points)}
      </ShapeSource>
    </MapboxMapView>
  );
}

/**
 * iPhone map: the Mapbox Maps SDK through @rnmapbox/maps, drawing the web map's layers on the
 * same light style. Device location is not requested. The Mapbox logo and attribution stay on.
 */
export function MapView(props: MapProps) {
  return token ? (
    <NativeMap {...props} />
  ) : (
    <MissingMapToken message={MISSING_MOBILE_MAPBOX_TOKEN_MESSAGE} style={props.style} />
  );
}

const styles = StyleSheet.create({ map: { flex: 1, minHeight: 240 } });
