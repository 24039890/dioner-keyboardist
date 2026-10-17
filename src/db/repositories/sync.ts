/**
 * Local side of cloud sync: reads unsynced rows, marks rows synced, and applies
 * remote rows with last-write-wins conflict resolution.
 *
 * Rules
 * - A local row with sync_status 'local' or 'pending' has unsynced changes.
 * - markSynced only succeeds if updated_at is unchanged since it was read, so
 *   an edit made during a sync stays pending.
 * - A remote row overwrites a local row when the local row has no unsynced
 *   changes, or when the remote row is strictly newer (updated_at).
 */
import type { RemoteProgress, RemoteRecording, RemoteRehearsal, RemoteSection, RemoteSong } from '../../features/sync/types';
import type { Db, SqlValue } from '../types';

const iso = (t: string | null | undefined): string | null => (t ? new Date(t).toISOString() : null);
const newer = (a: string, b: string): boolean => Date.parse(a) > Date.parse(b);

export interface LocalSongRow {
  id: string;
  title: string;
  artist: string | null;
  song_number: string | null;
  original_key: string;
  tags: string;
  notes: string | null;
  lyrics: string | null;
  source_attribution: string | null;
  is_saved: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalRehearsalRow {
  id: string;
  title: string;
  song_id: string | null;
  original_key: string | null;
  played_key: string | null;
  transposition_semitones: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalRecordingRow {
  id: string;
  rehearsal_id: string;
  name: string;
  file_uri: string;
  duration_ms: number;
  size_bytes: number | null;
  remote_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalProgressRow {
  lesson_id: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  question_count: number | null;
  completed_at: string | null;
  updated_at: string;
}

export interface Tombstone {
  table_name: string;
  record_id: string;
  remote_path: string | null;
}

const DIRTY = "sync_status IN ('local', 'pending')";

export function createSyncRepository(db: Db) {
  // ---- key/value state (stored in the settings table under "sync." keys) ----
  async function getState(key: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [`sync.${key}`]);
    return row?.value ?? null;
  }
  async function setState(key: string, value: string | null): Promise<void> {
    if (value === null) await db.runAsync('DELETE FROM settings WHERE key = ?', [`sync.${key}`]);
    else
      await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
        `sync.${key}`,
        value,
      ]);
  }

  // ---- dirty rows ----
  const dirtySongs = () => db.getAllAsync<LocalSongRow>(`SELECT * FROM songs WHERE ${DIRTY} ORDER BY updated_at`);
  const sectionsOf = (songId: string) =>
    db.getAllAsync<{ id: string; position: number; label: string; chords: string }>(
      'SELECT id, position, label, chords FROM song_sections WHERE song_id = ? ORDER BY position',
      [songId],
    );
  const dirtyRehearsals = () => db.getAllAsync<LocalRehearsalRow>(`SELECT * FROM rehearsals WHERE ${DIRTY} ORDER BY updated_at`);
  const dirtyRecordings = () =>
    db.getAllAsync<LocalRecordingRow>(`SELECT * FROM recordings WHERE ${DIRTY} AND status != 'recording' ORDER BY updated_at`);
  const recordingsMissingAudio = () =>
    db.getAllAsync<LocalRecordingRow>(
      "SELECT * FROM recordings WHERE remote_path IS NULL AND status != 'recording' AND file_uri != '' ORDER BY created_at",
    );
  const dirtyProgress = () => db.getAllAsync<LocalProgressRow>(`SELECT * FROM lesson_progress WHERE ${DIRTY}`);
  const tombstones = () => db.getAllAsync<Tombstone>('SELECT table_name, record_id, remote_path FROM tombstones');

