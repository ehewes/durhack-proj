import { Screen, Text } from "@/lib/ui";

// Not routed yet: `briefing` mostly renders inside other features' screens.
export function BriefingScreen() {
  return (
    <Screen>
      <Text variant="title">Morning briefing</Text>
      <Text>A short spoken summary of last night.</Text>
    </Screen>
  );
}
