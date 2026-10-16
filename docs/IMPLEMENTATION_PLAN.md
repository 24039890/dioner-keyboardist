# DIONER Keyboardist — Implementation Plan

## Repository findings (2026-10-16)

- `D:\dioner` contains an unrelated product (Ndove Shisanyama ordering system). By the
  owner's decision this app lives in its own sibling repository, `D:\dioner-keyboardist`.
- The project was scaffolded with `create-expo-app` (`blank-typescript` template).
  - Expo SDK **58.0.12**, React Native **0.88.0**, React **19.3.0**, TypeScript **6.0**.
  - Package manager: **npm** (`package-lock.json`).
- The UI reference is a Vite/React web prototype (`App.tsx` + `index.css`) supplied by the
  owner. It was used as the **visual design reference only**. None of its demo data, fake
  timers or hard-coded pitches were carried over.
- Environment: Node 24.18.1, npm 11.16, Windows 11. **No Android SDK (`ANDROID_HOME`
  unset, no `adb`) and no physical device are available.** Native builds cannot be run here.

## Architecture

- **Expo Router** with routes in `src/app/`. Non-route code is in `src/`.
- **Feature folders**: `src/features/{music-theory,live-keys,songs,rehearsals,learning}`.
- **Pure engines** (no React, no Expo imports):
  - `src/features/music-theory`: pitch classes, keys, chords, number system and transposition.
  - `src/features/live-keys/engine`: DSP (preprocessing, signal quality, YIN pitch, FFT
    chroma) and key estimation.
- **Persistence**: `expo-sqlite` through a narrow `Db` interface (`src/db/types.ts`).
  - Repositories depend only on that interface, so they are tested against Node's built-in
    `node:sqlite` in Jest.
- **Audio files**: stored with `expo-file-system` in `Paths.document/Audio`. SQLite stores
  metadata only.
- **State**: React state plus small hooks. There is no global store, because the app has no
  cross-screen state that needs one.

## Dependency decisions

| Need | Choice | Why |
| --- | --- | --- |
| Routing | `expo-router` 58 | First-party, matches the SDK |
| Local DB | `expo-sqlite` 58 | First-party, works in Expo Go |
| Live PCM capture | `expo-audio` 58 `useAudioStream` | First-party raw float32 PCM; no third-party DSP library needed |
| Recording / playback | `expo-audio` `useAudioRecorder` / `useAudioPlayer` | First-party, replaces deprecated `expo-av` |
| Files | `expo-file-system` (`File`/`Directory`/`Paths`) | First-party |
| IDs | `expo-crypto` `randomUUID` | First-party; UUIDs are stable for later Supabase sync |
| Tests | `jest-expo` + Jest 29 | Expo-recommended |

The following **external integrations are deliberately NOT added yet**. The owner asked to be
consulted before any of them is integrated:

- **Supabase** (Auth, Postgres, Storage) for optional cloud sync.
- ~~Native MIDI module~~: approved; implemented as the local module `modules/dioner-midi`.
- **Video tutorial provider** (for example the YouTube Data API, which needs an API key).

## Audio-analysis strategy

1. Capture: `useAudioStream`, mono float32. 16 kHz is requested; whatever rate the hardware
   actually delivers is resampled.
2. Preprocess: DC removal, then resample to 16 kHz with a box low-pass filter.
3. Signal quality: RMS, peak, clipping ratio and a silence gate.
4. Pitch: YIN (cumulative mean normalised difference) with a confidence of 1 − d′(τ).
5. Harmony: FFT magnitude spectrum folded into a 12-bin chroma (100–2000 Hz). This captures
   accompaniment, which a monophonic pitch tracker cannot.
6. Key: chroma and pitch evidence are accumulated in an exponentially decaying histogram (a
   long window plus a short window). The histogram is correlated against 24 rotated
   Krumhansl–Kessler profiles.
   - Confidence comes from the correlation and the margin between the best and second-best key.
   - Relative major/minor ambiguity is flagged.
   - The result is **undetermined** when evidence is insufficient or ambiguous.
7. Smoothing: the displayed key only switches after a challenger has led for a sustained
   period. A short-window disagreement is reported as a *possible key change*.

## Testing strategy

- Unit tests: music theory, DSP fixtures (deterministic synthetic signals with documented
  generation) and exercise validators.
- Integration tests: repositories and migrations on real SQLite (`node:sqlite`), plus
  recording save/recovery logic with a fake file store.
- **Not possible in this environment**: physical microphone tests, MIDI hardware tests and
  Android builds.

## Known risks

- JS-thread DSP: `useAudioStream` delivers buffers to JS, so analysis runs on the JS thread
  (not the native UI thread). The per-frame cost is measured in the tests, and analysis is
  throttled to roughly 150 ms hops.
- Key estimation from a single voice is inherently ambiguous. The app reports uncertainty
  instead of guessing.
- `useAudioStream` is a new API, so behaviour differences between devices are unverified.

## Acceptance criteria

See `docs/FEATURE_STATUS.md` for per-feature status and evidence.

## Progress (2026-10-16)

- Phases A–E, G and H have been implemented, along with the engine side of F (MIDI evidence analyzer).
- Phase J QA has been run; results are in `TESTING.md`.
- Phase F (MIDI) was approved and implemented as a local Expo module on 2026-10-16 (unverified on hardware).
- Phase I (Supabase) and the video provider are **blocked pending the owner's approval** of
  those external integrations.
