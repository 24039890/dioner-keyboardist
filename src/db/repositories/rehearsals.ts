import { type Key, decodeKey, encodeKey } from '../../features/music-theory/keys';
import { normalizeOffset } from '../../features/music-theory/transposition';
import { newId, nowIso } from '../../utils/id';
import { likePattern } from './songs';
import { type Db, type SqlValue, type SyncStatus, NotFoundError, ValidationError } from '../types';

export interface Rehearsal {
  id: string;
  title: string;
  songId: string | null;
  songTitle: string | null;
  originalKey: Key | null;
  playedKey: Key | null;
  transpositionSemitones: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  recordingCount: number;
  totalDurationMs: number;
}

export interface RehearsalInput {
  title: string;
  songId?: string | null;
  originalKey?: Key | null;
  transpositionSemitones?: number;
  notes?: string | null;
}

export interface RehearsalFilter {
  query?: string;
  songId?: string;
  /** ISO timestamp; only rehearsals created at or after it. */
  since?: string;
}

export type RecordingStatus = 'recording' | 'saved' | 'recovered';

export interface Recording {
  id: string;
  rehearsalId: string;
  name: string;
  fileUri: string;
  durationMs: number;
  sizeBytes: number | null;
  status: RecordingStatus;
  /** Path in the cloud bucket when the audio has been backed up. */
  remotePath: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

interface RehearsalRow {
  id: string;
  title: string;
  song_id: string | null;
  song_title: string | null;
  original_key: string | null;
  played_key: string | null;
  transposition_semitones: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sync_status: string;
  recording_count: number;
  total_duration_ms: number | null;
}

interface RecordingRow {
  id: string;
  rehearsal_id: string;
  name: string;
  file_uri: string;
  duration_ms: number;
  size_bytes: number | null;
  status: string;
  remote_path: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

const toRehearsal = (r: RehearsalRow): Rehearsal => ({
  id: r.id,
  title: r.title,
  songId: r.song_id,
  songTitle: r.song_title,
  originalKey: decodeKey(r.original_key),
  playedKey: decodeKey(r.played_key),
  transpositionSemitones: r.transposition_semitones,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  syncStatus: r.sync_status as SyncStatus,
  recordingCount: r.recording_count,
  totalDurationMs: r.total_duration_ms ?? 0,
});

const toRecording = (r: RecordingRow): Recording => ({
  id: r.id,
  rehearsalId: r.rehearsal_id,
  name: r.name,
  fileUri: r.file_uri,
  durationMs: r.duration_ms,
  sizeBytes: r.size_bytes,
  status: r.status as RecordingStatus,
  remotePath: r.remote_path ?? null,
  syncStatus: (r.sync_status ?? 'local') as SyncStatus,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function validateRehearsalInput(input: RehearsalInput): string[] {
  const issues: string[] = [];
  if (!input.title.trim()) issues.push('Title is required.');
  if (input.title.trim().length > 200) issues.push('Title must be at most 200 characters.');
  const t = input.transpositionSemitones ?? 0;
  if (!Number.isInteger(t) || t < -11 || t > 11) issues.push('Transposition must be a whole number from −11 to +11.');
  if ((input.notes ?? '').length > 5000) issues.push('Notes are too long.');
  return issues;
}

const SELECT_REHEARSAL = `
  SELECT r.*, s.title AS song_title,
    (SELECT COUNT(*) FROM recordings c WHERE c.rehearsal_id = r.id AND c.status != 'recording') AS recording_count,
    (SELECT SUM(duration_ms) FROM recordings c WHERE c.rehearsal_id = r.id AND c.status != 'recording') AS total_duration_ms
  FROM rehearsals r LEFT JOIN songs s ON s.id = r.song_id AND s.deleted_at IS NULL`;

export function createRehearsalsRepository(db: Db) {
  function playedKeyFor(input: RehearsalInput): string | null {
    if (!input.originalKey) return null;
    const t = normalizeOffset(input.transpositionSemitones ?? 0);
    return encodeKey({ tonic: (((input.originalKey.tonic + t) % 12) + 12) % 12, mode: input.originalKey.mode });
  }

  async function list(filter: RehearsalFilter = {}): Promise<Rehearsal[]> {
    const where = ['r.deleted_at IS NULL'];
    const params: SqlValue[] = [];
    const q = filter.query?.trim();
    if (q) {
      const p = likePattern(q);
      where.push(`(r.title LIKE ? ESCAPE '\\' OR r.notes LIKE ? ESCAPE '\\' OR s.title LIKE ? ESCAPE '\\')`);
      params.push(p, p, p);
    }
    if (filter.songId) {
      where.push('r.song_id = ?');
      params.push(filter.songId);
    }
    if (filter.since) {
      where.push('r.created_at >= ?');
      params.push(filter.since);
    }
    const rows = await db.getAllAsync<RehearsalRow>(`${SELECT_REHEARSAL} WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC`, params);
    return rows.map(toRehearsal);
  }

  async function get(id: string): Promise<Rehearsal | null> {
    const row = await db.getFirstAsync<RehearsalRow>(`${SELECT_REHEARSAL} WHERE r.id = ? AND r.deleted_at IS NULL`, [id]);
    return row ? toRehearsal(row) : null;
  }

  async function create(input: RehearsalInput, id: string = newId()): Promise<Rehearsal> {
    const issues = validateRehearsalInput(input);
    if (issues.length) throw new ValidationError(issues);
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO rehearsals (id, title, song_id, original_key, played_key, transposition_semitones, notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
      [
        id,
        input.title.trim(),
        input.songId ?? null,
        input.originalKey ? encodeKey(input.originalKey) : null,
        playedKeyFor(input),
        normalizeOffset(input.transpositionSemitones ?? 0),
        input.notes?.trim() || null,
        now,
        now,
      ],
    );
    const r = await get(id);
    if (!r) throw new NotFoundError('Rehearsal', id);
    return r;
  }

  async function update(id: string, input: RehearsalInput): Promise<Rehearsal> {
    const issues = validateRehearsalInput(input);
    if (issues.length) throw new ValidationError(issues);
    const res = await db.runAsync(
      `UPDATE rehearsals SET title = ?, song_id = ?, original_key = ?, played_key = ?, transposition_semitones = ?, notes = ?, updated_at = ?,
         sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END
       WHERE id = ? AND deleted_at IS NULL`,
      [
        input.title.trim(),
        input.songId ?? null,
        input.originalKey ? encodeKey(input.originalKey) : null,
        playedKeyFor(input),
        normalizeOffset(input.transpositionSemitones ?? 0),
        input.notes?.trim() || null,
        nowIso(),
        id,
      ],
    );
    if (res.changes === 0) throw new NotFoundError('Rehearsal', id);
    const r = await get(id);
    if (!r) throw new NotFoundError('Rehearsal', id);
    return r;
  }

  async function remove(id: string): Promise<void> {
    const now = nowIso();
    const res = await db.runAsync(
      `UPDATE rehearsals SET deleted_at = ?, updated_at = ?, sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END WHERE id = ? AND deleted_at IS NULL`,
      [now, now, id],
    );
    if (res.changes === 0) throw new NotFoundError('Rehearsal', id);
  }

  // ---- recordings ----

  async function listRecordings(rehearsalId: string): Promise<Recording[]> {
    const rows = await db.getAllAsync<RecordingRow>(
      "SELECT * FROM recordings WHERE rehearsal_id = ? AND status != 'recording' ORDER BY created_at",
      [rehearsalId],
    );
    return rows.map(toRecording);
  }

  async function getRecording(id: string): Promise<Recording | null> {
    const row = await db.getFirstAsync<RecordingRow>('SELECT * FROM recordings WHERE id = ?', [id]);
    return row ? toRecording(row) : null;
  }

  /**
   * Writes a placeholder row *before* capture starts, so an interrupted
   * recording (crash, process kill) can be found and recovered on next launch.
   */
  async function beginRecording(input: { rehearsalId: string; name: string; fileUri: string }, id: string = newId()): Promise<Recording> {
    if (!input.name.trim()) throw new ValidationError(['Recording name is required.']);
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO recordings (id, rehearsal_id, name, file_uri, duration_ms, size_bytes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, NULL, 'recording', ?, ?)`,
      [id, input.rehearsalId, input.name.trim(), input.fileUri, now, now],
    );
    const r = await getRecording(id);
    if (!r) throw new NotFoundError('Recording', id);
    return r;
  }

  async function completeRecording(
    id: string,
    data: { durationMs: number; sizeBytes: number | null; fileUri?: string },
  ): Promise<Recording> {
    const res = await db.runAsync(
      `UPDATE recordings SET status = 'saved', duration_ms = ?, size_bytes = ?, file_uri = COALESCE(?, file_uri), updated_at = ?, sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END WHERE id = ?`,
      [Math.max(0, Math.round(data.durationMs)), data.sizeBytes, data.fileUri ?? null, nowIso(), id],
    );
    if (res.changes === 0) throw new NotFoundError('Recording', id);
    const r = await getRecording(id);
    if (!r) throw new NotFoundError('Recording', id);
    return r;
  }

  async function markRecovered(id: string, sizeBytes: number | null): Promise<void> {
    await db.runAsync(`UPDATE recordings SET status = 'recovered', size_bytes = ?, updated_at = ? WHERE id = ?`, [sizeBytes, nowIso(), id]);
  }

  async function renameRecording(id: string, name: string): Promise<void> {
    const n = name.trim();
    if (!n) throw new ValidationError(['Recording name is required.']);
    if (n.length > 120) throw new ValidationError(['Recording name must be at most 120 characters.']);
    const res = await db.runAsync(
      `UPDATE recordings SET name = ?, updated_at = ?, sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END WHERE id = ?`,
      [n, nowIso(), id],
    );
    if (res.changes === 0) throw new NotFoundError('Recording', id);
  }

  /** Deletes the row; if it was ever synced, leaves a tombstone so the cloud copy is deleted on next sync. */
  async function deleteRecordingRow(id: string): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO tombstones (table_name, record_id, remote_path, deleted_at)
         SELECT 'recordings', id, remote_path, ? FROM recordings WHERE id = ? AND (sync_status != 'local' OR remote_path IS NOT NULL)`,
        [nowIso(), id],
      );
      await db.runAsync('DELETE FROM recordings WHERE id = ?', [id]);
    });
  }

  async function pendingRecordings(): Promise<Recording[]> {
    const rows = await db.getAllAsync<RecordingRow>("SELECT * FROM recordings WHERE status = 'recording'");
    return rows.map(toRecording);
  }

  async function allRecordingUris(): Promise<string[]> {
    const rows = await db.getAllAsync<{ file_uri: string }>('SELECT file_uri FROM recordings');
    return rows.map((r) => r.file_uri);
  }

  async function count(): Promise<{ rehearsals: number; recordings: number }> {
    const a = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM rehearsals WHERE deleted_at IS NULL');
    const b = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM recordings c JOIN rehearsals r ON r.id = c.rehearsal_id WHERE r.deleted_at IS NULL AND c.status != 'recording'",
    );
    return { rehearsals: a?.n ?? 0, recordings: b?.n ?? 0 };
  }

  return {
    list,
    get,
    create,
    update,
    remove,
    listRecordings,
    getRecording,
    beginRecording,
    completeRecording,
    markRecovered,
    renameRecording,
    deleteRecordingRow,
    pendingRecordings,
    allRecordingUris,
    count,
  };
}

export type RehearsalsRepository = ReturnType<typeof createRehearsalsRepository>;
