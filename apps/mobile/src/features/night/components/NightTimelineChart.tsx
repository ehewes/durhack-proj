import type { NightEvent, NightTimeline, WakeUp } from "@kip/shared/night";
import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { hairline, space, Text, useColors } from "@/lib/ui";
import { NIGHT_COPY } from "../copy";
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

/**
 * The night's chart: stage band, noise line and optional wake-ups on one time axis, then a stage
 * legend. With `showList`, the spikes and wake-ups follow as rows.
 */
export function NightTimelineChart({
  night,
  renderEventChip,
  renderWakeUpLink,
  showWakeUps = true,
  showList = true,
}: {
  night: NightTimeline;
  /** False when the caller draws wake-ups from `attribution.forNight` instead. */
  showWakeUps?: boolean;
  /** False when the caller lists the spikes itself (see `NightEventRows`). */
  showList?: boolean;
} & NightTimelineSlots) {
  const colors = useColors();
  const fills = useStageColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const scale = makeScale(night, width, NOISE_HEIGHT);
  const start = Date.parse(night.startedAt) / 1000;
  const end = Date.parse(night.endedAt) / 1000;

  return (
    <View style={styles.root}>
      <View onLayout={onLayout} style={styles.chart}>
        {width > 0 && (
          <>
            <Text variant="caption">{NIGHT_COPY.stagesCaption}</Text>
            <StageBand stages={night.stages} scale={scale} />
            <Text variant="caption">{NIGHT_COPY.noiseCaption}</Text>
            <NoiseLine night={night} scale={scale} height={NOISE_HEIGHT} />
            {showWakeUps && (
              <>
                <Text variant="caption">{NIGHT_COPY.wakeCaption}</Text>
                <WakeUpRow wakeUps={night.wakeUps} scale={scale} />
              </>
            )}
            <View style={styles.axis}>
              <Text variant="caption2" tone="secondary" numeric>
                {clock(start)}
              </Text>
              <Text variant="caption2" tone="secondary" numeric>
                {clock((start + end) / 2)}
              </Text>
              <Text variant="caption2" tone="secondary" numeric>
                {clock(end)}
              </Text>
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
            <Text variant="caption">{STAGE_LABELS[s]}</Text>
          </View>
        ))}
      </View>

      {showList && (
        <NightEventRows
          night={night}
          showWakeUps={showWakeUps}
          renderEventChip={renderEventChip}
          renderWakeUpLink={renderWakeUpLink}
        />
      )}
    </View>
  );
}

/** The night's spikes (and wake-ups) as rows with hairline separators, newest last. */
export function NightEventRows({
  night,
  showWakeUps = true,
  renderEventChip,
  renderWakeUpLink,
}: { night: NightTimeline; showWakeUps?: boolean } & NightTimelineSlots) {
  const colors = useColors();
  const eventById = new Map(night.events.map((e) => [e.id, e]));
  const rows: { key: string; time: string; text: string; accessory: ReactNode }[] = [
    ...night.events.map((e) => ({
      key: e.id,
      time: clock(e.t),
      text: `Spike, ${Math.round(e.peakDb)} relative dB`,
      accessory: renderEventChip?.(e),
    })),
    ...(showWakeUps ? night.wakeUps : []).map((w) => ({
      key: `${w.t}-${w.source}`,
      time: clock(w.t),
      text: `Wake-up${w.linkedEventId ? ", followed a spike" : ""}`,
      accessory: renderWakeUpLink?.(
        w,
        w.linkedEventId ? (eventById.get(w.linkedEventId) ?? null) : null,
      ),
    })),
  ];
  if (rows.length === 0) return <Text variant="subheadline">{NIGHT_COPY.noSpikes}</Text>;
  return (
    <View>
      {rows.map((row, i) => (
        <View
          key={row.key}
          style={[
            styles.item,
            i > 0 && { borderTopWidth: hairline, borderTopColor: colors.separator },
          ]}
        >
          <Text variant="subheadline" numeric style={styles.time}>
            {row.time}
          </Text>
          <Text variant="subheadline" style={styles.itemText}>
            {row.text}
          </Text>
          {row.accessory}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  chart: { gap: space.sm },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  legend: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: hairline },
  item: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  time: { width: 48 },
  itemText: { flex: 1 },
});
