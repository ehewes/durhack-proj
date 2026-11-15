import type { NoiseLabel } from "@kip/shared/domain";
import type { SFSymbol } from "expo-symbols";
import { StyleSheet, View } from "react-native";
import { hairline, Icon, radius, space, Text, useColors } from "@/lib/ui";

const NAMES: Record<NoiseLabel, string> = {
  construction: "Construction",
  traffic: "Traffic",
  siren: "Siren",
  snoring: "Snoring",
  other: "Other",
  uncertain: "Uncertain",
  handling: "Phone handling",
};

// One symbol per label, so the label reads without relying on colour.
const ICONS: Record<NoiseLabel, SFSymbol> = {
  construction: "hammer",
  traffic: "car",
  siren: "light.beacon.max",
  snoring: "zzz",
  other: "waveform",
  uncertain: "questionmark",
  handling: "iphone",
};

/**
 * The label a noise event got; `null` while the clip is still being labelled. Confident labels sit
 * on a neutral fill; `uncertain` and labelling have no fill and a dashed border.
 */
export function LabelChip({ label }: { label: NoiseLabel | null }) {
  const colors = useColors();
  const text = label === null ? "Labelling" : NAMES[label];
  const tentative = label === null || label === "uncertain";
  return (
    <View
      accessible
      accessibilityLabel={`Noise label: ${text}`}
      style={[
        styles.chip,
        tentative
          ? { borderStyle: "dashed", borderColor: colors.border, borderWidth: 1 }
          : { backgroundColor: colors.fill, borderColor: colors.border, borderWidth: hairline },
      ]}
    >
      <Icon name={label === null ? "ellipsis" : ICONS[label]} size={12} tone="textSecondary" />
      <Text
        variant="footnote"
        tone={tentative ? "secondary" : "primary"}
        style={tentative && styles.tentative}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tentative: { fontStyle: "italic" },
});
