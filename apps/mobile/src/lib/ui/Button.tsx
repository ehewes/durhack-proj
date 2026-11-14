import { Pressable, StyleSheet, Text } from "react-native";
import { radius, space, type, useColors } from "./theme";

type Props = {
  /** Verb-first label, e.g. "Start recording" */
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

/** Solid accent for primary actions, bordered for secondary. No gradients, no pills. */
export function Button({ label, onPress, variant = "primary", disabled = false }: Props) {
  const colors = useColors();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary
          ? { backgroundColor: colors.accent, borderColor: colors.accent }
          : { backgroundColor: colors.background, borderColor: colors.border },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
      ]}
    >
      <Text style={[type.body, styles.label, { color: primary ? colors.onAccent : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontWeight: "600" },
});
