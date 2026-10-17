/**
 * Sync engine on real SQLite (node:sqlite) against an in-memory fake cloud.
 * The fake enforces nothing about RLS — ownership on the server is covered by
 * supabase/tests/rls_ownership.sql, which must be run against a real project.
 */
import { migrate } from '@/db/migrations';
import { createProgressRepository } from '@/db/repositories/progress';
import { createRehearsalsRepository } from '@/db/repositories/rehearsals';
import { createSongsRepository } from '@/db/repositories/songs';
import { createSyncRepository } from '@/db/repositories/sync';
import { validateSupabaseEnv } from '@/config/env';
import type { RecordingFileStore } from '@/features/rehearsals/services/recordingService';
import { commitRecording, deleteRecording } from '@/features/rehearsals/services/recordingService';
import { audioPath, checkAccountLink, linkAccount, runSync } from '@/features/sync/syncEngine';
import type { RemoteProgress, RemoteRecording, RemoteRehearsal, RemoteSection, RemoteSong, RemoteStore } from '@/features/sync/types';

import { type TestDb, openTestDb } from '../helpers/nodeDb';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

const OWNER = '00000000-0000-4000-8000-0000000000aa';

class FakeCloud implements RemoteStore {
  songs = new Map<string, RemoteSong>();
  sections = new Map<string, RemoteSection>();
  rehearsals = new Map<string, RemoteRehearsal>();
  recordings = new Map<string, RemoteRecording>();
  progress = new Map<string, RemoteProgress>();
  audio = new Set<string>();
  failOn: string | null = null;
  calls: string[] = [];

  private maybeFail(op: string) {
    this.calls.push(op);
    if (this.failOn === op) throw new Error(`network down during ${op}`);
  }
  private sinceOf<T extends { updated_at: string }>(m: Map<string, T>, t: string | null) {
    return [...m.values()]
      .filter((r) => !t || Date.parse(r.updated_at) > Date.parse(t))
      .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at));
  }
  async upsertSongs(rows: RemoteSong[]) {
    this.maybeFail('upsertSongs');
    rows.forEach((r) => this.songs.set(r.id, { ...r }));
  }
  async replaceSections(songId: string, rows: RemoteSection[]) {
    this.maybeFail('replaceSections');
    for (const [k, v] of this.sections) if (v.song_id === songId) this.sections.delete(k);
    rows.forEach((r) => this.sections.set(r.id, { ...r }));
  }
  async upsertRehearsals(rows: RemoteRehearsal[]) {
    this.maybeFail('upsertRehearsals');
    rows.forEach((r) => {
      if (r.song_id && !this.songs.has(r.song_id)) throw new Error('foreign key: song missing');
      this.rehearsals.set(r.id, { ...r });
    });
  }
  async upsertRecordings(rows: RemoteRecording[]) {
    this.maybeFail('upsertRecordings');
    rows.forEach((r) => this.recordings.set(r.id, { ...r }));
  }
  async deleteRecording(id: string) {
    this.maybeFail('deleteRecording');
    const r = this.recordings.get(id);
    if (r)
      this.recordings.set(id, { ...r, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), storage_path: null });
  }
  async upsertProgress(rows: RemoteProgress[]) {
    this.maybeFail('upsertProgress');
    rows.forEach((r) => this.progress.set(r.lesson_id, { ...r }));
  }
  async songsSince(t: string | null) {
    return this.sinceOf(this.songs, t);
  }
  async sectionsFor(ids: string[]) {
    return [...this.sections.values()].filter((s) => ids.includes(s.song_id));
  }
  async rehearsalsSince(t: string | null) {
    return this.sinceOf(this.rehearsals, t);
  }
  async recordingsSince(t: string | null) {
    return this.sinceOf(this.recordings, t);
  }
  async progressSince(t: string | null) {
    return this.sinceOf(this.progress, t);
  }
  async uploadAudio(path: string) {
    this.maybeFail('uploadAudio');
    this.audio.add(path);
  }
  async removeAudio(path: string) {
    this.maybeFail('removeAudio');
    this.audio.delete(path);
  }
}

