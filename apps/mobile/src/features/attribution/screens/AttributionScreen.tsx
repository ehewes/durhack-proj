import { Screen, Text } from "@/lib/ui";

// Not routed yet: `attribution` mostly renders inside other features' screens.
export function AttributionScreen() {
  return (
    <Screen>
      <Text variant="title">Wake-ups</Text>
      <Text>
        Wake-ups linked to noise spikes, counted against random moments from the same night.
      </Text>
    </Screen>
  );
}
