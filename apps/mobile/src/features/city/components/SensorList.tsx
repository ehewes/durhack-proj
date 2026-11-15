import type { SensorLevel } from "@kip/shared/city";
import { Pressable, StyleSheet, View } from "react-native";
import { hairline, haptics, Icon, Section, space, Text, useColors } from "@/lib/ui";
import { ESTIMATE_LABEL, LIST_TITLE, STATE_LABEL, STATE_NOTE } from "../copy";
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
      accessibilityState={{ selected, expanded: selected }}
      accessibilityLabel={`${sensor.name}, ${pctText(sensor.pctHighlySleepDisturbed)}, ${STATE_LABEL[state]}`}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        (pressed || selected) && { backgroundColor: colors.fill },
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
          <Text numberOfLines={1}>{sensor.name}</Text>
          <Text variant="footnote">{STATE_LABEL[state]}</Text>
        </View>
        <Text variant="headline" numeric>
          {pctText(sensor.pctHighlySleepDisturbed)}
        </Text>
        <Icon
          name={selected ? "chevron.up" : "chevron.down"}
          size={12}
          tone="textTertiary"
          weight="semibold"
        />
      </View>
      {selected && (
        <View style={[styles.details, { borderTopColor: colors.separator }]}>
          <Text variant="footnote">{ESTIMATE_LABEL}</Text>
          {sensorDetails(sensor).map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text variant="subheadline" tone="secondary">
                {d.label}
              </Text>
              <Text variant="subheadline" numeric style={styles.value}>
                {d.value}
              </Text>
            </View>
          ))}
          {note ? <Text variant="footnote">{note}</Text> : null}
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

/** Sensors as grouped rows. The selected row expands to its details, the sensor the map highlights. */
export function SensorList({ sensors, selectedId, now, onSelect }: ListProps) {
  return (
    <Section title={LIST_TITLE}>
      {sensors.map((sensor) => (
        <SensorRow
          key={sensor.id}
          sensor={sensor}
          now={now}
          selected={sensor.id === selectedId}
          onPress={() => onSelect(sensor.id === selectedId ? null : sensor.id)}
        />
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.md, paddingVertical: space.sm + 3, gap: space.sm },
  head: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: space.md - 4 },
  name: { flex: 1, gap: 1 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: hairline },
  details: { gap: space.xs, borderTopWidth: hairline, paddingTop: space.sm, marginLeft: 26 },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  value: { flexShrink: 1, textAlign: "right" },
});
