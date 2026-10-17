/**
 * Supabase implementation of the sync engine's RemoteStore. Row Level
 * Security on the server guarantees that every call only touches the signed-in
 * user's rows, whatever the client sends.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import type { RemoteProgress, RemoteRecording, RemoteRehearsal, RemoteSection, RemoteSong, RemoteStore } from '../../features/sync/types';

export const RECORDINGS_BUCKET = 'recordings';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseRemoteStore(client: SupabaseClient): RemoteStore {
  const since = <Q extends { gt: (c: string, v: string) => Q; order: (c: string, o: { ascending: boolean }) => Q }>(
    q: Q,
    t: string | null,
  ) => (t ? q.gt('updated_at', t) : q).order('updated_at', { ascending: true });

  return {
    async upsertSongs(rows: RemoteSong[]) {
      check(await client.from('songs').upsert(rows, { onConflict: 'id' }));
    },
    async replaceSections(songId: string, rows: RemoteSection[]) {
      check(await client.from('song_sections').delete().eq('song_id', songId));
      if (rows.length) check(await client.from('song_sections').insert(rows));
    },
    async upsertRehearsals(rows: RemoteRehearsal[]) {
      check(await client.from('rehearsals').upsert(rows, { onConflict: 'id' }));
    },
    async upsertRecordings(rows: RemoteRecording[]) {
      check(await client.from('recordings').upsert(rows, { onConflict: 'id' }));
    },
    async deleteRecording(id: string) {
      // Soft delete so other devices learn about it when they pull.
      check(
        await client
          .from('recordings')
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), storage_path: null })
          .eq('id', id),
      );
    },
    async upsertProgress(rows: RemoteProgress[]) {
      check(await client.from('learning_progress').upsert(rows, { onConflict: 'owner_id,lesson_id' }));
    },
    async songsSince(t) {
      return check(await since(client.from('songs').select('*'), t)) as RemoteSong[];
    },
    async sectionsFor(songIds) {
      return check(await client.from('song_sections').select('*').in('song_id', songIds)) as RemoteSection[];
    },
    async rehearsalsSince(t) {
      return check(await since(client.from('rehearsals').select('*'), t)) as RemoteRehearsal[];
    },
    async recordingsSince(t) {
      return check(await since(client.from('recordings').select('*'), t)) as RemoteRecording[];
    },
    async progressSince(t) {
      return check(await since(client.from('learning_progress').select('*'), t)) as RemoteProgress[];
    },
    async uploadAudio(path, fileUri) {
      const bytes = await new File(fileUri).arrayBuffer();
      check(await client.storage.from(RECORDINGS_BUCKET).upload(path, bytes, { contentType: 'audio/mp4', upsert: true }));
    },
    async removeAudio(path) {
      check(await client.storage.from(RECORDINGS_BUCKET).remove([path]));
    },
  };
}

/** Short-lived signed URL for streaming a cloud-only recording (private bucket). */
export async function signedRecordingUrl(client: SupabaseClient, path: string, seconds = 3600): Promise<string> {
  const data = check(await client.storage.from(RECORDINGS_BUCKET).createSignedUrl(path, seconds));
  if (!data?.signedUrl) throw new Error('No signed URL was returned for this recording.');
  return data.signedUrl;
}
