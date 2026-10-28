# DIONER Keyboardist

**Soar above every key.**

An Android-first mobile app for keyboardists, singers and worship teams. Built with Expo SDK 58, React Native 0.88,
TypeScript (strict) and Expo Router. It works fully offline in guest mode; no account is needed.

## Features

- **Live Keys:** estimates the song key from the microphone using YIN pitch tracking, FFT chroma and
  Krumhansl–Kessler key profiles.
  - It shows the current pitch separately from the song key, with confidence and the input level.
  - It reports "not enough evidence" and "ambiguous" results honestly, flags relative major/minor ambiguity, and
    hints at, then confirms, key changes.
  - Manual key override.
  - Audio is analysed on the phone and never uploaded.
- **Songs:** search any song and a pop-up shows the key it is played in; save it to your songbook. Song keys from
  [GetSongBPM](https://getsongbpm.com), through the backend.
  - A local songbook with search, filters, tags, song numbers, original key and chord-chart sections.
  - Transposition workspace: ± semitones or pick a target key. Qualities and slash basses are kept, and spelling
    follows the target key.
  - Number-system view, and conversion from numbers such as `1-5-6-4` into chords.
  - Rewriting the saved chart in a new key requires confirmation.
- **Rehearsals:** link a song, keys and offset. Record takes with real audio (pause/resume), play back with seeking,
  rename and delete. Files stay in private app storage, and interrupted takes are recovered on next launch.
- **Learn:** beginner and experienced paths with six reading lessons (no quizzes), plus YouTube video tutorials you
  search and watch inside the app.
- **MIDI keyboard input (Android):** USB or virtual MIDI devices through a local Expo module on `android.media.midi`.
  Bluetooth LE MIDI keyboards are also supported (scan and connect). It shows the last note, velocity and held notes,
  and estimates the key of the keyboard part. It needs an installable build (EAS), not Expo Go.

See [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) for per-feature status and evidence.

## Python backend (videos and song keys)

`backend/` is a FastAPI service that searches YouTube tutorials for the Learn tab and song keys
([GetSongBPM](https://getsongbpm.com)) for the Songs tab. The API keys stay on the server. Setup and deployment are in
[backend/README.md](backend/README.md). The app uses it when `EXPO_PUBLIC_API_URL` is set.

## Optional cloud backup

Supabase accounts and sync: sign up or in, back up the library, sync between phones, and optionally back up
recording audio to a private bucket. To enable it, follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md); without
it the app stays in guest mode.

## Getting started

Requires Node.js 22.5+ (the tests use `node:sqlite`) and npm.

```bash
npm install
```

```bash
npm start
```

Then press `a` for an Android device or emulator, or scan the QR code with Expo Go. For a native development build,
see [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run android:build` | Local native build (`expo run:android`; needs the Android SDK) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` (ESLint, Expo config) |
| `npm run format:check` / `npm run format` | Prettier |
| `npm test` | All Jest tests |
| `npm run test:unit` | Unit tests (theory, audio engine, learning, components) |
| `npm run test:integration` | Persistence tests on real SQLite |
| `npm run doctor` | `expo-doctor` |

## Environment

Copy `.env.example` to `.env` and fill in your Supabase project URL and publishable key to enable cloud features. See
[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Documentation

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md), covering the audio pipeline, music-theory spelling rules and storage
- [Design system](docs/DESIGN_SYSTEM.md)
- [Testing](docs/TESTING.md), with actual results
- [Security](docs/SECURITY.md)
- [Android build](docs/ANDROID_BUILD.md)

## Troubleshooting

- **Blank web preview or SQLite errors on web:** `metro.config.js` must keep the `.wasm` asset extension and the
  COEP/COOP headers. Web is only a preview target.
- **The microphone never starts:** check the app's microphone permission in Android settings. The Input settings
  screen shows the current status.
- **Persistence tests fail with "node:sqlite not found":** use Node 22.5 or newer.

## Known limitations

- Key-detection accuracy has been measured only on synthetic fixtures (24/24 keys). Real-microphone accuracy and
  on-device latency are unmeasured.
- Analysis runs on the JavaScript thread (about 2 ms per 150 ms hop in Node); performance on low-end phones is
  unverified.

## Credits

- Song keys and tempos: [GetSongBPM](https://getsongbpm.com).
- Video tutorials: YouTube, played with YouTube's embedded player.
