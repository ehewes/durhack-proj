import type { NoiseLabel } from "@kip/shared/domain";
import { Text as RNText, useColorScheme, View } from "react-native";
import { radius, space, type, useColors } from "@/lib/ui";

const NAMES: Record<NoiseLabel, string> = {
  construction: "Construction",
  traffic: "Traffic",
  siren: "Siren",
  snoring: "Snoring",
  other: "Other",
  uncertain: "Uncertain",
  handling: "Phone handling",
};

// Muted tints, one per label. `uncertain` has no fill and a dashed border so it never reads as a
// confident label.
const TINTS: Record<Exclude<NoiseLabel, "uncertain">, { light: string; dark: string }> = {
  construction: { light: "#f1e4d3", dark: "#3a2f22" },
  traffic: { light: "#e1e6ee", dark: "#262c36" },
  siren: { light: "#f1dcdc", dark: "#3a2626" },
  snoring: { light: "#e0ebe3", dark: "#233028" },
  other: { light: "#e8e8e4", dark: "#2a2a28" },
  handling: { light: "#ebe3ee", dark: "#2e2832" },
};

/** The label a noise event got; `null` while the clip is still being labelled. */
export function LabelChip({ label }: { label: NoiseLabel | null }) {
  const colors = useColors();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const text = label === null ? "Labelling" : NAMES[label];
  const fill = label === null || label === "uncertain" ? null : TINTS[label][scheme];
  return (
    <View
      accessible
      accessibilityLabel={`Noise label: ${text}`}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: space.sm,
        paddingVertical: space.xs,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderStyle: fill ? "solid" : "dashed",
        borderColor: colors.border,
        backgroundColor: fill ?? "transparent",
      }}
    >
      <RNText
        style={[
          type.caption,
          {
            color: fill ? colors.text : colors.textSecondary,
            fontStyle: fill ? "normal" : "italic",
          },
        ]}
      >
        {text}
      </RNText>
    </View>
  );
}
