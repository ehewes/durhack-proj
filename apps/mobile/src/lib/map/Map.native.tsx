import { Camera, Map as MapLibreMap } from "@maplibre/maplibre-react-native";
import { StyleSheet } from "react-native";
import { NEWCASTLE, osmStyle } from "./style";
import type { MapProps } from "./types";

/** iOS map: MapLibre native. The attribution button lists OpenStreetMap from the style. */
export function MapView({ center = NEWCASTLE, zoom = 13, style }: MapProps) {
  return (
    <MapLibreMap style={[styles.map, style]} mapStyle={osmStyle} attribution logo={false}>
      <Camera initialViewState={{ center, zoom }} />
    </MapLibreMap>
  );
}

const styles = StyleSheet.create({ map: { flex: 1 } });
