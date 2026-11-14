import { StyleSheet } from "react-native";
import { radius } from "@/lib/ui";

/** Sizes for a laptop at the back of a demo room. Borders, not pills or shadows. */
export const room = StyleSheet.create({
  title: { fontSize: 40, lineHeight: 48, fontWeight: "600" },
  banner: { fontSize: 22, lineHeight: 30, fontWeight: "600" },
  level: { fontSize: 96, lineHeight: 104, fontWeight: "600" },
  unit: { fontSize: 28, lineHeight: 36, fontWeight: "600" },
  waiting: { fontSize: 32, lineHeight: 40, fontWeight: "600" },
  event: { fontSize: 48, lineHeight: 56, fontWeight: "600" },
  hours: { fontSize: 28, lineHeight: 36, fontWeight: "600" },
  detail: { fontSize: 22, lineHeight: 30, fontWeight: "400" },
});

export const meterStyle = StyleSheet.create({
  block: { gap: 12 },
  track: {
    height: 28,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  history: { height: 72, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  column: { flex: 1, height: "100%", justifyContent: "flex-end" },
});
