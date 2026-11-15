import { Pressable, StyleSheet, View } from "react-native";
import { haptics, Icon, space, Text, useColors } from "@/lib/ui";

type Props = {
  label: string;
  /** Second line, e.g. what a profile ranks first */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * One answer in a group (wrap the group in a `radiogroup` View inside a Section). An iOS
 * checkmark row: nothing is ticked until the user taps, and yes and no look the same, so neither
 * answer is nudged.
 */
export function Choice({ label, detail, selected, onPress, disabled = false }: Props) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      // aria-checked, not accessibilityState: react-native-web drops accessibilityState.checked.
      aria-checked={selected}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.fill },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={styles.words}>
        <Text>{label}</Text>
        {detail ? <Text variant="footnote">{detail}</Text> : null}
      </View>
      <View style={styles.mark}>
        {selected ? <Icon name="checkmark" size={17} tone="accent" weight="semibold" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 3,
  },
  words: { flex: 1, gap: 2 },
  mark: { width: 20, alignItems: "center" },
});
