import type { CityCoverage } from "@kip/shared/city";
import { StyleSheet, Switch, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import {
  COVERAGE_TITLE,
  coverageNotes,
  hasSimulated,
  SENSOR_DOTS,
  SIMULATED_SWITCH,
} from "../coverage";

type Props = {
  coverage: CityCoverage;
  showSimulated: boolean;
  onShowSimulated: (show: boolean) => void;
};

/** The key for the node-network heat beside the Observatory sensor dots, and the simulated switch. */
export function CoverageLegend({ coverage, showSimulated, onShowSimulated }: Props) {
  const colors = useColors();
  return (
    <View style={styles.root}>
      <View style={styles.entry}>
        <View
          style={[
            styles.swatch,
            { backgroundColor: `${colors.accent}66`, borderColor: colors.border },
          ]}
        />
        <Text variant="caption">{COVERAGE_TITLE}</Text>
      </View>
      {hasSimulated(coverage) && (
        <View style={styles.switchRow}>
          <Text variant="caption">{SIMULATED_SWITCH}</Text>
          <Switch
            accessibilityLabel={SIMULATED_SWITCH}
            value={showSimulated}
            onValueChange={onShowSimulated}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      )}
      {coverageNotes(coverage, showSimulated).map((note) => (
        <Text key={note} variant="caption">
          {note}
        </Text>
      ))}
      <Text variant="caption">{SENSOR_DOTS}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  entry: { flexDirection: "row", alignItems: "center", gap: space.xs },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  swatch: { width: 14, height: 14, borderRadius: radius.sm, borderWidth: 1 },
});
