import type { SensorLevel } from "@kip/shared/city";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { type MapHeatPoint, MapView } from "@/lib/map";
import { sensorFeatures } from "../sensors";

export type SensorMapProps = {
  sensors: SensorLevel[];
  /** Sensor id to highlight, for example a Quiet Stay's score source. */
  selectedId?: string | null;
  onSelect?: (sensorId: string | null) => void;
  /** Epoch ms used to decide staleness. Defaults to now. */
  now?: number;
  style?: StyleProp<ViewStyle>;
  /** Rough heat under the sensors, e.g. where Kip phones and Watches sensed. */
  heat?: readonly MapHeatPoint[];
};

/**
 * One point per sensor, clustered into neutral counts. Other features use this through
 * `features/city/index.ts` to highlight the sensors behind a score.
 */
export function SensorMap({ sensors, selectedId, onSelect, now, style, heat }: SensorMapProps) {
  const features = useMemo(() => sensorFeatures(sensors, now ?? Date.now()), [sensors, now]);
  return (
    <MapView
      style={style}
      features={features}
      cluster
      heat={heat}
      selectedId={selectedId ?? null}
      onSelect={(selection) => onSelect?.(selection?.id ?? null)}
    />
  );
}
