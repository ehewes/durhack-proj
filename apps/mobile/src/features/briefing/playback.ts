import { Linking } from "react-native";

/**
 * iOS: hands the clip to the system player (Safari), which plays through the
 * phone speaker or AirPods. The native module has no playback API yet.
 */
export function stopBriefing(): void {}

export async function playBriefing(src: string): Promise<void> {
  await Linking.openURL(src);
}
