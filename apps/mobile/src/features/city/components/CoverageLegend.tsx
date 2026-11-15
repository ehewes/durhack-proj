import type { CityCoverage } from "@kip/shared/city";
import { StyleSheet, Switch, View } from "react-native";
import { hairline, Row, Section, space, Text, useColors } from "@/lib/ui";
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
  const notes = [...coverageNotes(coverage, showSimulated), SENSOR_DOTS].join(" ");
  return (
    <Section footer={notes}>
      <Row
        title={COVERAGE_TITLE}
        leading={
          <View
            style={[
              styles.swatch,
              { backgroundColor: `${colors.accent}66`, borderColor: colors.border },
            ]}
          />
        }
      />
      {hasSimulated(coverage) ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{SIMULATED_SWITCH}</Text>
          <Switch
            accessibilityLabel={SIMULATED_SWITCH}
            value={showSimulated}
            onValueChange={onShowSimulated}
            trackColor={{ true: colors.accent, false: colors.fill }}
          />
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 16, height: 16, borderRadius: 4, borderWidth: hairline },
  switchRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    gap: space.sm,
  },
  switchLabel: { flex: 1 },
});
