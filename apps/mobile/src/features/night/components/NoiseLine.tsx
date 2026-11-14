import type { NightTimeline } from "@kip/shared/night";
import { StyleSheet, View } from "react-native";
import { useColors } from "@/lib/ui";
import type { Scale } from "./geometry";

/** Relative dB as a polyline of thin rotated Views (no SVG dependency), with spike dots. */
export function NoiseLine({
  night,
  scale,
  height,
}: {
  night: NightTimeline;
  scale: Scale;
  height: number;
}) {
  const colors = useColors();
  const points = night.noise.map(([t, db]) => ({ x: scale.x(t), y: scale.y(db) }));
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Relative dB through the night, with spikes marked"
      style={{ height }}
    >
      <View
        style={[styles.baseline, { top: scale.y(night.baselineDb), borderColor: colors.border }]}
      />
      {night.noise.slice(1).map(([t], i) => {
        const p = points[i + 1];
        const a = points[i];
        if (!a || !p) return null;
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const length = Math.hypot(dx, dy);
        return (
          <View
            key={t}
            style={{
              position: "absolute",
              left: (a.x + p.x) / 2 - length / 2,
              top: (a.y + p.y) / 2 - 1,
              width: length,
              height: 2,
              backgroundColor: colors.textSecondary,
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
      {night.events.map((e) => (
        <View
          key={e.id}
          accessibilityLabel={`Spike, ${Math.round(e.peakDb)} relative dB`}
          style={[
            styles.spike,
            {
              left: scale.x(e.t) - 5,
              top: scale.y(e.peakDb) - 5,
              backgroundColor: colors.text,
              borderColor: colors.background,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  baseline: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderStyle: "dashed" },
  spike: { position: "absolute", width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
