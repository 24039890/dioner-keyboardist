# Testing report

Last full run: 2026-10-16 with `npx jest` on Node v24.18.1 (Windows 11). Result: **7 suites, 154 tests, 154
passed, 0 failed, 0 skipped**, exit 0.

## Automated tests

| Suite | Tests | What it covers |
| --- | --- | --- |
| `tests/unit/music-theory.test.ts` | 56 | See below |
| `tests/unit/audio-engine.test.ts` | 41 | See below |
| `tests/integration/persistence.test.ts` | 26 | See below |
| `tests/unit/learning.test.ts` | 9 | See below |
| `tests/unit/components.test.tsx` | 7 | See below |
| `tests/unit/midi.test.ts` | 13 | See below |
| `tests/unit/useMidiAnalysis.test.tsx` | 2 | See below |

- **music-theory** (56):
  - Pitch classes and mod 12, sharp/flat/unicode/double accidentals, signed offsets (F♯→G♯ +2, G♯→F♯ −2, all 144
    pairs).
  - Scale spelling in all 24 keys and key signatures.
  - Chord parsing: 19 qualities plus extensions, alterations, slash chords, invalid symbols.
  - Transposition: the spec example, negative offsets, spelling in the target key, round trip ±1…11 in all 12 keys.
  - Number system: spec examples, minor keys, accidentals, sevenths, slash bass, invalid input, chord↔number round
    trip in all 24 keys.
- **audio-engine** (41):
  - Signal-quality classes and PCM conversion.
  - YIN on 10 notes from A2 to C6, detuning, noise rejection, 48 k and 44.1 k resampling.
  - Chroma and key profiles.
  - Live key estimation on fixtures; the cases are listed below.
  - MIDI evidence: note on/off, velocity-0, held notes, key from played chords.
- **persistence** (26):
  - Migrations: fresh, re-run no-op, failed migration rollback, foreign keys.
  - Song CRUD, search (LIKE escaping), filters, soft delete, duplicate IDs, validation, rollback on a failed write.
  - Restart persistence with a file-backed DB.
  - Rehearsal CRUD and played-key calculation.
  - Recording commit rules, a failed metadata write, interrupted-recording recovery, missing files, rename, discard,
    delete, cascade delete, insufficient storage.
  - Lesson progress and settings coercion.
- **learning** (9): curriculum completeness, generator well-formedness over 280 seeds, answers cross-checked against
  the theory engine, single and multi answer validation, video provider "not configured".
- **midi** (13): MIDI parser (note on/off, velocity-0, running status, split buffers, interleaved real-time bytes, SysEx,
  other messages, stray bytes), plus the native adapter with a fake module (unsupported device, open/close, bytes →
  notes, disconnect, device changes) and bytes → parser → key analyzer (D major).
- **useMidiAnalysis** (2): connect, held notes and a key estimate, unplug handling, release when MIDI mode is left.
- **components** (7): KeyPanel states (idle, insufficient, ambiguous, estimated with key change, manual), and
  TranspositionWorkspace stepping, reset and number view (React Native Testing Library).

### Audio fixtures (synthetic — see `tests/fixtures/signals.ts`)

The fixtures are deterministic. Each note is harmonics 1–4 with amplitudes 1, ½, ⅓ and ¼ in 12-TET (A4 = 440 Hz),
with a 10 ms envelope. Noise comes from a seeded xorshift32. The melodies and progressions are original. **These
results say nothing about accuracy on a real microphone.**

| Fixture case | Result |
| --- | --- |
| Key accuracy: melody + I–IV–V–I (major) or i–iv–V–i (minor) in all 24 keys | **24/24** correct |
| C major melody alone / A minor melody alone | Correct |
| Noise at SNR ≈ 10 dB | C major found |
| Clipping (flagged) | C major found |
| Weak signal (flagged) | Never a wrong key |
| Detuned +35 cents | C major found |
| Single sustained note, 8 s | Not reported as a key (pitch A4 shown) |
| White noise / silence | Not reported as a key |
| C–D–E–G-only passage | Not reported with high confidence |
| Even C-major scale | C major / A minor family only |
| Modulation C → E♭ | Hint 8.5 s after the change; confirmed 15.0 s after |
| Update interval | 150 ms (by design) |
| Per-hop processing (Node, not a phone) | Mean 1.2–2.1 ms, p95 2–4 ms across runs |

## Other checks run

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0 |
| `npx expo install --check` | Up to date |
| `npx expo-doctor` | 20/20 passed |
| `npx expo export --platform android` | exit 0 (Hermes bundle) |

**Manual web-preview walkthrough** (Expo web, 375×812, in-app browser):

- Onboarding → Continue as guest → Live Keys.
- Create a song with the number converter. The unparseable "Qx" was flagged and kept.
- Transpose +2: D | A/C♯ | Bm7 | Gmaj7 | Qx. The number view showed 1 | 5/7 | 6m7 | 4maj7.
- Rehearse in +2: the rehearsal opened with C → D and a transposed chart.
- A number-system exercise scored 6/6, and best score and attempts were saved.
- After a reload, onboarding was skipped and progress persisted.

The web preview uses the browser's SQLite (WASM), not Android.

## Not verified

- **Hardware tests completed: none.** There was no Android device, emulator or SDK on this machine.
- Real-microphone key detection, latency, noise and reverb behaviour on a phone.
- Whether `useAudioStream` is available in Expo Go and on specific Android devices.
- Recording and playback on Android: the code uses the documented `useAudioRecorder` and `useAudioPlayer` APIs but
  was not run natively. Web-preview recording was not tested.
- AppState backgrounding, call interruptions and media-service resets on a device.
- MIDI on hardware. The Kotlin module was not compiled (no Android SDK) and no keyboard was connected; the tests use a
  fake native module.
- Supabase auth/RLS/Storage (not implemented), video provider (not connected).
