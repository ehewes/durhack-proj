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
      NSLocationWhenInUseUsageDescription:
        "Kip uses your location to compare your nights with the city's noise sensors nearby.",
      // Keeps metering while the phone is locked on the nightstand
      UIBackgroundModes: ["audio"],
    },
  },
  web: { output: "single", bundler: "metro" },
  plugins: [
    "expo-router",
    "expo-status-bar",
    [
      "@kingstinct/react-native-healthkit",
      {
        NSHealthShareUsageDescription:
          "Kip reads your Apple Watch sleep stages, heart rate, HRV and breathing rate to show which noises woke you.",
        // Kip only reads health data
        NSHealthUpdateUsageDescription: false,
        background: false,
      },
    ],
    "@maplibre/maplibre-react-native",
  ],
  // The HealthKit plugin above also adds the com.apple.developer.healthkit entitlement on prebuild.
  experiments: { typedRoutes: true },
};

export default config;
