import type { AttributionForNightOutput } from "@kip/shared/attribution";
import type { NightTimeline } from "@kip/shared/night";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { useTRPC } from "@/lib/trpc";
import { Notice, Row, Screen, Section, StatusView, space } from "@/lib/ui";
import { AttributionSummary, WakeMarkers } from "../../attribution";
import { LabelChip } from "../../labels";
import { NightEventRows, NightTimelineChart } from "../components";
import { WatchNightCard } from "../components/WatchNightCard";
import { durationText, NIGHT_COPY } from "../copy";
import { fixtureAttribution, fixtureNight } from "../data/fixture";

type State =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | {
      kind: "night";
      night: NightTimeline;
      attribution: AttributionForNightOutput | null;
      simulated: boolean;
    };

const isStub = (e: unknown) =>
  (e as { data?: { code?: string } } | null)?.data?.code === "NOT_IMPLEMENTED";

/** Latest night from `night.list` then `night.get`. A NOT_IMPLEMENTED backend shows the simulated fixture. */
function useNight(): State {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.night.list.queryOptions(), retry: false });
  const nights = list.data as { nightId: string; startedAt: string }[] | undefined;
  const latest = nights?.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.nightId;
  const get = useQuery({
    ...trpc.night.get.queryOptions({ nightId: latest ?? fixtureNight.nightId }),
    enabled: latest !== undefined,
    retry: false,
  });
  const attributed = useQuery({
    ...trpc.attribution.forNight.queryOptions({ nightId: latest ?? fixtureNight.nightId }),
    enabled: latest !== undefined,
    retry: false,
  });
  if (list.isPending || (latest !== undefined && get.isPending)) return { kind: "loading" };
  const live = get.data as NightTimeline | undefined;
  if (live) {
    return {
      kind: "night",
      night: live,
      attribution: (attributed.data as AttributionForNightOutput | undefined) ?? null,
      simulated: false,
    };
  }
  if (list.isError && !isStub(list.error)) {
    return { kind: "error", retry: () => void list.refetch() };
  }
  if (get.isError && !isStub(get.error)) {
    return { kind: "error", retry: () => void get.refetch() };
  }
  return { kind: "night", night: fixtureNight, attribution: fixtureAttribution, simulated: true };
}

export function NightScreen() {
  const state = useNight();
  return (
    <Screen underHeader>
      {state.kind === "loading" && <StatusView kind="loading" message={NIGHT_COPY.loading} />}
      {state.kind === "error" && (
        <Section>
          <View style={styles.pad}>
            <StatusView
              kind="error"
              message={NIGHT_COPY.error}
              retryLabel={NIGHT_COPY.retry}
              onRetry={state.retry}
            />
          </View>
        </Section>
      )}
      {state.kind === "night" && (
        <>
          {state.simulated && <Notice message={NIGHT_COPY.simulated} icon="flask" />}
          <Section title={state.night.night}>
            <Row
              title={NIGHT_COPY.inBed}
              leading="bed.double"
              value={durationText(state.night.startedAt, state.night.endedAt)}
            />
            <Row
              title={NIGHT_COPY.spikes}
              leading="waveform"
              value={String(state.night.events.length)}
            />
            <Row
              title={NIGHT_COPY.wakeUps}
              leading="alarm"
              value={String(state.attribution?.night.wakeUps ?? state.night.wakeUps.length)}
            />
          </Section>
          <Section title={NIGHT_COPY.timelineTitle} footer={NIGHT_COPY.noiseNote} inset>
            <NightTimelineChart night={state.night} showWakeUps={false} showList={false} />
          </Section>
          {state.attribution && (
            <Section title={NIGHT_COPY.wakeTitle} inset>
              <AttributionSummary result={state.attribution} />
              <WakeMarkers
                startedAt={state.night.startedAt}
                endedAt={state.night.endedAt}
                result={state.attribution}
                events={state.night.events}
              />
            </Section>
          )}
          <Section title={NIGHT_COPY.spikesTitle} inset>
            <NightEventRows
              night={state.night}
              showWakeUps={false}
              renderEventChip={(event) => <LabelChip label={event.label} />}
            />
          </Section>
        </>
      )}
      <WatchNightCard />
    </Screen>
  );
}

const styles = StyleSheet.create({ pad: { paddingHorizontal: space.md } });
