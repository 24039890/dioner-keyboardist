# Architecture

## Layers

```
src/app/                 Expo Router routes (screens only — thin)
src/components/          Shared UI (ui/: primitives, layout, forms; music/: KeyPicker, PianoKeys)
src/features/
  music-theory/          Pure TS: pitch classes, keys, chords, number system, transposition
  live-keys/engine/      Pure TS DSP + key estimation (no React/Expo)
  live-keys/hooks/       useLiveAnalysis: expo-audio stream → engine
  live-keys/components/  KeyPanel, PitchPanel
  songs/components/      SongForm, TranspositionWorkspace
  rehearsals/services/   Recording lifecycle rules + expo-file-system store
  learning/              Curriculum, exercise generators/validators, video-provider boundary
src/db/                  Db interface, migrations, repositories (no UI imports)
src/providers/data.tsx   SQLiteProvider + repositories + settings context
src/services/midi/       MIDI parser + input service
modules/dioner-midi/     Local Expo module (Kotlin, android.media.midi)
src/theme/tokens.ts      Design tokens
```

Dependency rule: `app → features/components → db/services → music-theory`. The engines in
`music-theory` and `live-keys/engine` import nothing from React, React Native or Expo, so they run unchanged in
Node/Jest.

## Navigation

Expo Router 58 with `src/app` as the routes root.

- Root `Stack` (headers off; each screen draws its own `ScreenHeader`).
- `(tabs)` uses `Tabs` from `expo-router/tabs` and has four tabs: `live-keys`, `songs`, `rehearsals`, `learn`.
- Secondary routes:
  - `songs/[id]`, `songs/create`, `songs/edit/[id]`
  - `rehearsals/create`, `rehearsals/[id]`, `rehearsals/record/[id]`, `rehearsals/playback/[id]`
  - `learn/[id]` (lesson), `learn/exercise/[id]`
  - `settings/index`, `settings/input`, `settings/account`
- `index.tsx` redirects to `/onboarding` on first launch and to `/live-keys` otherwise. The onboarding flag is stored
  in SQLite.
- The Android back button follows the stack. The recorder screen blocks leaving with an unsaved take
  (`usePreventRemove`).

## Music-theory engine

- Pitch classes are integers 0–11 and all arithmetic is mod 12. User-stepped offsets stay within −11..+11; ±12 wraps
  to 0.
- **Spelling strategy:**
  - Each key has one conventional tonic spelling (D♭ major, E♭ minor, F♯ major).
  - Scales are spelled letter by letter.
  - Notes outside the scale are spelled as altered degrees (♭2 ♭3 ♯4 ♭6 ♭7 in major; ♭2 ♮3 ♯4 ♮6 ♮7 in minor).
  - Double accidentals are avoided in charts. For example, G minor-style F𝄪 becomes G.
- **Chords:**
  - A chord symbol is parsed as root + suffix + optional slash bass.
  - The suffix grammar covers major, minor, dim, aug, sus2/4, power, 6, 7, maj7, m7, dim7, m7♭5/ø, mMaj7, 9/11/13,
    and add/♭/♯ alterations.
  - Transposition moves the root and bass independently and keeps the user's suffix text verbatim.
  - Symbols that can't be parsed return a structured error and are never rewritten.
- **Number system:**
  - Degrees refer to the key's own scale (major, or natural minor), so 1 is always the tonic.
  - A plain number takes the diatonic triad quality of its degree. Non-major qualities are written explicitly when
    converting chords to numbers (`6m`, `57`, `♭7`, `5M`/`5dom7` in minor). Converting a chord to a number and back
    always returns the same pitch classes; this is tested for all 24 keys.

## Audio architecture

1. **Capture.** The `useAudioStream` hook from expo-audio (SDK 58) delivers mono float32 PCM buffers to JS. 16 kHz is
   requested, and the actual rate is honoured.
2. **Preprocessing** (`preprocess.ts`). Convert to mono float, then resample to 16 kHz with a streaming box-filter low
   pass plus linear interpolation. Samples go into a ring buffer (4096 samples), and DC is removed per frame.
3. **Signal quality** (`signalQuality.ts`). Measures RMS dBFS, peak and clipping ratio, then classifies the frame as
   silent (< −55 dB), weak (< −42 dB), clipping (> 1 % of samples ≥ 0.98) or ok. Each class sets an evidence weight
   (0, 0.35, 0.5 and 1 respectively).
4. **Pitch** (`yin.ts`). YIN on a 1024-sample (64 ms) frame, 65–1100 Hz, threshold 0.15, with parabolic
   interpolation. A pitch is shown only when its confidence (1 − CMND) is at least 0.85.
5. **Harmony** (`chroma.ts`). A 4096-point Hann FFT folded into a 12-bin chroma over 100–2000 Hz. Only local spectral
   peaks above twice the local mean count (whitening), and bins between semitones are discounted.
6. **Key estimation** (`keyEstimator.ts`).
   - Evidence: the chroma (60 %) is combined with any reliable pitch (40 %) and fed into exponentially decaying
     histograms, τ = 30 s for the long window and τ = 5 s for the short one.
   - Scoring: each histogram gets a Pearson correlation against all 24 rotated Krumhansl–Kessler profiles.
   - Thresholds:
     - Below 2.5 weighted seconds of evidence the result is **insufficient**.
     - A best correlation under 0.5, or a lead under 0.02 over the next key, gives **ambiguous**.
     - Confidence is high at r ≥ 0.75 with a margin ≥ 0.08, medium at r ≥ 0.6 with a margin ≥ 0.04, and low
       otherwise.
   - Relative major/minor ambiguity is flagged.
