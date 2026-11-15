import { Pressable, StyleSheet, Text } from "react-native";
import { haptics } from "./haptics";
import { radius, space, type, useColors } from "./theme";

type Props = {
  /** Verb-first label, e.g. "Start recording" */
  label: string;
  onPress: () => void;
  /** primary: solid accent. secondary: bordered. plain: accent text only. destructive: danger text, bordered. */
  variant?: "primary" | "secondary" | "plain" | "destructive";
  disabled?: boolean;
};

/** Solid accent for primary actions, bordered for secondary. No gradients, no pills. */
export function Button({ label, onPress, variant = "primary", disabled = false }: Props) {
  const colors = useColors();
  const look = {
    primary: { bg: colors.accent, border: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.surface, border: colors.border, fg: colors.accent },
    plain: { bg: "transparent", border: "transparent", fg: colors.accent },
    destructive: { bg: colors.surface, border: colors.border, fg: colors.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "plain" && styles.plain,
        { backgroundColor: look.bg, borderColor: look.border },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
      ]}
    >
      <Text style={[type.headline, { color: look.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { minHeight: 50 },
  plain: { paddingHorizontal: space.sm, alignSelf: "flex-start" },
});