class Files implements RecordingFileStore {
  files = new Map<string, number>();
  exists = (u: string) => this.files.has(u);
  size = (u: string) => this.files.get(u) ?? null;
  remove = (u: string) => void this.files.delete(u);
  availableBytes = () => 1e12;
}

async function device() {
  const db: TestDb = openTestDb();
  await migrate(db);
  return {
    db,
    songs: createSongsRepository(db),
    rehearsals: createRehearsalsRepository(db),
    progress: createProgressRepository(db),
    sync: createSyncRepository(db),
    files: new Files(),
  };
}

const songInput = (title = 'Morning Light') => ({
  title,
  originalKey: { tonic: 0, mode: 'major' as const },
  tags: ['opener'],
  sections: [{ label: 'Verse', chords: 'C | G | Am | F' }],
});

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('env validation', () => {
  test('missing, placeholder, secret and valid configurations', () => {
    expect(validateSupabaseEnv(undefined, undefined).status).toBe('missing');
    expect(validateSupabaseEnv('https://your-project-ref.supabase.co', 'your-public-anon-key').status).toBe('invalid');
    expect(validateSupabaseEnv('https://abc.supabase.co', 'sb_secret_123').status).toBe('invalid');
    const serviceJwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`;
    const res = validateSupabaseEnv('https://abc.supabase.co', serviceJwt);
    expect(res.status === 'invalid' && res.problems.join(' ')).toMatch(/secret/);
    expect(validateSupabaseEnv('ftp://nope', 'sb_publishable_x').status).toBe('invalid');
    expect(validateSupabaseEnv('https://abcdefgh.supabase.co/', 'sb_publishable_abc')).toEqual({
      status: 'configured',
      url: 'https://abcdefgh.supabase.co',
      key: 'sb_publishable_abc',
    });
  });
});

describe('sync engine', () => {
  test('guest data is pushed once (no duplicates on re-sync) and marked synced', async () => {
    const d = await device();
    const cloud = new FakeCloud();
    const s = await d.songs.create(songInput());
    await d.rehearsals.create({ title: 'Run', songId: s.id, originalKey: s.originalKey, transpositionSemitones: 2 });
    await d.progress.recordAttempt('b1-keyboard-layout', 5, 6);
    expect(await d.sync.unsyncedCount()).toBe(3);

    const r1 = await runSync(d.sync, cloud, d.files, { ownerId: OWNER, uploadAudio: false });
    expect(r1.errors).toEqual([]);
    expect(r1.pushed).toBe(3);
    expect(cloud.songs.size).toBe(1);
    expect(cloud.songs.get(s.id)?.owner_id).toBe(OWNER);
    expect([...cloud.sections.values()].map((x) => x.chords)).toEqual(['C | G | Am | F']);
    expect(await d.sync.unsyncedCount()).toBe(0);

    const r2 = await runSync(d.sync, cloud, d.files, { ownerId: OWNER, uploadAudio: false });
    expect(r2.pushed).toBe(0);
    expect(cloud.songs.size).toBe(1);
  });

  test('a second device pulls everything; edits flow back; deletions propagate', async () => {
    const a = await device();
    const b = await device();
    const cloud = new FakeCloud();
    const s = await a.songs.create(songInput());
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });

    const pulled = await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });
    expect(pulled.pulled).toBe(1);
    expect((await b.songs.get(s.id))?.sections[0]?.chords).toBe('C | G | Am | F');

    await tick();
    await b.songs.update(s.id, { ...songInput('Morning Light (v2)'), sections: [{ label: 'Verse', chords: 'D | A' }] });
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });
    expect((await a.songs.get(s.id))?.title).toBe('Morning Light (v2)');
    expect((await a.songs.get(s.id))?.sections[0]?.chords).toBe('D | A');

    await tick();
    await a.songs.remove(s.id);
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });
    expect(cloud.songs.get(s.id)?.deleted_at).not.toBeNull();
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });
    expect(await b.songs.get(s.id)).toBeNull();
  });

  test('conflict: the newer edit wins, and an unsynced newer local edit is not overwritten', async () => {
    const a = await device();
    const b = await device();
    const cloud = new FakeCloud();
    const s = await a.songs.create(songInput());
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });

    await tick();
    await a.songs.update(s.id, songInput('Edited on A (older)'));
    await tick();
    await b.songs.update(s.id, songInput('Edited on B (newer)'));
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false }); // A pushes older edit
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false }); // B keeps newer local, pushes it
    expect((await b.songs.get(s.id))?.title).toBe('Edited on B (newer)');
    expect(cloud.songs.get(s.id)?.title).toBe('Edited on B (newer)');
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });
    expect((await a.songs.get(s.id))?.title).toBe('Edited on B (newer)');
  });

  test('a network failure leaves records pending and a retry completes them; local data is kept', async () => {
    const d = await device();
    const cloud = new FakeCloud();
    const s = await d.songs.create(songInput());
    await d.rehearsals.create({ title: 'Run', songId: s.id });
    cloud.failOn = 'upsertSongs';
    const r1 = await runSync(d.sync, cloud, d.files, { ownerId: OWNER, uploadAudio: false });
    expect(r1.errors.length).toBeGreaterThan(0);
    expect(await d.sync.unsyncedCount()).toBe(2); // song failed; rehearsal failed on FK
    expect(await d.songs.get(s.id)).not.toBeNull();
    cloud.failOn = null;
    const r2 = await runSync(d.sync, cloud, d.files, { ownerId: OWNER, uploadAudio: false });
    expect(r2.errors).toEqual([]);
    expect(await d.sync.unsyncedCount()).toBe(0);
  });

  test('recording audio upload is opt-in; deletes remove the cloud file and propagate', async () => {
    const a = await device();
    const b = await device();
    const cloud = new FakeCloud();
    const r = await a.rehearsals.create({ title: 'Run' });
    const rec = await a.rehearsals.beginRecording({ rehearsalId: r.id, name: 'Take 1', fileUri: 'file:///take1.m4a' });
    a.files.files.set(rec.fileUri, 1000);
    await commitRecording(a.rehearsals, a.files, { recordingId: rec.id, fileUri: rec.fileUri, durationMs: 5000 });

    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });
    expect(cloud.recordings.get(rec.id)?.storage_path).toBeNull();
    expect(cloud.audio.size).toBe(0);

    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: true });
    expect(cloud.audio.has(audioPath(OWNER, rec.id))).toBe(true);
    expect(cloud.recordings.get(rec.id)?.storage_path).toBe(audioPath(OWNER, rec.id));

    // Device B gets metadata only (streams the audio on demand).
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });
    const onB = await b.rehearsals.getRecording(rec.id);
    expect(onB?.fileUri).toBe('');
    expect(onB?.remotePath).toBe(audioPath(OWNER, rec.id));

    await deleteRecording(a.rehearsals, a.files, rec.id);
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: true });
    expect(cloud.audio.size).toBe(0);
    expect(cloud.recordings.get(rec.id)?.deleted_at).not.toBeNull();
    await tick();
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });
    expect(await b.rehearsals.getRecording(rec.id)).toBeNull();
  });

  test('progress syncs both ways', async () => {
    const a = await device();
    const b = await device();
    const cloud = new FakeCloud();
    await a.progress.recordAttempt('e1-number-system', 6, 6);
    await runSync(a.sync, cloud, a.files, { ownerId: OWNER, uploadAudio: false });
    await runSync(b.sync, cloud, b.files, { ownerId: OWNER, uploadAudio: false });
    expect((await b.progress.get('e1-number-system'))?.bestScore).toBe(6);
  });

  test('account linking: unlinked → linked; a different account re-queues everything', async () => {
    const d = await device();
    const cloud = new FakeCloud();
    expect(await checkAccountLink(d.sync, OWNER)).toEqual({ kind: 'unlinked' });
    await linkAccount(d.sync, OWNER);
    expect(await checkAccountLink(d.sync, OWNER)).toEqual({ kind: 'linked-same' });
    await d.songs.create(songInput());
    await runSync(d.sync, cloud, d.files, { ownerId: OWNER, uploadAudio: false });
    expect(await d.sync.unsyncedCount()).toBe(0);
    const other = '00000000-0000-4000-8000-0000000000bb';
    expect(await checkAccountLink(d.sync, other)).toEqual({ kind: 'linked-other', otherAccountId: OWNER });
    await linkAccount(d.sync, other);
    expect(await d.sync.unsyncedCount()).toBe(1);
  });
});
