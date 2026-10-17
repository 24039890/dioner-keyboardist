/**
 * Optional cloud account + sync. Guest mode stays fully functional: when
 * Supabase is not configured or the user is signed out, nothing here runs.
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type SupabaseEnv, supabaseEnv } from '../../config/env';
import { type SyncRepository, createSyncRepository } from '../../db/repositories/sync';
import type { Db } from '../../db/types';
import { getSupabase } from '../../services/supabase/client';
import { createSupabaseRemoteStore } from '../../services/supabase/remoteStore';
import { expoRecordingStore } from '../rehearsals/services/expoRecordingStore';
import { type LinkCheck, type SyncReport, checkAccountLink, linkAccount, runSync } from '../sync/syncEngine';

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

interface CloudContextValue {
  env: SupabaseEnv;
  session: Session | null;
  ready: boolean;
  link: LinkCheck | null;
  unsynced: number;
  uploadAudio: boolean;
  syncing: boolean;
  progress: string | null;
  lastReport: SyncReport | null;
  lastSyncAt: string | null;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  resetPassword(email: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  /** Links this phone's library to the signed-in account (guest migration) and syncs. */
  linkAndSync(): Promise<void>;
  syncNow(): Promise<void>;
  setUploadAudio(on: boolean): Promise<void>;
  refresh(): Promise<void>;
}

const CloudContext = createContext<CloudContextValue | null>(null);

interface CloudState {
  unsynced: number;
  uploadAudio: boolean;
  lastSyncAt: string | null;
  link: LinkCheck | null;
}

async function readCloudState(local: SyncRepository, userId: string | null): Promise<CloudState> {
  return {
    unsynced: await local.unsyncedCount(),
    uploadAudio: (await local.getState('uploadAudio')) === 'true',
    lastSyncAt: await local.getState('lastSyncAt'),
    link: userId ? await checkAccountLink(local, userId) : null,
  };
}

const AUTO_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email address first (check your inbox).';
  if (/password should be at least/i.test(message)) return message;
  if (/network|fetch/i.test(message)) return 'Could not reach the server. Check your internet connection.';
  return message;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const sqlite = useSQLiteContext();
  const local = useMemo(() => createSyncRepository(sqlite as unknown as Db), [sqlite]);
  const client = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!client);
  const [link, setLink] = useState<LinkCheck | null>(null);
  const [unsynced, setUnsynced] = useState(0);
  const [uploadAudio, setUploadAudioState] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const lastAuto = useRef(0);

  const applyState = useCallback((st: CloudState) => {
    setUnsynced(st.unsynced);
    setUploadAudioState(st.uploadAudio);
    setLastSyncAt(st.lastSyncAt);
    setLink(st.link);
  }, []);

  const userId = session?.user.id ?? null;
  const refresh = useCallback(async () => applyState(await readCloudState(local, userId)), [local, userId, applyState]);

  // Restore the session and follow auth changes.
  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    let active = true;
    readCloudState(local, userId).then(
      (st) => active && applyState(st),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [local, userId, applyState]);

  const doSync = useCallback(async () => {
    const user = session?.user;
    if (!client || !user || syncingRef.current) return;
    if ((await checkAccountLink(local, user.id)).kind !== 'linked-same') return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const report = await runSync(local, createSupabaseRemoteStore(client), expoRecordingStore, {
        ownerId: user.id,
        uploadAudio: (await local.getState('uploadAudio')) === 'true',
        onProgress: setProgress,
      });
      setLastReport(report);
    } catch (e) {
      setLastReport({
        pushed: 0,
        pulled: 0,
        audioUploaded: 0,
        deletedRemotely: 0,
        errors: [e instanceof Error ? e.message : 'Sync failed.'],
        finishedAt: new Date().toISOString(),
      });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setProgress(null);
      await refresh();
    }
  }, [client, session, local, refresh]);

  // Automatic sync when signed in and linked: on sign-in/restore and when the app returns to the foreground.
  useEffect(() => {
    if (!session) return;
    const auto = () => {
      if (Date.now() - lastAuto.current < AUTO_SYNC_MIN_INTERVAL_MS) return;
      lastAuto.current = Date.now();
      doSync().catch(() => undefined);
    };
    auto();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') auto();
    });
    return () => sub.remove();
  }, [session, doSync]);

  const value = useMemo<CloudContextValue>(
    () => ({
      env: supabaseEnv,
      session,
      ready,
      link,
      unsynced,
      uploadAudio,
      syncing,
      progress,
      lastReport,
      lastSyncAt,
      async signIn(email, password) {
        if (!client) return { ok: false, message: 'Cloud accounts are not configured in this build.' };
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
      },
      async signUp(email, password) {
        if (!client) return { ok: false, message: 'Cloud accounts are not configured in this build.' };
        const { data, error } = await client.auth.signUp({ email: email.trim(), password });
        if (error) return { ok: false, message: friendlyAuthError(error.message) };
        return data.session
          ? { ok: true, message: 'Account created and signed in.' }
          : { ok: true, message: 'Account created. Check your email to confirm it, then sign in.' };
      },
      async resetPassword(email) {
        if (!client) return { ok: false, message: 'Cloud accounts are not configured in this build.' };
        // The email link opens DIONER at /reset-password (dioner://reset-password in builds,
        // exp://…/--/reset-password in Expo Go). The URL must be in Supabase's redirect allow-list.
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/reset-password') });
        return error
          ? { ok: false, message: friendlyAuthError(error.message) }
          : { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
      },
      async signOut() {
        if (!client) return { ok: true };
        const { error } = await client.auth.signOut();
        await refresh();
        return error ? { ok: false, message: error.message } : { ok: true, message: 'Signed out. Everything on this phone is still here.' };
      },
      async linkAndSync() {
        const user = session?.user;
        if (!user) return;
        await linkAccount(local, user.id);
        await refresh();
        lastAuto.current = Date.now();
        await doSync();
      },
      syncNow: doSync,
      async setUploadAudio(on) {
        await local.setState('uploadAudio', on ? 'true' : 'false');
        setUploadAudioState(on);
      },
      refresh,
    }),
    [client, session, ready, link, unsynced, uploadAudio, syncing, progress, lastReport, lastSyncAt, local, refresh, doSync],
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloud(): CloudContextValue {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error('useCloud must be used inside CloudProvider');
  return ctx;
}
