import { StyleSheet, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import { CLUSTER_NOTE, SHADE_KEY_TITLE, UNSHADED_NOTE } from "../copy";
import { SHADE_BANDS, UNSHADED_COLOR } from "../sensors";

function Swatch({ color }: { color: string }) {
  const colors = useColors();
  return <View style={[styles.swatch, { backgroundColor: color, borderColor: colors.border }]} />;
}

function Entry({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.entry}>
      <Swatch color={color} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

/** The shade key, what unshaded means, and what clusters do not mean. */
export function SensorLegend() {
  return (
    <View style={styles.root}>
      <Text variant="caption">{SHADE_KEY_TITLE}</Text>
      <View style={styles.row}>
        {SHADE_BANDS.map((band) => (
          <Entry key={band.min} color={band.color} label={band.label} />
        ))}
      </View>
      <Entry color={UNSHADED_COLOR} label="Not shaded" />
      <Text variant="caption">{UNSHADED_NOTE}</Text>
      <Text variant="caption">{CLUSTER_NOTE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.xs },
  entry: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 14, height: 14, borderRadius: radius.sm, borderWidth: 1 },
});
