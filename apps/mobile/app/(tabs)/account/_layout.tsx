import { Stack } from "expo-router";
import { useLargeTitleOptions } from "@/lib/ui";

// The Account tab is a native stack so it gets an iOS large title that collapses on scroll.
export default function AccountLayout() {
  const options = useLargeTitleOptions("Account");
  return <Stack screenOptions={options} />;
}
