# Security and privacy

## Secrets

- The app currently uses no secrets and no network services.
- `.env` is git-ignored. `.env.example` lists placeholder names for a possible future Supabase setup; none of them is
  read by the app yet.
- If Supabase is added, only the public URL and anon key may ever be bundled (`EXPO_PUBLIC_*`). The service-role key
  must never ship in the app.

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

## Authentication, RLS, Storage, guest migration

**Not implemented.** These are blocked pending the owner's approval to integrate Supabase. The planned design:

- Every private table (`profiles`, `songs`, `song_sections`, `rehearsals`, `recordings`, `learning_progress`) has an
  `owner_id uuid references auth.users`.
- Row Level Security is enabled on all of them, with SELECT/INSERT/UPDATE/DELETE policies of the form
  `owner_id = auth.uid()`.
- Recordings go in a private Storage bucket under the path `<uid>/<recording-id>.m4a`, with policies that check
  `(storage.foldername(name))[1] = auth.uid()::text`. Files are served only through signed URLs, limited to
  `audio/*` and a size cap.
- **Guest migration:**
  1. Upload local rows under the user's ID.
  2. Detect collisions by UUID.
  3. Mark a row `synced` only after the server confirms it.
  4. Never delete local data on sign-out or after a failed upload.
