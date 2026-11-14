import type { NightTimeline } from "@kip/shared/night";
import { StyleSheet, View } from "react-native";
import { radius, useColors } from "@/lib/ui";
import type { Scale } from "./geometry";

export const STAGE_LABELS = {
  inBed: "In bed",
  awake: "Awake",
  rem: "REM",
  core: "Core",
  deep: "Deep",
} as const;

/** Depth of sleep reads as depth of one hue; awake is the page background with a border. */
export function useStageColors() {
  const colors = useColors();
  return {
    inBed: colors.border,
    awake: colors.background,
    rem: `${colors.accent}66`,
    core: `${colors.accent}aa`,
    deep: colors.accent,
  } as const;
}

export function StageBand({
  stages,
  scale,
  height = 28,
}: {
  stages: NightTimeline["stages"];
  scale: Scale;
  height?: number;
}) {
  const colors = useColors();
  const fills = useStageColors();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Sleep stages across the night"
      style={[styles.band, { height, borderColor: colors.border }]}
    >
      {stages.map((s) => {
        const left = scale.x(Date.parse(s.start) / 1000);
        const right = scale.x(Date.parse(s.end) / 1000);
        return (
          <View
            key={`${s.start}-${s.stage}`}
            style={[
              styles.span,
              { left, width: Math.max(right - left, 1), backgroundColor: fills[s.stage] },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { borderWidth: 1, borderRadius: radius.sm, overflow: "hidden" },
  span: { position: "absolute", top: 0, bottom: 0 },
});
