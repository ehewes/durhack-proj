# Kip app

One Expo app builds the iPhone app and the web dashboard (`docs/ARCHITECTURE.md`). Expo Go cannot
run it: HealthKit, background audio and the Mapbox SDK need a dev client build.

## Run on the iOS simulator

Needs Xcode with an iOS simulator runtime, and CocoaPods (`brew install cocoapods`).

1. Copy `.env.example` to `.env` at the repo root and fill in `EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN`
   (see Mapbox below). The app stops at launch without `EXPO_PUBLIC_API_URL`, and without the token
   the map shows a message instead of Newcastle. A teammate can pull the token from the repo's
   Actions variables: `gh variable get EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN`.
2. If `xcode-select -p` prints `/Library/Developer/CommandLineTools`, point the build at Xcode:
   `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
3. Start a simulator. On Xcode 27 it lives in DeviceHub, not Simulator.app.
4. Build and install the dev client. `apps/mobile/ios/` is generated and gitignored.

   ```sh
   bun install
   cd apps/mobile && bunx expo run:ios --no-bundler
   ```

5. Start Metro from the repo root so it reads `.env`, then open the server in the dev client:

   ```sh
   bun run dev:app
   ```

Repeat step 4 only after changing `app.config.ts` or a native package. For JS or `.env` changes,
restart Metro (step 5) and reload.

## Mapbox

The iPhone map uses `@rnmapbox/maps` (Mapbox Maps SDK for iOS) behind `src/lib/map`. It draws the
same `light-v11` style and overlay layers as the web map.

- **Runtime token:** create a public `pk.` token in your Mapbox account with the default public
  scopes and no URL restriction. Store it as `EXPO_PUBLIC_MAPBOX_MOBILE_TOKEN` in `.env`. Keep it
  separate from the web token (`EXPO_PUBLIC_MAPBOX_TOKEN`), so the web token's URL restrictions
  never block the phone.
- **Build credentials: none.** CocoaPods downloads the SDK without a token.
  `$RNMapboxMapsDownloadToken` is deprecated in `@rnmapbox/maps` 10.3. Do not create a secret
  `sk.` download token for this build. If a later SDK version needs one again, keep it in
  `~/.netrc` on the build Mac. Never commit it or put it in an `EXPO_PUBLIC_` variable, because
  those ship inside the app. The app refuses an `sk.` token.
- **Location:** browsing the map asks for no location permission. The map shows no user-location
  puck.
- **Attribution:** the Mapbox logo and the attribution button stay on.
