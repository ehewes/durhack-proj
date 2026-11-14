import { Tabs } from "expo-router";
import { useColors } from "@/lib/ui";

// Written in M0 with every tab stubbed. Adding a tab is a `platform` issue.
export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "City" }} />
      <Tabs.Screen name="night" options={{ title: "Night" }} />
      <Tabs.Screen name="stays" options={{ title: "Stays" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
