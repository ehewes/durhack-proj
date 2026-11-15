import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Light feedback for selection and outcomes. Web has no haptics, so these do nothing there.
const native = Platform.OS === "ios" || Platform.OS === "android";

export const haptics = {
  selection(): void {
    if (native) void Haptics.selectionAsync().catch(() => undefined);
  },
  success(): void {
    if (native) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }
  },
  warning(): void {
    if (native) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => undefined,
      );
    }
  },
};
