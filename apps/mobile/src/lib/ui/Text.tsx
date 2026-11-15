import type { ReactNode } from "react";
import {
  type AccessibilityRole,
  Text as RNText,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { type TypeVariant, type as typeScale, useColors } from "./theme";

export type TextTone = "primary" | "secondary" | "tertiary" | "accent" | "danger" | "onAccent";

type Props = {
  variant?: TypeVariant;
  /** Colour role. Captions and footnotes default to secondary. */
  tone?: TextTone;
  /** Tabular figures, so scores and times line up. */
  numeric?: boolean;
  numberOfLines?: number;
  /** Shrink to fit on one line (segmented controls); never below 80%. */
  fit?: boolean;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
};

const HEADERS: ReadonlySet<TypeVariant> = new Set(["largeTitle", "title", "title2"]);
const QUIET: ReadonlySet<TypeVariant> = new Set(["caption", "caption2", "footnote"]);

export function Text({
  variant = "body",
  tone,
  numeric = false,
  numberOfLines,
  fit = false,
  accessibilityRole,
  style,
  children,
}: Props) {
  const colors = useColors();
  const role = tone ?? (QUIET.has(variant) ? "secondary" : "primary");
  const color = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accent,
    danger: colors.danger,
    onAccent: colors.onAccent,
  }[role];
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? (HEADERS.has(variant) ? "header" : undefined)}
      numberOfLines={fit ? 1 : numberOfLines}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.8 : undefined}
      style={[typeScale[variant], { color }, numeric && { fontVariant: ["tabular-nums"] }, style]}
    >
      {children}
    </RNText>
  );
}
