import type { AttributionForNightOutput } from "@kip/shared/attribution";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import { clock, NO_WAKE_UPS, spikeLine, TRACK_CAPTION, wakeLine } from "../copy";
import { epochSeconds, fractionAlong, marksFromAttribution } from "../marks";

const MARK = 12;

/**
 * Wake-ups from `attribution.forNight`, and the spikes those wake-ups followed.
 * A filled diamond followed a spike. A square is that spike. Hollow diamonds did not.
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
  const x = (t: number) => fractionAlong(t, start, end) * width;
  const spikeById = new Map(marks.spikes.map((spike) => [spike.id, spike]));

  return (
    <View style={styles.block}>
      <Text variant="caption">{TRACK_CAPTION}</Text>
      <View
        accessibilityLabel={`${marks.wakeUps.length} wake-ups`}
        onLayout={onLayout}
        style={[styles.track, { backgroundColor: colors.background, borderColor: colors.border }]}
      >
        {width > 0 &&
          marks.wakeUps.map((wake) => {
            const spike = wake.linkedEventId ? spikeById.get(wake.linkedEventId) : undefined;
            if (!spike) return null;
            const from = x(spike.t);
            const to = x(wake.t);
            const left = Math.min(from, to);
            const lineWidth = Math.abs(to - from);
            if (lineWidth <= 0) return null;
            return (
              <View
                key={`${wake.t}-${wake.source}-link`}
                style={[styles.link, { left, width: lineWidth, backgroundColor: colors.accent }]}
              />
            );
          })}
        {width > 0 &&
          marks.spikes.map((spike) => (
            <View
              key={spike.id}
              style={[
                styles.spike,
                {
                  left: x(spike.t) - 4,
                  backgroundColor: colors.accent,
                  borderColor: colors.accent,
                },
              ]}
            />
          ))}
        {width > 0 &&
          marks.wakeUps.map((wake) => {
            const linked = wake.linkedEventId !== null;
            return (
              <View
                key={`${wake.t}-${wake.source}`}
                style={[
                  styles.wake,
                  {
                    left: x(wake.t) - MARK / 2,
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
  track: { height: 32, borderWidth: 1, borderRadius: radius.sm },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  link: { position: "absolute", top: 16, height: 1 },
  spike: {
    position: "absolute",
    top: 12,
    width: 8,
    height: 8,
    borderWidth: 1,
  },
  wake: {
    position: "absolute",
    top: 10,
    width: MARK,
    height: MARK,
    borderWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
  list: { gap: space.sm },
  item: { gap: space.xs },
});
