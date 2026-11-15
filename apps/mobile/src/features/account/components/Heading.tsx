import type { ReactNode } from "react";
import { Text } from "@/lib/ui";

/** A section or card heading: the iOS headline style. */
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text variant="headline" accessibilityRole="header">
      {children}
    </Text>
  );
}
