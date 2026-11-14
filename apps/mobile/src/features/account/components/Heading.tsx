import type { ReactNode } from "react";
import { Text as RNText, StyleSheet } from "react-native";
import { useColors } from "@/lib/ui";

/** A section or card heading, between the title and body sizes. */
export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <RNText accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
});
