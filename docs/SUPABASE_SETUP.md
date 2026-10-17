# Connecting Supabase (cloud accounts and sync)

Cloud features are optional. Without this setup the app runs fully in guest mode.

## 1. Create a project

1. Go to <https://supabase.com>, sign in and click **New project**. The free tier is fine.
2. Choose a name and a database password, and pick a region near you.

## 2. Create the tables, security rules and storage bucket

1. In the project, open **SQL Editor → New query**.
2. Paste the whole contents of `supabase/migrations/20261016000000_initial_schema.sql`.
3. Click **Run**. It should finish with "Success. No rows returned".

The migration creates `profiles`, `songs`, `song_sections`, `rehearsals`, `recordings` and `learning_progress`, all with
Row Level Security. It also creates the private `recordings` storage bucket and its policies.

**Optional check:** run `supabase/tests/rls_ownership.sql` the same way. It creates two test users inside a
transaction and rolls everything back. Every `expect` line should show the stated count, and no error should appear.

## 3. Auth settings

Go to **Authentication → Sign In / Providers → Email** and make sure Email is enabled.

- With **Confirm email** on (the default), new users must click the link in their email before signing in.
- For quick testing you can turn it off.

The password-reset email opens the app on a **Set a new password** screen. For that to work, go to
**Authentication → URL Configuration → Redirect URLs** and add:

- `dioner://reset-password` for installed builds (APK).
- `exp://**` while testing in Expo Go. Remove this one before going live.

## 4. Put the keys in the app

1. Go to **Project Settings → API Keys**.
2. Copy the **Project URL** and the **publishable key** (`sb_publishable_…`), or the legacy **anon public** key.
3. Create `D:\dioner-keyboardist\.env`. It is git-ignored, so it won't be committed.

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

Never use the **secret** or **service_role** key. The app refuses to start cloud features with one.

Restart the dev server after changing `.env` (`npx expo start --clear`).

## 5. Use it

In the app, open **Settings → Account & cloud sync**.

1. Create an account or sign in.
2. Tap **Back up now**. This is the guest-to-account migration: the phone's library is uploaded and linked to that
   account.
3. Turn on **Also back up recording audio** if you want the audio files uploaded too. Otherwise only recording names
   and durations sync.
4. **Sync now** syncs immediately. Sync also runs on sign-in and when the app returns to the foreground, at most every
   2 minutes.

**How sync behaves:**

- **Sign-out** keeps all local data.
- **Conflicts:** the most recently edited version wins. An unsynced local edit is never overwritten by an older cloud
  copy.
- **Deletes** on one phone are applied on the others.
- **Recordings from another phone** play by streaming a 1-hour signed link from the private bucket. The audio is not
  downloaded.
- **Other accounts:** if the phone's library is linked to a different account, nothing syncs until you choose.
