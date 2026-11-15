import type { AttributionForNightOutput } from "@kip/shared/attribution";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Button, Card, Screen, Text } from "@/lib/ui";
import { AttributionSummary, WakeMarkers } from "../components";
import { LOAD_ERROR, LOADING, METHOD, SIMULATED_NIGHT, TITLE, TRY_AGAIN } from "../copy";
import { DEMO_NIGHT_ID, demoAttribution, demoEvents, demoWindow } from "../data/demo";

type Ready = {
  kind: "ready";
  result: AttributionForNightOutput;
  startedAt: string;
  endedAt: string;
  events: readonly { id: string; t: number }[];
  simulated: boolean;
};

type State = { kind: "loading" } | { kind: "error"; retry: () => void } | Ready;

const isStub = (error: unknown) =>
  (error as { data?: { code?: string } } | null)?.data?.code === "NOT_IMPLEMENTED";

/**
 * Latest night's `attribution.forNight` result. Marks never come from the
 * timeline document's hand-placed wake-ups. A missing API shows the captured
 * result for the shared night upload, labelled simulated.
 */
function useAttributionNight(): State {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.night.list.queryOptions(), retry: false });
  const latest = list.data
    ?.slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.nightId;
  const night = useQuery({
    ...trpc.night.get.queryOptions({ nightId: latest ?? DEMO_NIGHT_ID }),
    enabled: latest !== undefined,
    retry: false,
  });
  const attributed = useQuery({
    ...trpc.attribution.forNight.queryOptions({ nightId: latest ?? DEMO_NIGHT_ID }),
    enabled: latest !== undefined,
    retry: false,
  });

  if (list.isPending || (latest !== undefined && (night.isPending || attributed.isPending))) {
    return { kind: "loading" };
  }
  if (latest !== undefined) {
    if (night.data && attributed.data) {
      return {
        kind: "ready",
        simulated: false,
        result: attributed.data,
        startedAt: night.data.startedAt,
        endedAt: night.data.endedAt,
        events: night.data.events.map((event) => ({ id: event.id, t: event.t })),
      };
    }
    return {
      kind: "error",
      retry: () => {
        void night.refetch();
        void attributed.refetch();
      },
    };
  }
  if (list.isError && !isStub(list.error)) {
    return { kind: "error", retry: () => void list.refetch() };
  }
  return {
    kind: "ready",
    simulated: true,
    result: demoAttribution,
    startedAt: demoWindow.startedAt,
    endedAt: demoWindow.endedAt,
    events: demoEvents,
  };
}

// Not routed yet. The night tab still draws its own timeline wake-ups.
export function AttributionScreen() {
  const state = useAttributionNight();
  return (
    <Screen>
      <Text variant="title">{TITLE}</Text>
      <Text variant="caption">{METHOD}</Text>
      {state.kind === "loading" && <Text variant="caption">{LOADING}</Text>}
      {state.kind === "error" && (
        <Card>
          <Text>{LOAD_ERROR}</Text>
          <Button label={TRY_AGAIN} onPress={state.retry} />
        </Card>
      )}
      {state.kind === "ready" && (
        <>
          {state.simulated ? <Text variant="caption">{SIMULATED_NIGHT}</Text> : null}
          <Card>
            <AttributionSummary result={state.result} />
            <WakeMarkers
              startedAt={state.startedAt}
              endedAt={state.endedAt}
              result={state.result}
              events={state.events}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
