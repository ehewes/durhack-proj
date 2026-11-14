import { NativeTabs } from "expo-router/native-tabs";
import { useColors } from "@/lib/ui";

// iOS tab bar: the native UITabBar, which iOS 26 and later draw in Liquid Glass over the content.
// The web dashboard keeps the JS tabs in _layout.tsx, so keep both tab lists in step.
const TABS = [
  { name: "index", label: "Map", icon: "map", selectedIcon: "map.fill" },
  { name: "night", label: "Night", icon: "moon.zzz", selectedIcon: "moon.zzz.fill" },
  { name: "stays", label: "Stays", icon: "bed.double", selectedIcon: "bed.double.fill" },
  {
    name: "account",
    label: "Account",
    icon: "person.crop.circle",
    selectedIcon: "person.crop.circle.fill",
  },
] as const;

export default function TabsLayout() {
  const colors = useColors();
  return (
    <NativeTabs tintColor={colors.accent}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: tab.icon, selected: tab.selectedIcon }} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
