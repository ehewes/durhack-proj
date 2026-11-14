import type { ReactNode } from "react";
import { Text as RNText, StyleSheet } from "react-native";
import { type, useColors } from "@/lib/ui";

/** A section or card heading: the body size from the shared type scale, in semibold. */
export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <RNText accessibilityRole="header" style={[type.body, styles.heading, { color: colors.text }]}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  heading: { fontWeight: "600" },
});
