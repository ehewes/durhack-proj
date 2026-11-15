import type { SFSymbol } from "expo-symbols";
import type { ReactNode } from "react";
import { type AccessibilityRole, Pressable, StyleSheet, View } from "react-native";
import { haptics } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { space, useColors } from "./theme";

type Props = {
  title: string;
  subtitle?: string;
  /** Leading content: an SF Symbol name or any small element (a swatch). */
  leading?: SFSymbol | ReactNode;
  /** Trailing value text, shown in tabular figures. */
  value?: string;
  /** Extra trailing element, e.g. a switch. */
  trailing?: ReactNode;
  /** Show a disclosure chevron (navigates or expands). */
  chevron?: boolean;
  /** Show a checkmark; for single-choice lists. */
  checked?: boolean;
  selected?: boolean;
  /** "danger" for destructive rows, "accent" for actions. */
  tone?: "primary" | "accent" | "danger";
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
};

/** A 44pt-minimum list row for Section: leading icon, title and subtitle, value, accessory. */
export function Row({
  title,
  subtitle,
  leading,
  value,
  trailing,
  chevron = false,
  checked,
  selected = false,
  tone = "primary",
  onPress,
  accessibilityRole,
  accessibilityLabel,
}: Props) {
  const colors = useColors();
  const lead =
    typeof leading === "string" ? (
      <Icon name={leading as SFSymbol} size={20} tone={tone === "danger" ? "danger" : "accent"} />
    ) : (
      leading
    );
  const body = (
    <>
      {lead ? <View style={styles.leading}>{lead}</View> : null}
      <View style={styles.text}>
        <Text tone={tone === "primary" ? "primary" : tone}>{title}</Text>
        {subtitle ? <Text variant="footnote">{subtitle}</Text> : null}
      </View>
      {value ? (
        <Text tone="secondary" numeric>
          {value}
        </Text>
      ) : null}
      {trailing}
      {checked ? <Icon name="checkmark" size={17} tone="accent" weight="semibold" /> : null}
      {chevron ? (
        <Icon name="chevron.right" size={13} tone="textTertiary" weight="semibold" />
      ) : null}
    </>
  );
  const rowStyle = [styles.row, selected && { backgroundColor: colors.fill }];
  if (!onPress) {
    return (
      <View style={rowStyle} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        selected,
        ...(checked === undefined ? {} : { checked }),
      }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.fill }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md - 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 3,
  },
  leading: { width: 28, alignItems: "center" },
  text: { flex: 1, gap: 2 },
});
