import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Button, Card, space, Text } from "@/lib/ui";
import { useWatchNight } from "../hooks/useWatchNight";
import type { NightRead } from "../native/watch-sleep";
import { nightLabel, WATCH_COPY, watchRows, watchTitle } from "../watch-copy";
import { clock, type Scale } from "./geometry";
import { StageBand } from "./StageBand";

/** Last night's Apple Watch sleep and vitals, read from HealthKit. Nothing on the web. */
export function WatchNightCard() {
  const state = useWatchNight();
  if (state.status === "unavailable") return null;
  return (
    <Card>
      {state.status === "loading" && <Text variant="caption">{WATCH_COPY.loading}</Text>}
      {state.status === "no-consent" && (
        <>
          <Text>{WATCH_COPY.offTitle}</Text>
          <Text variant="caption">{WATCH_COPY.off}</Text>
        </>
      )}
      {state.status === "no-data" && (
        <>
          <Text>{WATCH_COPY.noData}</Text>
          <Text variant="caption">{nightLabel(state.night)}</Text>
          <Text variant="caption">{WATCH_COPY.noDataHint}</Text>
          <Button label={WATCH_COPY.retry} variant="secondary" onPress={state.retry} />
        </>
      )}
      {state.status === "error" && (
        <>
          <Text>{WATCH_COPY.error}</Text>
          <Button label={WATCH_COPY.retry} variant="secondary" onPress={state.retry} />
        </>
      )}
      {state.status === "ok" && (
        <>
          <WatchNight read={state} night={state.night} />
          {/* Stages can reach Apple Health after the heart rate does. */}
          <Button label={WATCH_COPY.readAgain} variant="secondary" onPress={state.retry} />
        </>
      )}
    </Card>
  );
}

function WatchNight({ read, night }: { read: NightRead; night: string }) {
  return (
    <>
      <Text>{watchTitle(read)}</Text>
      <Text variant="caption">{nightLabel(night)}</Text>
      {read.sleep.stages.length > 0 ? (
        <Stages read={read} />
      ) : (
        <Text variant="caption">{WATCH_COPY.noStagesYet}</Text>
      )}
      <View style={styles.rows}>
        {watchRows(read).map((row) => (
          <View key={row.label} style={styles.row}>
            <Text variant="caption">{row.label}</Text>
            <Text>{row.value}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption">{WATCH_COPY.source}</Text>
    </>
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
        <Text variant="caption">{clock(start)}</Text>
        <Text variant="caption">{clock(end)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: space.xs },
});
