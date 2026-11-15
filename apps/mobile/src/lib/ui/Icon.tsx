import { type SFSymbol, SymbolView } from "expo-symbols";
import type { StyleProp, ViewStyle } from "react-native";
import { type Colors, useColors } from "./theme";

type Props = {
  /** SF Symbol name, e.g. "checkmark.seal.fill". */
  name: SFSymbol;
  size?: number;
  tone?: keyof Pick<
    Colors,
    "text" | "textSecondary" | "textTertiary" | "accent" | "danger" | "onAccent"
  >;
  weight?: "regular" | "medium" | "semibold";
  style?: StyleProp<ViewStyle>;
};

/** A monochrome SF Symbol in a theme colour. Decorative by default: the text next to it carries meaning. */
export function Icon({
  name,
  size = 17,
  tone = "textSecondary",
  weight = "regular",
  style,
}: Props) {
  const colors = useColors();
  return (
    <SymbolView
      name={name}
      size={size}
      weight={weight}
      tintColor={colors[tone]}
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
