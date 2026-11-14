import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { radius, space, useColors } from "./theme";

/** A surface with a 1px border: depth from borders, not shadows or blur. */
export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
});
