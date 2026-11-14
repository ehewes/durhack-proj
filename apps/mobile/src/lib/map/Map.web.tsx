import { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { NEWCASTLE, osmStyle } from "./style";
import type { MapProps } from "./types";

/** Web map: maplibre-gl, with its attribution control showing OpenStreetMap. */
export function MapView({ center = NEWCASTLE, zoom = 13, style }: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [lng, lat] = center;

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: osmStyle,
      center: [lng, lat],
      zoom,
    });
    return () => map.remove();
  }, [lng, lat, zoom]);

  return (
    <View style={[styles.map, style]}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({ map: { flex: 1, minHeight: 240 } });