  async function unsyncedCount(): Promise<number> {
    let n = 0;
    for (const t of ['songs', 'rehearsals', 'recordings', 'lesson_progress']) {
      const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE ${DIRTY}`);
      n += row?.n ?? 0;
    }
    return n;
  }

  // ---- marking ----
  async function markSynced(table: 'songs' | 'rehearsals' | 'recordings', id: string, updatedAt: string): Promise<boolean> {
    const r = await db.runAsync(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ? AND updated_at = ?`, [id, updatedAt]);
    return r.changes > 0;
  }
  async function markProgressSynced(lessonId: string, updatedAt: string): Promise<void> {
    await db.runAsync(`UPDATE lesson_progress SET sync_status = 'synced' WHERE lesson_id = ? AND updated_at = ?`, [lessonId, updatedAt]);
  }
  async function setRemotePath(id: string, path: string): Promise<void> {
    // The metadata changed (it now points at the cloud file), so queue it for upload.
    await db.runAsync(
      `UPDATE recordings SET remote_path = ?, updated_at = ?,
         sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END
       WHERE id = ?`,
      [path, new Date().toISOString(), id],
    );
  }
  async function clearTombstone(table: string, id: string): Promise<void> {
    await db.runAsync('DELETE FROM tombstones WHERE table_name = ? AND record_id = ?', [table, id]);
  }

  // ---- applying remote rows ----
  async function localState(table: string, keyCol: string, key: string) {
    return db.getFirstAsync<{ sync_status: string; updated_at: string }>(
      `SELECT sync_status, updated_at FROM ${table} WHERE ${keyCol} = ?`,
      [key],
    );
  }
  const shouldApply = (local: { sync_status: string; updated_at: string } | null, remoteUpdated: string) =>
    !local || local.sync_status === 'synced' || newer(remoteUpdated, local.updated_at);

