import type { NightTimeline } from "@kip/shared/night";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Card, Screen, Text } from "@/lib/ui";
import { NightTimelineChart, type NightTimelineSlots } from "../components";
import { fixtureNight } from "../data/fixture";

/** Latest night from `night.list` then `night.get`; the simulated fixture until those exist. */
function useNight(): { night: NightTimeline; simulated: boolean } {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.night.list.queryOptions(), retry: false });
  const latest = (list.data as { nightId: string }[] | undefined)?.[0]?.nightId;
  const get = useQuery({
    ...trpc.night.get.queryOptions({ nightId: latest ?? fixtureNight.nightId }),
    enabled: latest !== undefined,
    retry: false,
  });
  const live = get.data as NightTimeline | undefined;
  return live ? { night: live, simulated: false } : { night: fixtureNight, simulated: true };
}

export function NightScreen(slots: NightTimelineSlots) {
  const { night, simulated } = useNight();
  return (
    <Screen>
      <Text variant="title">Your night</Text>
      <Text variant="caption">
        {night.night}. Noise is in relative dB from the phone microphone, not calibrated.
        {simulated ? " Simulated night." : ""}
      </Text>
      <Card>
        <NightTimelineChart night={night} {...slots} />
      </Card>
    </Screen>
  );
}
