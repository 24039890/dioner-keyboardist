# Feature status (2026-10-16)

Statuses: IMPLEMENTED AND TESTED · IMPLEMENTED, NOT FULLY VERIFIED · PARTIALLY IMPLEMENTED · BLOCKED · NOT IMPLEMENTED

| Feature | Status | Evidence / gap |
| --- | --- | --- |
| Expo app launches, four tabs | IMPLEMENTED, NOT FULLY VERIFIED | Android bundle exports; runs in the web preview; not launched on Android |
| White-and-blue design system | IMPLEMENTED AND TESTED | Tokens and shared components; checked visually in the web preview |
| Onboarding and guest mode | IMPLEMENTED AND TESTED | Web walkthrough; settings persistence test |
| Music-theory engine (transposition, chords, slash bass, number system) | IMPLEMENTED AND TESTED | 56 unit tests |
| Song CRUD, search, filters, tags, notes, lyrics, attribution | IMPLEMENTED AND TESTED | 9 persistence tests plus web walkthrough |
| Transposition workspace (preview, target key, reset, numbers, confirmed rewrite) | IMPLEMENTED AND TESTED | Component tests plus web walkthrough |
| Live audio analysis engine (YIN, chroma, KK profiles, smoothing, key change) | IMPLEMENTED AND TESTED (offline fixtures) | 41 tests; 24/24 fixture keys |
| Live microphone capture (useAudioStream, permissions, lifecycle) | IMPLEMENTED, NOT FULLY VERIFIED | Typechecks and bundles; no device test |
| On-device latency / accuracy | NOT VERIFIED | No hardware |
| MIDI keyboard input (USB/virtual) | IMPLEMENTED, NOT FULLY VERIFIED | Local Expo module; parser, adapter, hook and analyzer tested (18 tests: 13 parser/adapter, 2 hook, 3 analyzer; fake native module); Kotlin not compiled (no Android SDK); no hardware test |
| Bluetooth MIDI | NOT IMPLEMENTED | Needs `openBluetoothDevice` and Bluetooth permissions |
| Rehearsal library (create, link song, keys, offset, notes, search, filter, delete) | IMPLEMENTED AND TESTED | Persistence tests plus web walkthrough |
| Recording (pause/resume, save-after-commit, recovery, storage check, discard) | IMPLEMENTED, NOT FULLY VERIFIED | Lifecycle rules tested; native recording not run |
| Playback (play/pause, seek, ±10 s, missing file) | IMPLEMENTED, NOT FULLY VERIFIED | Not run natively |
| Learning paths, 6 lessons, 7 exercise types, saved progress | IMPLEMENTED AND TESTED | 9 learning tests plus 6/6 web run |
| Video tutorials | BLOCKED | Provider boundary and "not connected" state; needs an approved provider |
| SQLite migrations, transactions, offline data | IMPLEMENTED AND TESTED | Integration tests on real SQLite |
| Supabase auth, migrations, RLS, private Storage, guest migration, sync | BLOCKED | Owner asked to approve external integrations first; planned design in SECURITY.md |
| App icons / branding assets | NOT IMPLEMENTED | Expo placeholders |
