import type { SensorLevel } from "@kip/shared/city";
import { Pressable, StyleSheet, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import { ESTIMATE_LABEL, STATE_LABEL, STATE_NOTE } from "../copy";
import { pctText, sensorColor, sensorDetails, sensorState } from "../sensors";

type RowProps = {
  sensor: SensorLevel;
  selected: boolean;
  now: number;
  onPress: () => void;
};

function SensorRow({ sensor, selected, now, onPress }: RowProps) {
  const colors = useColors();
  const state = sensorState(sensor, now);
  const note = STATE_NOTE[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${sensor.name}, ${pctText(sensor.pctHighlySleepDisturbed)}, ${STATE_LABEL[state]}`}
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View style={styles.head}>
        <View
          style={[
            styles.swatch,
            { backgroundColor: sensorColor(sensor, now), borderColor: colors.border },
          ]}
        />
        <View style={styles.name}>
          <Text>{sensor.name}</Text>
          <Text variant="caption">{STATE_LABEL[state]}</Text>
        </View>
        <Text>{pctText(sensor.pctHighlySleepDisturbed)}</Text>
      </View>
      {selected && (
        <View style={styles.details}>
          <Text variant="caption">{ESTIMATE_LABEL}</Text>
          {sensorDetails(sensor).map((d) => (
            <Text key={d.label} variant="caption">{`${d.label}: ${d.value}`}</Text>
          ))}
          {note ? <Text variant="caption">{note}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

type ListProps = {
  sensors: SensorLevel[];
  selectedId: string | null;
  now: number;
  onSelect: (id: string | null) => void;
};

/** Sensors as rows. The selected row expands to its details, the same sensor the map highlights. */
export function SensorList({ sensors, selectedId, now, onSelect }: ListProps) {
  return (
    <View style={styles.list}>
      {sensors.map((sensor) => (
        <SensorRow
          key={sensor.id}
          sensor={sensor}
          now={now}
          selected={sensor.id === selectedId}
          onPress={() => onSelect(sensor.id === selectedId ? null : sensor.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1 },
  swatch: { width: 14, height: 14, borderRadius: radius.sm, borderWidth: 1 },
  details: { gap: space.xs },
});
