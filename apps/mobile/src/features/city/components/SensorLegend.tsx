import { StyleSheet, View } from "react-native";
import { hairline, Section, space, Text, useColors } from "@/lib/ui";
import { CLUSTER_NOTE, SHADE_KEY_TITLE, UNSHADED_NOTE } from "../copy";
import { SHADE_BANDS, UNSHADED_COLOR } from "../sensors";

function Swatch({ color }: { color: string }) {
  const colors = useColors();
  return <View style={[styles.swatch, { backgroundColor: color, borderColor: colors.border }]} />;
}

/** The shade key as one continuous scale, what unshaded means, and what clusters do not mean. */
export function SensorLegend() {
  const colors = useColors();
  return (
    <Section title={SHADE_KEY_TITLE} footer={`${UNSHADED_NOTE} ${CLUSTER_NOTE}`} inset>
      <View style={styles.scale} accessibilityRole="image" accessibilityLabel={SHADE_KEY_TITLE}>
        <View style={[styles.bar, { borderColor: colors.border }]}>
          {SHADE_BANDS.map((band) => (
            <View key={band.min} style={[styles.step, { backgroundColor: band.color }]} />
          ))}
        </View>
        <View style={styles.labels}>
          {SHADE_BANDS.map((band) => (
            <Text key={band.min} variant="caption2" tone="secondary" numeric style={styles.label}>
              {band.label}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.entry}>
        <Swatch color={UNSHADED_COLOR} />
        <Text variant="footnote">Not shaded</Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  scale: { gap: space.xs },
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: hairline,
  },
  step: { flex: 1 },
  labels: { flexDirection: "row" },
  label: { flex: 1, textAlign: "center" },
  entry: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: hairline },
});