7. **Smoothing and key change.**
   - The displayed key only switches after a long-window challenger has led for 4 s.
   - **Misfit:** the short window prefers a different key *family* (key signature) by at least 0.12. From then on,
     evidence collects in a separate "since the change began" histogram.
   - **Hint:** a *possible key change* is reported after 2 s of misfit.
   - **Confirmation** happens after 10 s, and only if that evidence fits the new key at r ≥ 0.8 and beats the old key
     by at least 0.15. Short excursions, such as a phrase resting on the dominant, therefore do not flip the key.
8. **Hop and threading.**
   - Analysis runs every 150 ms of audio.
   - The work happens in the `onBuffer` callback on the **JavaScript thread**, not the native UI thread. Measured
     cost in Node is about 2 ms per hop (see TESTING.md); cost on a device has not been measured.

**Lifecycle** (`useLiveAnalysis`):

- Permission is requested on first Start. A permanent denial offers the system-settings link.
- Pause stops capture but keeps the evidence; Stop resets it.
- Backgrounding the app pauses and releases the microphone.
- If the OS stops the stream (a call or another app taking the mic), the screen shows *interrupted*.
- On unmount the stream is stopped, and the hook releases the native object.
- **Privacy:** audio buffers are analysed in memory and dropped. Nothing is written to disk or uploaded.

## MIDI integration

**Decision.** A local Expo module (`modules/dioner-midi`) on Android's platform API `android.media.midi` (API 23+),
not a third-party library. As of 2026-10 the only maintained library was about four months old (v0.2.0); the others
were experimental or abandoned. The app only needs input, which is about 200 lines of Kotlin with no extra dependency.

| Layer | File | Role |
| --- | --- | --- |
| Native (Kotlin) | `modules/dioner-midi/android/.../DionerMidiModule.kt` | Lists devices with output ports, opens one (all its output ports), forwards **raw bytes** plus a timestamp as `onMidiData`, and emits `onDevicesChanged` and `onDeviceError` (disconnected). Uses `getDevicesForTransport` on API 33+ and `devices` before that. |
| JS binding | `modules/dioner-midi/index.ts` | `requireOptionalNativeModule('DionerMidi')`: null in Expo Go, on web, or in builds without the module |
| Parser (TS) | `src/services/midi/midiParser.ts` | MIDI 1.0 stream parser: running status, real-time bytes, SysEx, system common, velocity-0 note-off |
| Service | `src/services/midi/midiInput.ts` | `MidiInputService`; `createNativeMidiInput` (one parser per device) or `unavailableMidiInput(reason)` |
| Hook | `src/features/live-keys/hooks/useMidiAnalysis.ts` | Connect/disconnect, 150 ms `MidiKeyAnalyzer.tick`, disconnection message, release on background or when MIDI mode is left |
| UI | `MidiPanel` + `KeyPanel` | Device picker, last note and velocity, held notes, a "keyboard part, not singer" note |

- **Parsing in TypeScript.** Parsing lives in TS deliberately, so all of it is unit-tested. The Kotlin layer is kept
  minimal because it could not be compiled here.
- **Transports.** Supported: USB MIDI (USB-OTG) and virtual MIDI devices. Not supported yet: Bluetooth LE MIDI, which
  needs `openBluetoothDevice` and Bluetooth permissions.
- **Manifest.** The module declares `android.software.midi` as `required="false"`, so the app still installs on
  phones without MIDI. Those phones show "does not report MIDI support".

## Local database

- expo-sqlite (WAL mode, foreign keys on) through the narrow `Db` interface.
- Migrations are versioned with `PRAGMA user_version`. Each migration and its version bump run in one transaction.
- Tables:
  - `settings`
  - `songs` (soft delete, `sync_status`)
  - `song_sections`
  - `rehearsals` (soft delete, offset CHECK −11..11)
  - `recordings` (status `recording` | `saved` | `recovered`)
  - `lesson_progress`
- All IDs are UUID v4 (`expo-crypto`), so records stay stable for a future cloud sync.
- Queries are parameterised. User search text is escaped for `LIKE` (`%` and `_` match literally).
- Multi-step writes (song + sections) run in transactions.
- **Tests:** repositories are tested against Node's built-in `node:sqlite`, which is the real SQLite engine, not a
  mock.

## Audio file storage

- **Location.** Recordings are AAC `.m4a` files written by `useAudioRecorder` with `directory: 'document'` and
  `fileName: <recording UUID>`, which puts them in app-private document storage. They are never in a public
  directory, and SQLite stores only the metadata and URI.
- **Commit rules.**
  - A placeholder row (`status = 'recording'`) is written *before* capture starts.
  - `commitRecording` marks the take `saved` only once the file exists and is non-empty.
  - If that metadata write fails, the error is shown, and the row stays recoverable.
- **Recovery on launch.** Interrupted rows that have a non-empty file become `recovered` (labelled *may be
  incomplete*). Rows without a file are removed.
- **Deletion and checks.**
  - Delete removes the file first, then the row, after an explicit confirmation.
  - Missing files are detected and shown, and the entry can still be deleted.
  - A new take needs at least 50 MB of free space.

## Authentication and sync

**Not implemented.** Supabase (Auth, Postgres, Storage) is an external integration that the owner asked to approve
before it is added. Guest mode is the only mode and is complete on its own. The schema already carries UUIDs,
`sync_status`, `updated_at` and soft-delete tombstones, so sync can be added without migrating local IDs.
