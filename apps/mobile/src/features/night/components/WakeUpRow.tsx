import type { NightTimeline } from "@kip/shared/night";
import { StyleSheet, View } from "react-native";
import { useColors } from "@/lib/ui";
import type { Scale } from "./geometry";

/** Hollow diamonds at each wake-up, on their own row so they never hide a spike. */
export function WakeUpRow({ wakeUps, scale }: { wakeUps: NightTimeline["wakeUps"]; scale: Scale }) {
  const colors = useColors();
  return (
    <View style={styles.row} accessibilityLabel={`${wakeUps.length} wake-ups`}>
      {wakeUps.map((w) => (
        <View
          key={`${w.t}-${w.source}`}
          style={[
            styles.mark,
            {
              left: scale.x(w.t) - 6,
              borderColor: colors.accent,
              backgroundColor: colors.background,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 16 },
  mark: {
    position: "absolute",
    top: 2,
    width: 12,
    height: 12,
    borderWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
});
