import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useColors } from "./theme";

type Props = {
  children: ReactNode;
  /**
   * True when a native navigation header sits above the screen (large-title tabs, Live,
   * Evidence). iOS then insets the scroll view for the header and tab bar by itself.
   */
  underHeader?: boolean;
};

/**
 * A scrolling page on the grouped background. On iOS the scroll view adjusts its insets for the
 * status bar, the navigation bar and the floating tab bar, so nothing draws underneath them.
 */
export function Screen({ children, underHeader = false }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === "ios";
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        // Without a native header, iOS still adds the top safe area; web needs it by hand.
        !ios && !underHeader && { paddingTop: insets.top + space.md },
        !ios && { paddingBottom: insets.bottom + space.xl },
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.lg,
  },
});
