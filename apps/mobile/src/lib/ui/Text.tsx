import type { ReactNode } from "react";
import { Text as RNText } from "react-native";
import { type as typeScale, useColors } from "./theme";

type Variant = keyof typeof typeScale;

export function Text({ variant = "body", children }: { variant?: Variant; children: ReactNode }) {
  const colors = useColors();
  const color = variant === "caption" ? colors.textSecondary : colors.text;
  return <RNText style={[typeScale[variant], { color }]}>{children}</RNText>;
}
