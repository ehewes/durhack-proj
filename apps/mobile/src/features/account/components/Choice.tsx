import { Pressable, Text as RNText, StyleSheet, View } from "react-native";
import { radius, space, type, useColors } from "@/lib/ui";

type Props = {
  label: string;
  /** Second line, e.g. what a profile ranks first */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * One answer in a group (wrap the group in a `radiogroup` View). Nothing is selected until the
 * user taps, and yes and no look the same, so neither answer is nudged.
 */
export function Choice({ label, detail, selected, onPress, disabled = false }: Props) {
  const colors = useColors();
  const ring = selected ? colors.accent : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="radio"
      // aria-checked, not accessibilityState: react-native-web drops accessibilityState.checked.
      aria-checked={selected}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.background,
          borderColor: selected ? colors.accent : colors.border,
        },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
      ]}
    >
      <View style={[styles.ring, { borderColor: ring }]}>
        {selected ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
      </View>
      <View style={styles.words}>
        <RNText style={[type.body, styles.label, { color: colors.text }]}>{label}</RNText>
        {detail ? (
          <RNText style={[type.caption, { color: colors.textSecondary }]}>{detail}</RNText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  // The radio mark is a control, not a pill around text.
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  words: { flex: 1, gap: 2 },
  label: { fontWeight: "600" },
});
