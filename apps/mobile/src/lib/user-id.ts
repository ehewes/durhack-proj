import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";

const KEY = "kip.userId";
let pending: Promise<string> | undefined;

/**
 * The anonymous user ID sent as `x-kip-user`: generated on first launch, then persisted
 * (AsyncStorage on iOS, localStorage on web). Falls back to a per-session ID if storage fails.
 */
export function getUserId(): Promise<string> {
  pending ??= (async () => {
    try {
      const existing = await AsyncStorage.getItem(KEY);
      if (existing) return existing;
      const id = randomUUID();
      await AsyncStorage.setItem(KEY, id);
      return id;
    } catch {
      return randomUUID();
    }
  })();
  return pending;
}
