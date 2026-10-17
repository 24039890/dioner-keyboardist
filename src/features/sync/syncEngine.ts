/**
 * Two-way sync between the local SQLite database and the user's cloud data.
 *
 * Order: push (songs → sections → rehearsals → recordings → progress →
 * deletions), then pull (songs → rehearsals → recordings → progress).
 * Upserts by UUID make retries idempotent (no duplicates). A failure on one
 * record is recorded and the rest continue; failed records stay pending and
 * are retried next time. Local data is never deleted because of a sync error.
 */
import type { SyncRepository } from '../../db/repositories/sync';
import type { RecordingFileStore } from '../rehearsals/services/recordingService';
import type { RemoteProgress, RemoteRecording, RemoteRehearsal, RemoteSection, RemoteSong, RemoteStore } from './types';

export interface SyncOptions {
  ownerId: string;
  /** Upload recording audio files (opt-in; metadata is always synced). */
  uploadAudio: boolean;
  onProgress?: (message: string) => void;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  audioUploaded: number;
  deletedRemotely: number;
  errors: string[];
  finishedAt: string;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function audioPath(ownerId: string, recordingId: string): string {
  return `${ownerId}/${recordingId}.m4a`;
}

function maxTime(current: string | null, rows: { updated_at: string }[]): string | null {
  let best = current;
  for (const r of rows) if (!best || Date.parse(r.updated_at) > Date.parse(best)) best = r.updated_at;
  return best;
}

export async function runSync(
  local: SyncRepository,
  remote: RemoteStore,
  files: RecordingFileStore,
  opts: SyncOptions,
): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, audioUploaded: 0, deletedRemotely: 0, errors: [], finishedAt: '' };
  const { ownerId } = opts;
  const progress = (m: string) => opts.onProgress?.(m);

  // ---------------- push ----------------
  progress('Uploading songs…');
  for (const s of await local.dirtySongs()) {
    try {
      const row: RemoteSong = {
        id: s.id,
        owner_id: ownerId,
        title: s.title,
        artist: s.artist,
        song_number: s.song_number,
        original_key: s.original_key,
        tags: safeTags(s.tags),
        notes: s.notes,
        lyrics: s.lyrics,
        source_attribution: s.source_attribution,
        is_saved: s.is_saved === 1,
        created_at: s.created_at,
        updated_at: s.updated_at,
        deleted_at: s.deleted_at,
      };
      await remote.upsertSongs([row]);
      const sections: RemoteSection[] = (await local.sectionsOf(s.id)).map((x) => ({ ...x, owner_id: ownerId, song_id: s.id }));
      await remote.replaceSections(s.id, sections);
      await local.markSynced('songs', s.id, s.updated_at);
      report.pushed++;
    } catch (e) {
      report.errors.push(`Song “${s.title}”: ${errText(e)}`);
    }
  }

  progress('Uploading rehearsals…');
  for (const r of await local.dirtyRehearsals()) {
    try {
      const row: RemoteRehearsal = { ...r, owner_id: ownerId };
      await remote.upsertRehearsals([row]);
      await local.markSynced('rehearsals', r.id, r.updated_at);
      report.pushed++;
    } catch (e) {
      report.errors.push(`Rehearsal “${r.title}”: ${errText(e)}`);
    }
  }

  if (opts.uploadAudio) {
    const missing = (await local.recordingsMissingAudio()).filter((r) => files.exists(r.file_uri));
    let i = 0;
    for (const rec of missing) {
      i++;
      progress(`Uploading recording ${i} of ${missing.length}…`);
      try {
        const path = audioPath(ownerId, rec.id);
        await remote.uploadAudio(path, rec.file_uri);
        await local.setRemotePath(rec.id, path);
        report.audioUploaded++;
      } catch (e) {
        report.errors.push(`Audio for “${rec.name}”: ${errText(e)}`);
      }
    }
  }

  progress('Uploading recording details…');
  for (const rec of await local.dirtyRecordings()) {
    try {
      const row: RemoteRecording = {
        id: rec.id,
        owner_id: ownerId,
        rehearsal_id: rec.rehearsal_id,
        name: rec.name,
        storage_path: rec.remote_path,
        duration_ms: rec.duration_ms,
        size_bytes: rec.size_bytes,
        created_at: rec.created_at,
        updated_at: rec.updated_at,
        deleted_at: null,
      };
      await remote.upsertRecordings([row]);
      await local.markSynced('recordings', rec.id, rec.updated_at);
      report.pushed++;
    } catch (e) {
      report.errors.push(`Recording “${rec.name}”: ${errText(e)}`);
    }
  }

  for (const p of await local.dirtyProgress()) {
    try {
      const row: RemoteProgress = { ...p, owner_id: ownerId };
      await remote.upsertProgress([row]);
      await local.markProgressSynced(p.lesson_id, p.updated_at);
      report.pushed++;
    } catch (e) {
      report.errors.push(`Lesson progress ${p.lesson_id}: ${errText(e)}`);
    }
  }

  for (const t of await local.tombstones()) {
    try {
      if (t.table_name === 'recordings') {
        if (t.remote_path) await remote.removeAudio(t.remote_path);
        await remote.deleteRecording(t.record_id);
      }
      await local.clearTombstone(t.table_name, t.record_id);
      report.deletedRemotely++;
    } catch (e) {
      report.errors.push(`Deleting ${t.table_name} ${t.record_id}: ${errText(e)}`);
    }
  }

  // ---------------- pull ----------------
  progress('Downloading changes…');
  try {
    const since = await local.getState('pulled.songs');
    const songs = await remote.songsSince(since);
    const sections = songs.length ? await remote.sectionsFor(songs.map((s) => s.id)) : [];
    for (const s of songs) {
      if (
        await local.applySong(
          s,
          sections.filter((x) => x.song_id === s.id),
        )
      )
        report.pulled++;
    }
    await local.setState('pulled.songs', maxTime(since, songs));
  } catch (e) {
    report.errors.push(`Downloading songs: ${errText(e)}`);
  }

  try {
    const since = await local.getState('pulled.rehearsals');
    const rows = await remote.rehearsalsSince(since);
    for (const r of rows) if (await local.applyRehearsal(r)) report.pulled++;
    await local.setState('pulled.rehearsals', maxTime(since, rows));
  } catch (e) {
    report.errors.push(`Downloading rehearsals: ${errText(e)}`);
  }

  try {
    const since = await local.getState('pulled.recordings');
    const rows = await remote.recordingsSince(since);
    for (const r of rows) {
      const res = await local.applyRecording(r);
      if (res.deleteLocalFile && files.exists(res.deleteLocalFile)) files.remove(res.deleteLocalFile);
      if (res.applied) report.pulled++;
    }
    await local.setState('pulled.recordings', maxTime(since, rows));
  } catch (e) {
    report.errors.push(`Downloading recordings: ${errText(e)}`);
  }

  try {
    const since = await local.getState('pulled.progress');
    const rows = await remote.progressSince(since);
    for (const p of rows) if (await local.applyProgress(p)) report.pulled++;
    await local.setState('pulled.progress', maxTime(since, rows));
  } catch (e) {
    report.errors.push(`Downloading progress: ${errText(e)}`);
  }

  report.finishedAt = new Date().toISOString();
  await local.setState('lastSyncAt', report.finishedAt);
  return report;
}

function safeTags(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Which account the local library is linked to; prevents mixing two accounts' data. */
export type LinkCheck = { kind: 'unlinked' } | { kind: 'linked-same' } | { kind: 'linked-other'; otherAccountId: string };

export async function checkAccountLink(local: SyncRepository, userId: string): Promise<LinkCheck> {
  const linked = await local.getState('accountId');
  if (!linked) return { kind: 'unlinked' };
  return linked === userId ? { kind: 'linked-same' } : { kind: 'linked-other', otherAccountId: linked };
}

/** Links this device's library to an account and resets pull cursors so everything is fetched. */
export async function linkAccount(local: SyncRepository, userId: string): Promise<void> {
  const previous = await local.getState('accountId');
  if (previous && previous !== userId) await local.requeueAll();
  await local.setState('accountId', userId);
  for (const k of ['pulled.songs', 'pulled.rehearsals', 'pulled.recordings', 'pulled.progress']) await local.setState(k, null);
}
