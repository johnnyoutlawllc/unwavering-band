# Native apps (iOS + Android)

Capacitor shells that load **https://unwavering.band**. The web deploy is the
UI. Rebuild the binary only for native changes (plugins, Info.plist,
permissions, icons).

| Piece | Value |
|---|---|
| Bundle / application ID | `com.johnnyoutlaw.unwaveringband` |
| Apple team | `2J69KHU242` (Johnny Outlaw LLC) — not personal team `D89QH2NM22` |
| Capacitor config | [`capacitor.config.ts`](../capacitor.config.ts) |
| Background plugin | [`plugins/background-location`](../plugins/background-location) |
| JS bridge | [`src/lib/native-bridge.ts`](../src/lib/native-bridge.ts) |

## What background tracking does

1. User turns on **Share where you are** in Settings (native only).
2. App requests **Always** location permission.
3. Session JWT is stored (iOS Keychain / Android SharedPreferences).
4. Native layer writes `unwavering.visits` and updates `users.last_lat` /
   `last_lng` while backgrounded (throttled: ~60s or 50m moved).
5. Now canvas merges Realtime presence with `live_bands()` so backgrounded
   family still appear.

Live coordinates from the native tracker are plaintext on `users` (required for
peers to render). Timeline vault encryption is separate and unchanged.

Auth tokens are refreshed when the app is opened (web session sync). If
background uploads stop after many days idle, open the app once to refresh the
session.

## Expiration

| Install path | Expires? |
|---|---|
| Android APK sideload | No |
| Play internal / production | No |
| iOS TestFlight | **90 days** per build (upload a new build to refresh) |
| App Store | No |

## Android (this Windows machine)

Needs JDK (Android Studio JBR works) + Android SDK. Then:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run mobile:android:sync
cd android
.\gradlew.bat assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
# Copied for family: dist/unwavering-band-debug.apk
```

First family build was produced as a **debug APK** at
`dist/unwavering-band-debug.apk` (sideload; does not expire).

Optional release signing: copy `android/keystore.properties.example` to
`android/keystore.properties` and point `storeFile` at a local `.jks` (never
commit the keystore or passwords). Then `.\gradlew.bat assembleRelease` or
`bundleRelease` for Play.

## iOS (Mac + Xcode)

1. Create the App Store Connect app for bundle id `com.johnnyoutlaw.unwaveringband`.
2. On a Mac:

```bash
npm run mobile:ios:sync
npx cap open ios
```

3. In Xcode: Team **`2J69KHU242`**, automatic signing, bump
   `CURRENT_PROJECT_VERSION` for each upload.
4. Product → Archive → Distribute → App Store Connect → TestFlight.
5. Add family as Internal testers (or External after Beta review).

Mirror Shutterfield’s release discipline in
`C:\AI Projects\Projects\shutterfield\docs\IOS_RELEASE.md` (same Apple team,
same “never use the free Personal Team” rule).

**Sign in with Apple** is still required before a public App Store listing if
Google sign-in stays. TestFlight internal family installs can proceed first.

## npm scripts

| Script | Purpose |
|---|---|
| `npm run mobile:sync` | Sync both platforms |
| `npm run mobile:android:sync` | Sync Android only |
| `npm run mobile:android:build` | Sync + `assembleRelease` |
| `npm run mobile:ios:sync` | Sync iOS only |
| `npm run mobile:ios:open` | Open Xcode project |

## Plugin API

`BackgroundLocation` methods: `setAuthSession`, `clearAuthSession`,
`requestPermissions`, `startTracking`, `stopTracking`, `getStatus`.
