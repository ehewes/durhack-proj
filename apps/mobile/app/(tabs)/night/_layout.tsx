import { Stack } from "expo-router";
import { useLargeTitleOptions } from "@/lib/ui";

// The Night tab is a native stack so it gets an iOS large title that collapses on scroll.
export default function NightLayout() {
  const options = useLargeTitleOptions("Last night");
  return <Stack screenOptions={options} />;
}
