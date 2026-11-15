import { useMemo } from "react";
import { StyleSheet, type TextStyle, useWindowDimensions } from "react-native";
import { radius, space } from "@/lib/ui";

type RoomStyles = Record<
  "banner" | "level" | "unit" | "waiting" | "event" | "hours" | "detail",
  TextStyle
>;

/** Sizes for a laptop at the back of a demo room. */
const ROOM: RoomStyles = {
  banner: { fontSize: 22, lineHeight: 30, fontWeight: "600" },
  level: { fontSize: 96, lineHeight: 104, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 28, lineHeight: 36, fontWeight: "600" },
  waiting: { fontSize: 32, lineHeight: 40, fontWeight: "600" },
  event: { fontSize: 48, lineHeight: 56, fontWeight: "700" },
  hours: { fontSize: 28, lineHeight: 36, fontWeight: "600" },
  detail: { fontSize: 22, lineHeight: 30, fontWeight: "400" },
};

/** The same hierarchy at iOS text sizes, for a phone in the hand. */
const PHONE: RoomStyles = {
  banner: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  level: { fontSize: 64, lineHeight: 70, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  waiting: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  event: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  hours: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  detail: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
};

/** Room sizes on a wide screen, phone sizes otherwise. Borders, not pills or shadows. */
export function useRoom(): RoomStyles {
  const { width } = useWindowDimensions();
  return useMemo(() => StyleSheet.create(width >= 900 ? ROOM : PHONE), [width]);
}

export const meterStyle = StyleSheet.create({
  block: { gap: space.sm + 4 },
  track: {
    height: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  history: { height: 72, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  column: { flex: 1, height: "100%", justifyContent: "flex-end" },
});
