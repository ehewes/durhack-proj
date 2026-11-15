import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { hairline, radius, space, useColors } from "./theme";

/** A grouped surface with a hairline border: depth from borders, not shadows or blur. */
export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: hairline, borderRadius: radius.md, padding: space.md, gap: space.sm },
});
