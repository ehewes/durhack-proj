import type { AttributionForNightOutput } from "@kip/shared/attribution";
import type { NightTimeline } from "@kip/shared/night";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Button, Card, Screen, Text } from "@/lib/ui";
import { AttributionSummary, WakeMarkers } from "../../attribution";
import { LabelChip } from "../../labels";
import { NightTimelineChart } from "../components";
import { WatchNightCard } from "../components/WatchNightCard";
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
    <Screen>
      <Text variant="title">Your night</Text>
      {state.kind === "loading" && <Text variant="caption">Loading your night.</Text>}
      {state.kind === "error" && (
        <Card>
          <Text>We could not load your night.</Text>
          <Button label="Try again" onPress={state.retry} />
        </Card>
      )}
      {state.kind === "night" && (
        <>
          <Text variant="caption">
            {state.night.night}. Noise is in relative dB from the phone microphone, not calibrated.
            {state.simulated ? " Simulated night." : ""}
          </Text>
          <Card>
            <NightTimelineChart
              night={state.night}
              showWakeUps={false}
              renderEventChip={(event) => <LabelChip label={event.label} />}
            />
            {state.attribution && (
              <>
                <AttributionSummary result={state.attribution} />
                <WakeMarkers
                  startedAt={state.night.startedAt}
                  endedAt={state.night.endedAt}
                  result={state.attribution}
                  events={state.night.events}
                />
              </>
            )}
          </Card>
        </>
      )}
      <WatchNightCard />
    </Screen>
  );
}
