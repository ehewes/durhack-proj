import { Screen, Text } from "@/lib/ui";

// Not routed yet: `labels` mostly renders inside other features' screens.
export function LabelsScreen() {
  return (
    <Screen>
      <Text variant="title">Noise labels</Text>
      <Text>What each spike was: construction, traffic, siren, snoring or something else.</Text>
    </Screen>
  );
}
