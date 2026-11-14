import type { NightEvent, NightTimeline, WakeUp } from "@kip/shared/night";
import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { space, type, useColors } from "@/lib/ui";
import { clock, makeScale } from "./geometry";
import { NoiseLine } from "./NoiseLine";
import { STAGE_LABELS, StageBand, useStageColors } from "./StageBand";
import { WakeUpRow } from "./WakeUpRow";

export type NightTimelineSlots = {
  /** Chip for a spike, e.g. its noise label (`labels` feature). */
  renderEventChip?: (event: NightEvent) => ReactNode;
  /** Link for a wake-up, e.g. to the spike it followed (`attribution` feature). */
  renderWakeUpLink?: (wakeUp: WakeUp, linkedEvent: NightEvent | null) => ReactNode;
};

const NOISE_HEIGHT = 120;

export function NightTimelineChart({
  night,
  renderEventChip,
  renderWakeUpLink,
}: { night: NightTimeline } & NightTimelineSlots) {
  const colors = useColors();
  const fills = useStageColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const scale = makeScale(night, width, NOISE_HEIGHT);
  const start = Date.parse(night.startedAt) / 1000;
  const end = Date.parse(night.endedAt) / 1000;
  const eventById = new Map(night.events.map((e) => [e.id, e]));

  return (
    <View style={styles.root}>
      <View onLayout={onLayout} style={styles.chart}>
        {width > 0 && (
          <>
            <Caption text="Sleep stages" />
            <StageBand stages={night.stages} scale={scale} />
            <Caption text="Bedroom noise, relative dB (dots are spikes)" />
            <NoiseLine night={night} scale={scale} height={NOISE_HEIGHT} />
            <Caption text="Wake-ups" />
            <WakeUpRow wakeUps={night.wakeUps} scale={scale} />
            <View style={styles.axis}>
              <Caption text={clock(start)} />
              <Caption text={clock((start + end) / 2)} />
              <Caption text={clock(end)} />
            </View>
          </>
        )}
      </View>

      <View style={styles.legend}>
        {(["deep", "core", "rem", "awake"] as const).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View
              style={[styles.swatch, { backgroundColor: fills[s], borderColor: colors.border }]}
            />
            <Caption text={STAGE_LABELS[s]} />
          </View>
        ))}
      </View>

      <View style={styles.list}>
        {night.events.map((e) => (
          <View key={e.id} style={styles.item}>
            <Text style={[type.body, { color: colors.text }]}>
              {clock(e.t)} Spike, {Math.round(e.peakDb)} relative dB
            </Text>
            {renderEventChip?.(e)}
          </View>
        ))}
        {night.wakeUps.map((w) => (
          <View key={w.t} style={styles.item}>
            <Text style={[type.body, { color: colors.text }]}>
              {clock(w.t)} Wake-up{w.linkedEventId ? ", followed a spike" : ""}
            </Text>
            {renderWakeUpLink?.(
              w,
              w.linkedEventId ? (eventById.get(w.linkedEventId) ?? null) : null,
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function Caption({ text }: { text: string }) {
  const colors = useColors();
  return <Text style={[type.caption, { color: colors.textSecondary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  chart: { gap: space.sm },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  legend: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 12, height: 12, borderWidth: 1 },
  list: { gap: space.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
});
