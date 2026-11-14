import type { ExpoConfig } from "expo/config";

// Platform file: permissions, background modes and native plugins change through a `platform` issue.
const config: ExpoConfig = {
  name: "Kip",
  slug: "kip",
  scheme: "kip",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    // Placeholder: set to the team's bundle ID once the Apple developer account is ready.
    bundleIdentifier: "com.durhack.kip",
    supportsTablet: false,
    infoPlist: {
      NSMicrophoneUsageDescription:
        "Kip measures how loud your bedroom is overnight. Clips with speech never leave your phone.",
      UIBackgroundModes: ["audio"],
    },
  },
  web: { output: "single", bundler: "metro" },
  plugins: ["expo-router", "expo-status-bar"],
  experiments: { typedRoutes: true },
};

export default config;
