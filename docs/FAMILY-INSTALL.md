# Family install guide

## Android (no expiry)

1. Copy `dist/unwavering-band-debug.apk` (or rebuild with
   `npm run mobile:android:build`) to the phone.
2. On the phone: allow Install unknown apps for Files/Drive.
3. Open the APK and install.
4. Sign in → Settings → **Share where you are** → grant **Allow all the time**
   when Android asks for background location.
5. Confirm a persistent notification: “Sharing your location in the background”.

Rebuild:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd "C:\AI Projects\Projects\unwavering-band"
npx cap sync android
cd android
.\gradlew.bat assembleDebug
copy app\build\outputs\apk\debug\app-debug.apk ..\dist\unwavering-band-debug.apk
```

For Play internal testing, configure `android/keystore.properties` and run
`.\gradlew.bat bundleRelease`.

## iOS TestFlight (90 days per build)

Must run on a Mac with Xcode, Apple team **`2J69KHU242`**.

1. App Store Connect → New App → bundle id `com.johnnyoutlaw.unwaveringband`.
2. On Mac:

```bash
cd "/path/to/unwavering-band"
npm install
npx cap sync ios
npx cap open ios
```

3. Xcode: select team Johnny Outlaw LLC (`2J69KHU242`), automatic signing.
4. Bump `CURRENT_PROJECT_VERSION`, Product → Archive → Distribute App →
   App Store Connect.
5. TestFlight → add family as Internal Testers → install from TestFlight app.
6. On device: Settings → Share where you are → set Location to **Always**.

When the build ages out (~90 days), archive and upload a new build.

See also [`NATIVE.md`](./NATIVE.md) and Shutterfield’s
`docs/IOS_RELEASE.md` for the same Apple team pitfalls.
