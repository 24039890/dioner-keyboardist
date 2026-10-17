# Security and privacy

## Secrets

- `.env` is git-ignored. `.env.example` contains placeholders only.
- Only the public project URL and publishable/anon key are bundled (`EXPO_PUBLIC_*`). The service-role key must never
  ship in the app, and the app rejects one if it is supplied.

## Microphone and recordings

- Live Keys processes PCM buffers in memory and drops them. Nothing is recorded, written to disk or uploaded.
- Rehearsal recordings are stored in app-private document storage (`Paths.document/Audio`). No public or external
  storage permission is requested: `READ/WRITE_EXTERNAL_STORAGE` are explicitly blocked in `app.json`.
- Microphone permission is requested only when the user starts listening or recording. Denial, including permanent
  denial, is handled with a link to system settings.

## Local data

- SQLite queries are parameterised, and user search text is escaped for `LIKE`. The only interpolated SQL is the
  integer `PRAGMA user_version` set from a constant.
- Input is validated for length, key range, offset range and tag counts before it is written. Settings read from the
  database are coerced to allowed values.
- **Deleting:**
  - Recordings and rehearsals: the file is removed first, then the row, after explicit confirmation.
  - Songs: soft delete (a tombstone kept for future sync propagation).
  - Uninstalling the app removes all local data.

## Authentication

- Supabase Auth with email and password. Passwords never touch the local database.
- The session is persisted with `LargeSecureStore`: AES-256-CTR encrypted in AsyncStorage, with the key in
  `expo-secure-store` (Android Keystore). The key comes from `expo-crypto`'s secure random generator.
- Tokens refresh only while the app is in the foreground.
- `src/config/env.ts` reads only `EXPO_PUBLIC_SUPABASE_URL` and the publishable/anon key. It rejects `sb_secret_*` and
  `service_role` JWTs, so a secret key can never activate cloud features.

## Row Level Security (supabase/migrations)

- RLS is enabled on every table (`profiles`, `songs`, `song_sections`, `rehearsals`, `recordings`,
  `learning_progress`). There are separate SELECT, INSERT, UPDATE and DELETE policies, all restricted to
  `authenticated` and requiring `owner_id = auth.uid()`.
- Child rows must also point at a parent owned by the same user: sections → song, rehearsal → song, recording →
  rehearsal.
- `owner_id` defaults to `auth.uid()`, and spoofed owners are rejected by `WITH CHECK`.
- **Verified** on PGlite (Postgres in WASM) with stubbed Supabase schemas: user B cannot read, update or delete user A's
  rows, cannot insert as A, and cannot attach sections to A's song. **Not yet verified** on a live Supabase project;
  run `supabase/tests/rls_ownership.sql` there.

## Storage

- The private `recordings` bucket (`public = false`) has a 100 MB per-file limit and only accepts audio MIME types.
- Paths are `<user id>/<recording id>.m4a`. Storage policies allow access only when the first folder equals
  `auth.uid()`. A cross-folder write was verified to be rejected.
- Playback of cloud copies uses 1-hour signed URLs. No public URLs exist.
- Audio upload is opt-in ("Also back up recording audio"); metadata sync never uploads audio.

## Guest migration and account safety

- Signing in uploads nothing by itself. The user confirms **Back up now**, which links the library to the account and
  then syncs.
- Rows are marked `synced` only after the server accepts them, and only if they weren't edited meanwhile.
- Failures leave local data intact and pending; they are retried on the next sync.
- If the library is linked to another account, sync is blocked until the user explicitly chooses to back it up to the
  new account. The old account's cloud copy is never touched.
- Sign-out never deletes local data.
