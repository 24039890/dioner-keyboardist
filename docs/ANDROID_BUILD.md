# Android build and installation

## What was verified in this environment (2026-10-16)

| Step | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` (`expo lint`) | exit 0 |
| `npm run format:check` | exit 0 |
| `npx expo install --check` | "Dependencies are up to date" |
| `npx expo-doctor` | 20/20 checks passed |
| `npx expo export --platform android` | exit 0; Hermes bytecode bundle produced (~3 MB) |
| Web preview (`expo start --web`) | Screens rendered and flows exercised in a browser |
| Native Android build (`expo run:android` / EAS) | **Not run**: no Android SDK, `adb`, emulator or device on this machine |
| Physical-device test | **Not done** |

## Prerequisites

- Node.js 22.5 or newer (developed on 24.18.1; the persistence tests need `node:sqlite`) and npm.
- For local native builds: JDK 17 and the Android SDK (Android Studio), with `ANDROID_HOME` set and `adb` on `PATH`.
- Alternatively use EAS Build (cloud), which needs an Expo account: `npx eas-cli@latest build`.

## Install and run

```bash
npm install
```

```bash
npm start
```

## Which runtime to use

| Runtime | What it proves | Notes |
| --- | --- | --- |
| JS bundle export | The code compiles and bundles for Android | Verified here |
| Expo Go | UI, SQLite, recording and playback | Expo Go only bundles first-party modules. All modules used are first-party, but `useAudioStream` (new in SDK 58) should be confirmed on the Expo Go build you install |
| Development build | Production-equivalent native code | **Recommended**: `npx expo run:android` (local SDK) or `eas build --profile development` |
| Emulator | Navigation and storage | The emulator microphone is a poor test of key detection |
| Physical device | Real microphone, latency, interruptions | Required before any accuracy or latency claim |
| Release APK/AAB | Store build | `eas build -p android --profile production`, or `npx expo prebuild` then Gradle `bundleRelease` |

## Development build (local)

```bash
npx expo run:android
```

This generates `android/` (continuous native generation, git-ignored), builds and installs. Connect a device with USB
debugging enabled first (`adb devices`).

## Native configuration (from `app.json`)

- Package: `com.dioner.keyboardist`.
- Permission `RECORD_AUDIO`. External storage permissions are blocked.
- Plugins: `expo-router`, `expo-status-bar`, `expo-sqlite`, `expo-audio` (microphone text, no background recording),
  `expo-font`, `expo-asset`.
- Local module `modules/dioner-midi` (autolinked; verified with `npx expo-modules-autolinking resolve --platform
  android`). It declares `android.software.midi` as optional. **MIDI therefore requires a development or release
  build; Expo Go cannot load it.**
- To test MIDI: connect a class-compliant USB MIDI keyboard through a USB-OTG adapter, open Live Keys → MIDI keyboard,
  and tap the device.
- Icons are still the Expo template placeholders and need DIONER artwork before release.

## Database

Local SQLite migrations run automatically on app start (`src/db/migrations.ts`). No server database is used yet.

## Tests

```bash
npm test
```

`npm run test:unit` and `npm run test:integration` run the two groups separately.
