import type { SFSymbol } from "expo-symbols";
import { StyleSheet, View } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { hairline, radius, space, useColors } from "./theme";

/** An inline, bordered note: sample data, simulated inputs, privacy. Plain surface, no tinted pill. */
export function Notice({ message, icon = "info.circle" }: { message: string; icon?: SFSymbol }) {
  const colors = useColors();
  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="text"
    >
      <Icon name={icon} size={15} tone="textSecondary" style={styles.icon} />
      <Text variant="footnote" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    gap: space.sm,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md - 4,
    paddingVertical: space.sm,
  },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
