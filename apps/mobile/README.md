# Kip mobile

Expo dev client for iOS (and a web build). HealthKit and background audio need a real iPhone: they
do not work in Expo Go or the simulator.

## What the config sets (`app.config.ts`)

- HealthKit: `@kingstinct/react-native-healthkit` adds the `com.apple.developer.healthkit`
  entitlement and `NSHealthShareUsageDescription`. Kip only reads, so `NSHealthUpdateUsageDescription`
  is `false`, `background` is `false` (no background delivery) and clinical records are not requested.
- Background audio: `UIBackgroundModes: ["audio"]` keeps metering while the phone is locked.
- Also prompted: microphone and location (when in use).

## Environment

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://kip.edenmatrix.xyz` (live), or your Mac's LAN address for a local server |

It is public and ends up in the bundle: never put a secret in an `EXPO_PUBLIC_*` variable. A phone
cannot reach `localhost`, and iOS needs HTTPS, so prefer the live URL.

## Build onto the iPhone

Needs a Mac with Xcode, an Apple ID signed in under Xcode, and the iPhone on USB with Developer
Mode on (Settings, Privacy & Security).

1. `bun install` at the repo root.
2. `cd apps/mobile`
3. `EXPO_PUBLIC_API_URL=https://kip.edenmatrix.xyz bunx expo run:ios --device`, then pick the iPhone.
4. First run: in Xcode, open `apps/mobile/ios/*.xcworkspace`, select the Kip target, Signing &
   Capabilities, choose your team and change `com.durhack.kip` if Apple rejects it. HealthKit must
   appear under capabilities.
5. On the phone: Settings, General, VPN & Device Management, trust your developer certificate.
6. Later runs: `bunx expo start --dev-client`, then open the installed Kip app.

`apps/mobile/ios/` is prebuild output and is not committed.

## Device checklist (to be run by a human)

- [ ] App launches on the iPhone and shows the tabs
- [ ] HealthKit permission sheet appears
- [ ] Microphone and location prompts appear
- [ ] With the phone locked, audio metering keeps running
- [ ] The app reaches `EXPO_PUBLIC_API_URL`

## Apple Watch signing result

TODO (human): record the result here. Stop trying at hour 2.
