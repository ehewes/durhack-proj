import { useColors } from "./theme";

/**
 * Native stack options for a large-title page on the grouped background. The title collapses into
 * the bar on scroll; the bar has no shadow line until content scrolls under it.
 */
export function useLargeTitleOptions(title: string) {
  const colors = useColors();
  return {
    title,
    headerShown: true,
    headerLargeTitle: true,
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerTintColor: colors.accent,
    headerStyle: { backgroundColor: colors.background },
    headerLargeStyle: { backgroundColor: colors.background },
    headerTitleStyle: { color: colors.text },
    headerLargeTitleStyle: { color: colors.text },
    contentStyle: { backgroundColor: colors.background },
  } as const;
}
