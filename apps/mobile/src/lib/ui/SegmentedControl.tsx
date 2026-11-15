import { Pressable, StyleSheet, View } from "react-native";
import { haptics } from "./haptics";
import { Text } from "./Text";
import { hairline, radius, space, useColors } from "./theme";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** iOS-style segmented control: a filled track, the selected segment raised on the surface colour. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.fill }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            style={[
              styles.segment,
              selected && {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: hairline,
              },
            ]}
          >
            <Text variant="footnote" tone="primary" fit style={selected && styles.selected}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radius.sm + 3, padding: 2, gap: 2 },
  segment: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm + 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { fontWeight: "600" },
});
