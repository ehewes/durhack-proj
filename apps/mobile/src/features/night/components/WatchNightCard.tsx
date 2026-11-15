import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Row, Section, StatusView, space, Text } from "@/lib/ui";
import { NIGHT_COPY } from "../copy";
import { useWatchNight } from "../hooks/useWatchNight";
import type { NightRead } from "../native/watch-sleep";
import { nightLabel, WATCH_COPY, watchRows, watchTitle } from "../watch-copy";
import { clock, type Scale } from "./geometry";
import { StageBand } from "./StageBand";

/** Last night's Apple Watch sleep and vitals, read from HealthKit. Nothing on the web. */
export function WatchNightCard() {
  const state = useWatchNight();
  if (state.status === "unavailable") return null;
  if (state.status === "ok") {
    return (
      <Section title={NIGHT_COPY.watchTitle} footer={WATCH_COPY.source}>
        <View style={styles.pad}>
          <Text variant="headline">{watchTitle(state)}</Text>
          <Text variant="footnote">{nightLabel(state.night)}</Text>
          {state.sleep.stages.length > 0 ? (
            <Stages read={state} />
          ) : (
            <Text variant="footnote">{WATCH_COPY.noStagesYet}</Text>
          )}
        </View>
        {watchRows(state).map((row) => (
          <Row key={row.label} title={row.label} subtitle={row.value} />
        ))}
        {/* Stages can reach Apple Health after the heart rate does. */}
        <Row
          title={WATCH_COPY.readAgain}
          tone="accent"
          leading="arrow.clockwise"
          onPress={state.retry}
        />
      </Section>
    );
  }
  return (
    <Section title={NIGHT_COPY.watchTitle}>
      <View style={styles.pad}>
        {state.status === "loading" && <StatusView kind="loading" message={WATCH_COPY.loading} />}
        {state.status === "no-consent" && (
          <StatusView kind="empty" title={WATCH_COPY.offTitle} message={WATCH_COPY.off} />
        )}
        {state.status === "no-data" && (
          <StatusView
            kind="empty"
            title={WATCH_COPY.noData}
            message={`${nightLabel(state.night)}. ${WATCH_COPY.noDataHint}`}
            actionLabel={WATCH_COPY.retry}
            onAction={state.retry}
          />
        )}
        {state.status === "error" && (
          <StatusView
            kind="error"
            message={WATCH_COPY.error}
            retryLabel={WATCH_COPY.retry}
            onRetry={state.retry}
          />
        )}
      </View>
    </Section>
  );
}

/** The night's stages on the timeline's band, from first to last reading. */
function Stages({ read }: { read: NightRead }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const start = Date.parse(read.startedAt) / 1000;
  const end = Date.parse(read.endedAt) / 1000;
  const span = end > start ? end - start : 1;
  const scale: Scale = {
    x: (t) => ((Math.min(Math.max(t, start), end) - start) / span) * width,
    y: () => 0,
  };
  return (
    <View onLayout={onLayout}>
      {width > 0 && <StageBand stages={read.sleep.stages} scale={scale} />}
      <View style={styles.axis}>
        <Text variant="caption2" tone="secondary" numeric>
          {clock(start)}
        </Text>
        <Text variant="caption2" tone="secondary" numeric>
          {clock(end)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, gap: space.xs },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: space.xs },
});
