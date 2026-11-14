import { Screen, Text } from "@/lib/ui";

// Not routed yet: `works` mostly renders inside other features' screens.
export function WorksScreen() {
  return (
    <Screen>
      <Text variant="title">Roadworks</Text>
      <Text>Street and road works permits near you, with night work flagged.</Text>
    </Screen>
  );
}
