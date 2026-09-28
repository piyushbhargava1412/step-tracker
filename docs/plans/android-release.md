# Android Release Notes

> Owner-facing reference for building, signing, installing and testing the Android app
> (ST-017 → ST-022). Keep it updated as later slices add OAuth client IDs and Play Console steps.

## Fixed identifiers

| What | Value | Why it's fixed |
|------|-------|----------------|
| Application ID | `com.piyushbhargava.steptracker` | Android keys the installed app **and its private storage** (the IndexedDB the app lives in) to it. Changing it = a new app with empty storage. Also the Play Store link and the Health Connect permission grant. |
| Release signing key | alias `step-tracker` in `step-tracker-release.jks` | Every update must be signed with the same key. A lost key means the installed app can't be updated, only uninstalled — and uninstalling deletes its data. |

## Prerequisites

- **Android Studio** (includes the SDK at `~/Library/Android/sdk`).
- **JDK 21 installed.** `android/gradle/gradle-daemon-jvm.properties` pins the Gradle daemon to
  Java 21 whatever the shell's default Java is: Gradle 8.14 can't compile the Health plugin's
  build script on JDK 25 ("Unsupported class file major version 69"). Gradle finds an installed
  JDK 21 automatically (e.g. Temurin 21 under `~/Library/Java/JavaVirtualMachines`).
- **SDK location**, once per machine: `android/local.properties` (gitignored) containing
  `sdk.dir=/Users/<you>/Library/Android/sdk`. Android Studio writes it when it opens the project.
- **Health Connect on the test phone.** Built in on Android 14+; on Android 8–13 install it from
  the Play Store (the app's Connect button links there). Minimum Android version: 8.0 (API 26).

## Building

| Command | What it does |
|---------|--------------|
| `npm run build:native` | Web build for the app (`vite --mode native`: no PWA manifest; `main.js` never registers the service worker in the app) |
| `npm run cap:sync` | `build:native`, then copy the web build and plugins into `android/` |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:run` | `cap:sync`, then build, install and launch on a connected phone or emulator |
| `npm run android:assets` | Regenerate launcher icons and splash images from `public/icons/icon-512.png` |

Debug APK from the command line (after `npm run cap:sync`):

```bash
cd android && ./gradlew assembleDebug
```

Install on a phone (USB debugging on) or a running emulator, keeping the app's data:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Never uninstall to "fix" an install problem without a fresh backup first — uninstalling deletes
the app's storage.

## Health permissions

The app reads **steps** and **distance**, plus **history** (data older than 30 days). The health
plugin's own manifest declares read *and write* access to ~25 data types; the app manifest strips
every one it doesn't use (`tools:node="remove"`), guarded by `scripts/android-manifest.test.js`.
Check a built APK with:

```bash
$ANDROID_HOME/build-tools/36.0.0/aapt dump permissions android/app/build/outputs/apk/debug/app-debug.apk | grep health
```

Expected: exactly `READ_STEPS`, `READ_DISTANCE`, `READ_HEALTH_DATA_HISTORY`.

## Release signing key (one-time)

1. Generate the key **outside the repo**; `keytool` asks for passwords interactively — save them in
   your password manager first:
   ```bash
   mkdir -p ~/keys
   keytool -genkeypair -v -keystore ~/keys/step-tracker-release.jks \
     -alias step-tracker -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Tell Gradle where it is, in `~/.gradle/gradle.properties` (your home folder, **not** the repo):
   ```properties
   ST_RELEASE_STORE_FILE=/Users/<you>/keys/step-tracker-release.jks
   ST_RELEASE_STORE_PASSWORD=...
   ST_RELEASE_KEY_ALIAS=step-tracker
   ST_RELEASE_KEY_PASSWORD=...
   ```
3. **Back it up now**: the `.jks` and both passwords in your password manager, plus one offline copy.
4. Signed release APK: `cd android && ./gradlew assembleRelease`. Without the properties, release
   builds are simply unsigned.

`*.jks` and `*.keystore` are gitignored as a safety net.

## Google sign-in for Drive (ST-020)

The app signs in to Google natively (Android Credential Manager via
`@capgo/capacitor-social-login`), only for Drive backup (`drive.appdata`). All OAuth clients live
in the **same Google Cloud project** as the web client, so the app and the PWA share one Drive
`appDataFolder`:

| OAuth client | Type | Used as |
|--------------|------|---------|
| Step Tracker (web) | Web application, id `165394338348-…` | `VITE_CLIENT_ID`; also the app's `webClientId` (token audience) |
| Step Tracker Android (debug) | Android: `com.piyushbhargava.steptracker`, SHA-1 `5B:61:F8:96:16:51:D6:A9:0F:07:90:40:49:5B:1F:36:63:0C:F2:49` | Not referenced in code; lets debug builds from this Mac sign in |
| Step Tracker Android (release) | Android: same package, SHA-1 `C4:50:55:1B:D6:1E:81:B6:5F:69:2B:65:E1:1D:93:1E:E4:57:0C:CF` | Not referenced in code; lets release builds sign in |

Create Android clients at [console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients)
→ **Create client** → **Android**. One SHA-1 per client, so debug and release need one each. While
the consent screen is in **Testing**, every signing-in account must be under **Audience → Test users**.

Fingerprints without handling any password:

```bash
cd android && ./gradlew :app:signingReport
```

Scoped sign-in needs `MainActivity` to forward Google's consent result to the plugin (guarded by
`scripts/android-main-activity.test.js`); without it the plugin fails with *"You CANNOT use scopes
without modifying the main activity"*. If sign-in fails, filter Logcat for `GoogleProvider`: it logs
the package and signing SHA-1 it presented.

