import type { AttributionForNightOutput } from "@kip/shared/attribution";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import { clock, NO_WAKE_UPS, spikeLine, TRACK_CAPTION, trackLabel, wakeLine } from "../copy";
import { epochSeconds, fractionAlong, marksFromAttribution } from "../marks";

/** Side of a wake-up diamond before it turns 45 degrees. */
const WAKE = 12;
const SPIKE = 8;
const BORDER = 1;
/**
 * Row centres inside the track. A spike 60 to 120 seconds before a wake-up is
 * about a point away on a phone, so on one row the diamond would hide it.
 */
const SPIKE_Y = 10;
const WAKE_Y = 30;
const TRACK_HEIGHT = 44;

/**
 * Wake-ups from `attribution.forNight`, and the spikes those wake-ups followed.
 * A filled diamond followed the square above it, its spike. Hollow diamonds did not.
 */
export function WakeMarkers({
  startedAt,
  endedAt,
  result,
  events,
}: {
  startedAt: string;
  endedAt: string;
  result: Pick<AttributionForNightOutput, "wakeUps">;
  events: readonly { id: string; t: number }[];
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };
  const marks = marksFromAttribution(result, events);
  const start = epochSeconds(startedAt);
  const end = epochSeconds(endedAt);
  // Marks are placed inside the track's border.
  const inner = Math.max(0, width - 2 * BORDER);
  const x = (t: number) => fractionAlong(t, start, end) * inner;
  const spikeById = new Map(marks.spikes.map((spike) => [spike.id, spike]));
  const followed = marks.wakeUps.filter((wake) => wake.linkedEventId !== null).length;

  return (
    <View style={styles.block}>
      <Text variant="caption">{TRACK_CAPTION}</Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={trackLabel(marks.wakeUps.length, followed)}
        onLayout={onLayout}
        style={[styles.track, { backgroundColor: colors.background, borderColor: colors.border }]}
      >
        {inner > 0 &&
          marks.wakeUps.map((wake) => {
            const spike = wake.linkedEventId ? spikeById.get(wake.linkedEventId) : undefined;
            if (!spike) return null;
            return (
              <View
                key={`${wake.t}-${wake.source}-link`}
                style={[styles.link, { left: x(spike.t) - 0.5, backgroundColor: colors.accent }]}
              />
            );
          })}
        {inner > 0 &&
          marks.spikes.map((spike) => (
            <View
              key={spike.id}
              style={[
                styles.spike,
                { left: x(spike.t) - SPIKE / 2, backgroundColor: colors.accent },
              ]}
            />
          ))}
        {inner > 0 &&
          marks.wakeUps.map((wake) => {
            const linked = wake.linkedEventId !== null;
            return (
              <View
                key={`${wake.t}-${wake.source}`}
                style={[
                  styles.wake,
                  {
                    left: x(wake.t) - WAKE / 2,
                    borderColor: linked ? colors.accent : colors.textSecondary,
                    backgroundColor: linked ? colors.accent : colors.background,
                  },
                ]}
              />
            );
          })}
      </View>
      <View style={styles.axis}>
        <Text variant="caption">{clock(start)}</Text>
        <Text variant="caption">{clock(end)}</Text>
      </View>
      {marks.wakeUps.length === 0 ? <Text>{NO_WAKE_UPS}</Text> : null}
      <View style={styles.list}>
        {marks.wakeUps.map((wake) => {
          const spike = wake.linkedEventId ? spikeById.get(wake.linkedEventId) : undefined;
          return (
            <View key={`${wake.t}-${wake.source}`} style={styles.item}>
              <Text>{wakeLine(wake)}</Text>
              {spike ? <Text variant="caption">{spikeLine(spike.t)}</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  track: {
    height: TRACK_HEIGHT + 2 * BORDER,
    borderWidth: BORDER,
    borderRadius: radius.sm,
  },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  /** From the spike down to the wake-up it preceded; the marks cover both ends. */
  link: { position: "absolute", top: SPIKE_Y, width: 1, height: WAKE_Y - SPIKE_Y },
  spike: {
    position: "absolute",
    top: SPIKE_Y - SPIKE / 2,
    width: SPIKE,
    height: SPIKE,
  },
  wake: {
    position: "absolute",
    top: WAKE_Y - WAKE / 2,
    width: WAKE,
    height: WAKE,
    borderWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
  list: { gap: space.sm },
  item: { gap: space.xs },
});