  /** Returns true if the remote song was applied. */
  async function applySong(song: RemoteSong, sections: RemoteSection[]): Promise<boolean> {
    const local = await localState('songs', 'id', song.id);
    if (!shouldApply(local, song.updated_at)) return false;
    const values: SqlValue[] = [
      song.id,
      song.title,
      song.artist,
      song.song_number,
      song.original_key,
      JSON.stringify(Array.isArray(song.tags) ? song.tags : []),
      song.notes,
      song.lyrics,
      song.source_attribution,
      song.is_saved ? 1 : 0,
      iso(song.created_at),
      iso(song.updated_at),
      iso(song.deleted_at),
    ];
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO songs (id, title, artist, song_number, original_key, tags, notes, lyrics, source_attribution, is_saved, created_at, updated_at, deleted_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
         ON CONFLICT (id) DO UPDATE SET title = excluded.title, artist = excluded.artist, song_number = excluded.song_number,
           original_key = excluded.original_key, tags = excluded.tags, notes = excluded.notes, lyrics = excluded.lyrics,
           source_attribution = excluded.source_attribution, is_saved = excluded.is_saved, updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at, sync_status = 'synced'`,
        values,
      );
      await db.runAsync('DELETE FROM song_sections WHERE song_id = ?', [song.id]);
      for (const s of [...sections].sort((a, b) => a.position - b.position)) {
        await db.runAsync('INSERT INTO song_sections (id, song_id, position, label, chords) VALUES (?, ?, ?, ?, ?)', [
          s.id,
          song.id,
          s.position,
          s.label,
          s.chords,
        ]);
      }
    });
    return true;
  }

  async function applyRehearsal(r: RemoteRehearsal): Promise<boolean> {
    const local = await localState('rehearsals', 'id', r.id);
    if (!shouldApply(local, r.updated_at)) return false;
    // A rehearsal may reference a song this device does not have (yet); keep the link only if it exists.
    const songExists = r.song_id ? await db.getFirstAsync('SELECT 1 AS x FROM songs WHERE id = ?', [r.song_id]) : null;
    await db.runAsync(
      `INSERT INTO rehearsals (id, title, song_id, original_key, played_key, transposition_semitones, notes, created_at, updated_at, deleted_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
       ON CONFLICT (id) DO UPDATE SET title = excluded.title, song_id = excluded.song_id, original_key = excluded.original_key,
         played_key = excluded.played_key, transposition_semitones = excluded.transposition_semitones, notes = excluded.notes,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_status = 'synced'`,
      [
        r.id,
        r.title,
        songExists ? r.song_id : null,
        r.original_key,
        r.played_key,
        r.transposition_semitones,
        r.notes,
        iso(r.created_at),
        iso(r.updated_at),
        iso(r.deleted_at),
      ],
    );
    return true;
  }

  /**
   * Applies remote recording metadata. Audio is not downloaded: a recording that
   * only exists in the cloud gets an empty file_uri and is streamed on demand.
   * Returns the local file URI to delete when the cloud says the take was deleted.
   */
  async function applyRecording(rec: RemoteRecording): Promise<{ applied: boolean; deleteLocalFile: string | null }> {
    const local = await db.getFirstAsync<{ sync_status: string; updated_at: string; file_uri: string }>(
      'SELECT sync_status, updated_at, file_uri FROM recordings WHERE id = ?',
      [rec.id],
    );
    if (!shouldApply(local, rec.updated_at)) return { applied: false, deleteLocalFile: null };
    if (rec.deleted_at) {
      if (local) await db.runAsync('DELETE FROM recordings WHERE id = ?', [rec.id]);
      return { applied: true, deleteLocalFile: local?.file_uri || null };
    }
    const parent = await db.getFirstAsync('SELECT 1 AS x FROM rehearsals WHERE id = ?', [rec.rehearsal_id]);
    if (!parent) return { applied: false, deleteLocalFile: null };
    await db.runAsync(
      `INSERT INTO recordings (id, rehearsal_id, name, file_uri, duration_ms, size_bytes, status, remote_path, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, '', ?, ?, 'saved', ?, ?, ?, 'synced')
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, duration_ms = excluded.duration_ms, size_bytes = excluded.size_bytes,
         remote_path = COALESCE(excluded.remote_path, recordings.remote_path), updated_at = excluded.updated_at, sync_status = 'synced'`,
      [rec.id, rec.rehearsal_id, rec.name, rec.duration_ms, rec.size_bytes, rec.storage_path, iso(rec.created_at), iso(rec.updated_at)],
    );
    return { applied: true, deleteLocalFile: null };
  }

  async function applyProgress(p: RemoteProgress): Promise<boolean> {
    const local = await localState('lesson_progress', 'lesson_id', p.lesson_id);
    if (!shouldApply(local, p.updated_at)) return false;
    await db.runAsync(
      `INSERT INTO lesson_progress (lesson_id, attempts, best_score, last_score, question_count, completed_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
       ON CONFLICT (lesson_id) DO UPDATE SET attempts = excluded.attempts, best_score = excluded.best_score, last_score = excluded.last_score,
         question_count = excluded.question_count, completed_at = excluded.completed_at, updated_at = excluded.updated_at, sync_status = 'synced'`,
      [p.lesson_id, p.attempts, p.best_score, p.last_score, p.question_count, iso(p.completed_at), iso(p.updated_at)],
    );
    return true;
  }

  /** Re-queues every row for upload to a newly linked account (cloud paths of another account are dropped). */
  async function requeueAll(): Promise<void> {
    await db.withTransactionAsync(async () => {
      for (const t of ['songs', 'rehearsals', 'recordings', 'lesson_progress']) {
        await db.runAsync(`UPDATE ${t} SET sync_status = 'pending' WHERE sync_status = 'synced'`);
      }
      await db.runAsync('UPDATE recordings SET remote_path = NULL');
      await db.runAsync('DELETE FROM tombstones');
    });
  }

  return {
    requeueAll,
    getState,
    setState,
    dirtySongs,
    sectionsOf,
    dirtyRehearsals,
    dirtyRecordings,
    recordingsMissingAudio,
    dirtyProgress,
    tombstones,
    unsyncedCount,
    markSynced,
    markProgressSynced,
    setRemotePath,
    clearTombstone,
    applySong,
    applyRehearsal,
    applyRecording,
    applyProgress,
  };
}

export type SyncRepository = ReturnType<typeof createSyncRepository>;