## Primary device (ST-020)

Drive keeps one backup file and every upload replaces it. Exactly one installation — normally the
phone — is the **primary device**: only it uploads automatically; others ask before a manual upload.
In the app: Backup tab → **Connect Google Drive** → **Make this the primary device** (uploads at
once, recording the primary in the backup and in the Drive file's metadata). The PWA reads that
metadata before every automatic upload and stops. A reinstalled app or a new phone is a new device:
make it primary again.

## Moving your history into the app

Health Connect only knows data written to it; Google Fit history before that lives in this app's
IndexedDB and Drive backup. Until native Drive sign-in lands (ST-020), move it with a file:

1. PWA → Backup tab → **Export Backup** (JSON).
2. Copy the file to the phone.
3. App → Backup tab → **Restore from Local File** — ideally *before* the first **Connect Health
   Connect**, so the first sync is a quick incremental one instead of a full backfill. Restoring
   later also works: restore overwrites the same days with the backed-up values.

Exports in the app are saved to `Documents/Step Tracker/` on the phone.

## Testing on an emulator

- Use an image **with Play Store** (Health Connect is built in on API 34+).
- Health Connect starts empty. To seed test data, temporarily add
  `android/app/src/debug/AndroidManifest.xml` re-declaring `WRITE_STEPS`/`WRITE_DISTANCE` with
  `tools:node="replace"` (never commit it), grant write access **through Health Connect's own
  permission screen**, and write samples with `Capacitor.Plugins.Health.saveSample(...)` from
  Chrome DevTools (`adb forward tcp:9229 localabstract:webview_devtools_remote_<pid>`).
- **Source priority matters.** Health Connect aggregates only count apps on the user's priority
  list for a data type (that is how it avoids double-counting a phone and a watch). An app joins
  the list when write access is granted in Health Connect's UI — a write permission granted with
  `adb shell pm grant` is *not* enough, and its samples are silently left out of aggregates. The
  app therefore shows the same de-duplicated totals as the Health Connect app itself.
- **Protect your real Drive backup while testing** with your own account: switch off *Automatically
  back up to Drive* in the emulator app before connecting (a restore can switch it back on — check
  again), and never tap Back Up / Make primary. For a hard guarantee, block writes via DevTools'
  `Fetch.enable` on `*googleapis.com/*`, failing every method except GET/HEAD/OPTIONS (the CORS
  preflight must pass or authorised reads fail).
- `assembleRelease` prints Kotlin "incompatible version" errors from the release **lint** step (its
  analyser predates the plugins' Kotlin 2.4 metadata); the build still succeeds.
- If installs hang, check the emulator's load (`adb shell uptime`); a runaway WebView in another
  app can starve it. `adb emu kill` + a cold boot (`emulator -avd <name> -no-snapshot-load`) fixes it.
