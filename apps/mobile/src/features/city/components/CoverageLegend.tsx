import type { CityCoverage } from "@kip/shared/city";
import { StyleSheet, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import { COVERAGE_TITLE, coverageNotes, SENSOR_DOTS } from "../coverage";

/** The key for the node-network heat, beside the Observatory sensor dots. */
export function CoverageLegend({ coverage }: { coverage: CityCoverage }) {
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
      {coverageNotes(coverage).map((note) => (
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
  swatch: { width: 14, height: 14, borderRadius: radius.sm, borderWidth: 1 },
});
