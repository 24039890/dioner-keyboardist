/**
 * Persistence tests on the real SQLite engine (node:sqlite) through the same
 * Db interface the app uses with expo-sqlite.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LATEST_VERSION, MIGRATIONS, getSchemaVersion, migrate } from '@/db/migrations';
import { createProgressRepository } from '@/db/repositories/progress';
import { createRehearsalsRepository } from '@/db/repositories/rehearsals';
import { createSettingsRepository } from '@/db/repositories/settings';
import { type SongInput, createSongsRepository, likePattern } from '@/db/repositories/songs';
import { ValidationError } from '@/db/types';
import {
  type RecordingFileStore,
  InsufficientStorageError,
  MissingRecordingFileError,
  assertStorageAvailable,
  commitRecording,
  deleteRecording,
  deleteRehearsal,
  discardRecording,
  formatDuration,
  recoverInterruptedRecordings,
} from '@/features/rehearsals/services/recordingService';

import { type TestDb, openTestDb } from '../helpers/nodeDb';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

const song = (over: Partial<SongInput> = {}): SongInput => ({
  title: 'Morning Light',
  artist: 'Me',
  songNumber: '014',
  originalKey: { tonic: 0, mode: 'major' },
  tags: ['worship', 'opener'],
  notes: 'Start softly',
  sections: [
    { label: 'Verse', chords: 'C | G | Am | F' },
    { label: 'Chorus', chords: 'F | C | G | Am' },
  ],
  ...over,
});

class FakeStore implements RecordingFileStore {
  files = new Map<string, number>();
  free: number | null = 10 * 1024 * 1024 * 1024;
  exists(uri: string) {
    return this.files.has(uri);
  }
  size(uri: string) {
    return this.files.get(uri) ?? null;
  }
  remove(uri: string) {
    this.files.delete(uri);
  }
  availableBytes() {
    return this.free;
  }
}

let db: TestDb;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});
afterEach(() => db.close());

describe('migrations', () => {
  test('fresh database migrates to the latest version', async () => {
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
  });

  test('re-running migrate is a no-op', async () => {
    expect(await migrate(db)).toEqual([]);
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
  });

  test('a failing migration rolls back and leaves the version unchanged', async () => {
    const broken = [
      ...MIGRATIONS,
      { version: LATEST_VERSION + 1, description: 'broken', sql: 'CREATE TABLE ok_table (a INTEGER); THIS IS NOT SQL;' },
    ];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    const t = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'ok_table'");
    expect(t).toBeNull();
  });

  test('foreign keys are enforced', async () => {
    await expect(
      db.runAsync(
        "INSERT INTO recordings (id, rehearsal_id, name, file_uri, status, created_at, updated_at) VALUES ('r', 'missing', 'x', 'f', 'saved', 'now', 'now')",
      ),
    ).rejects.toThrow();
  });
});

describe('songs repository', () => {
  test('create, read with sections, and list', async () => {
    const repo = createSongsRepository(db);
    const created = await repo.create(song());
    expect(created.sections.map((s) => s.label)).toEqual(['Verse', 'Chorus']);
    const loaded = await repo.get(created.id);
    expect(loaded?.originalKey).toEqual({ tonic: 0, mode: 'major' });
    expect(loaded?.tags).toEqual(['worship', 'opener']);
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.firstLine).toBe('C | G | Am | F');
  });

  test('edit replaces fields and sections atomically', async () => {
    const repo = createSongsRepository(db);
    const s = await repo.create(song());
    const updated = await repo.update(
      s.id,
      song({ title: 'Morning Light (v2)', originalKey: { tonic: 2, mode: 'major' }, sections: [{ label: 'Intro', chords: 'D A' }] }),
    );
    expect(updated.title).toBe('Morning Light (v2)');
    expect(updated.sections).toHaveLength(1);
    expect(updated.originalKey.tonic).toBe(2);
  });

  test('a failed section write rolls back the whole edit', async () => {
    const repo = createSongsRepository(db);
    const s = await repo.create(song());
    db.failNextWrite = /INSERT INTO song_sections/;
    await expect(repo.update(s.id, song({ title: 'Should not persist' }))).rejects.toThrow('Simulated write failure');
    const after = await repo.get(s.id);
    expect(after?.title).toBe('Morning Light');
    expect(after?.sections).toHaveLength(2);
  });

  test('a failed create leaves no partial song', async () => {
    const repo = createSongsRepository(db);
    db.failNextWrite = /INSERT INTO song_sections/;
    await expect(repo.create(song())).rejects.toThrow();
    expect(await repo.count()).toBe(0);
  });

  test('validation rejects bad input with readable issues', async () => {
    const repo = createSongsRepository(db);
    await expect(repo.create(song({ title: '   ' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.create(song({ originalKey: { tonic: 13, mode: 'major' } }))).rejects.toThrow('Original key is invalid.');
    await expect(repo.create(song({ songNumber: 'x'.repeat(21) }))).rejects.toThrow(/Song number/);
  });

  test('duplicate IDs are rejected by the primary key', async () => {
    const repo = createSongsRepository(db);
    await repo.create(song(), 'fixed-id');
    await expect(repo.create(song({ title: 'Other' }), 'fixed-id')).rejects.toThrow();
    expect(await repo.count()).toBe(1);
  });

  test('search covers title, artist, number, tags and chords; wildcards are literal', async () => {
    const repo = createSongsRepository(db);
    await repo.create(song());
    await repo.create(
      song({
        title: 'Still Waters',
        artist: 'Band',
        songNumber: '031',
        tags: ['ballad'],
        originalKey: { tonic: 9, mode: 'minor' },
        sections: [{ label: 'V', chords: 'Am F C G7sus4' }],
      }),
    );
    await repo.create(song({ title: '100% Grace', tags: [], sections: [] }));
    const titles = async (query: string) => (await repo.list({ query })).map((s) => s.title);
    expect(await titles('still')).toEqual(['Still Waters']);
    expect(await titles('031')).toEqual(['Still Waters']);
    expect(await titles('ballad')).toEqual(['Still Waters']);
    expect(await titles('G7sus4')).toEqual(['Still Waters']);
    expect(await titles('100%')).toEqual(['100% Grace']);
    expect(await titles('%')).toEqual(['100% Grace']);
    expect(likePattern('a_b')).toBe('%a\\_b%');
  });

  test('filters by mode, tonic and saved', async () => {
    const repo = createSongsRepository(db);
    const a = await repo.create(song());
    await repo.create(song({ title: 'Minor song', originalKey: { tonic: 9, mode: 'minor' } }));
    await repo.setSaved(a.id, true);
    expect((await repo.list({ mode: 'minor' })).map((s) => s.title)).toEqual(['Minor song']);
    expect((await repo.list({ tonic: 0 })).map((s) => s.title)).toEqual(['Morning Light']);
    expect((await repo.list({ savedOnly: true })).map((s) => s.id)).toEqual([a.id]);
  });

  test('delete is a soft delete hidden from reads', async () => {
    const repo = createSongsRepository(db);
    const s = await repo.create(song());
    await repo.remove(s.id);
    expect(await repo.get(s.id)).toBeNull();
    expect(await repo.list()).toHaveLength(0);
    const row = await db.getFirstAsync<{ deleted_at: string | null }>('SELECT deleted_at FROM songs WHERE id = ?', [s.id]);
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe('restart persistence (file-backed database)', () => {
  test('songs, rehearsals and progress survive closing and reopening', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dioner-')), 'test.db');
    const first = openTestDb(file);
    await migrate(first);
    const s = await createSongsRepository(first).create(song());
    const r = await createRehearsalsRepository(first).create({
      title: 'Tuesday run',
      songId: s.id,
      originalKey: s.originalKey,
      transpositionSemitones: 2,
    });
    await createProgressRepository(first).recordAttempt('b1-keyboard', 4, 5);
    await createSettingsRepository(first).set('onboardingComplete', true);
    first.close();

    const second = openTestDb(file);
    expect(await migrate(second)).toEqual([]);
    expect((await createSongsRepository(second).get(s.id))?.title).toBe('Morning Light');
    const reh = await createRehearsalsRepository(second).get(r.id);
    expect(reh?.playedKey).toEqual({ tonic: 2, mode: 'major' });
    expect(reh?.songTitle).toBe('Morning Light');
    expect((await createProgressRepository(second).get('b1-keyboard'))?.completedAt).not.toBeNull();
    expect((await createSettingsRepository(second).load()).onboardingComplete).toBe(true);
    second.close();
  });
});

describe('rehearsals and recordings', () => {
  test('create with song, keys and offset; search and filter', async () => {
    const songs = createSongsRepository(db);
    const repo = createRehearsalsRepository(db);
    const s = await songs.create(song());
    await repo.create({
      title: 'Tuesday Band Run',
      songId: s.id,
      originalKey: s.originalKey,
      transpositionSemitones: 2,
      notes: 'Second chorus transition',
    });
    await repo.create({ title: 'Vocal check' });
    expect((await repo.list({ query: 'chorus' })).map((r) => r.title)).toEqual(['Tuesday Band Run']);
    expect((await repo.list({ query: 'Morning' })).map((r) => r.title)).toEqual(['Tuesday Band Run']);
    expect((await repo.list({ songId: s.id })).length).toBe(1);
    expect((await repo.list({ since: '2999-01-01' })).length).toBe(0);
    await expect(repo.create({ title: 'x', transpositionSemitones: 12 })).rejects.toBeInstanceOf(ValidationError);
  });

  test('negative offsets compute the played key', async () => {
    const repo = createRehearsalsRepository(db);
    const r = await repo.create({ title: 'Down', originalKey: { tonic: 0, mode: 'major' }, transpositionSemitones: -1 });
    expect(r.playedKey).toEqual({ tonic: 11, mode: 'major' });
  });

  test('a recording is only listed after its file and metadata are committed', async () => {
    const repo = createRehearsalsRepository(db);
    const store = new FakeStore();
    const r = await repo.create({ title: 'Run' });
    const rec = await repo.beginRecording({ rehearsalId: r.id, name: 'Take 1', fileUri: 'file:///doc/Audio/take1.m4a' });
    expect(await repo.listRecordings(r.id)).toHaveLength(0);
    // File missing → commit refuses and the take stays unsaved.
    await expect(commitRecording(repo, store, { recordingId: rec.id, fileUri: rec.fileUri, durationMs: 1000 })).rejects.toBeInstanceOf(
      MissingRecordingFileError,
    );
    expect(await repo.listRecordings(r.id)).toHaveLength(0);
    store.files.set(rec.fileUri, 12345);
    const saved = await commitRecording(repo, store, { recordingId: rec.id, fileUri: rec.fileUri, durationMs: 61500 });
    expect(saved.status).toBe('saved');
    expect(saved.sizeBytes).toBe(12345);
    expect((await repo.get(r.id))?.recordingCount).toBe(1);
    expect((await repo.get(r.id))?.totalDurationMs).toBe(61500);
  });

  test('a failed metadata write never reports success; recovery picks the take up later', async () => {
    const repo = createRehearsalsRepository(db);
    const store = new FakeStore();
    const r = await repo.create({ title: 'Run' });
    const rec = await repo.beginRecording({ rehearsalId: r.id, name: 'Take 1', fileUri: 'file:///a.m4a' });
    store.files.set(rec.fileUri, 999);
    db.failNextWrite = /UPDATE recordings SET status = 'saved'/;
    await expect(commitRecording(repo, store, { recordingId: rec.id, fileUri: rec.fileUri, durationMs: 5000 })).rejects.toThrow();
    expect((await repo.getRecording(rec.id))?.status).toBe('recording');
    const report = await recoverInterruptedRecordings(repo, store);
    expect(report).toEqual({ recovered: 1, removed: 0 });
    expect((await repo.getRecording(rec.id))?.status).toBe('recovered');
  });

  test('interrupted recordings without a file are cleaned up', async () => {
    const repo = createRehearsalsRepository(db);
    const store = new FakeStore();
    const r = await repo.create({ title: 'Run' });
    await repo.beginRecording({ rehearsalId: r.id, name: 'Crashed', fileUri: 'file:///gone.m4a' });
    const empty = await repo.beginRecording({ rehearsalId: r.id, name: 'Empty', fileUri: 'file:///empty.m4a' });
    store.files.set(empty.fileUri, 0);
    expect(await recoverInterruptedRecordings(repo, store)).toEqual({ recovered: 0, removed: 2 });
    expect(store.files.size).toBe(0);
    expect(await repo.pendingRecordings()).toHaveLength(0);
  });

  test('rename, discard and delete', async () => {
    const repo = createRehearsalsRepository(db);
    const store = new FakeStore();
    const r = await repo.create({ title: 'Run' });
    const a = await repo.beginRecording({ rehearsalId: r.id, name: 'Take 1', fileUri: 'file:///1.m4a' });
    store.files.set(a.fileUri, 10);
    await commitRecording(repo, store, { recordingId: a.id, fileUri: a.fileUri, durationMs: 100 });
    await repo.renameRecording(a.id, 'Best take');
    expect((await repo.getRecording(a.id))?.name).toBe('Best take');
    await expect(repo.renameRecording(a.id, ' ')).rejects.toBeInstanceOf(ValidationError);

    const b = await repo.beginRecording({ rehearsalId: r.id, name: 'Take 2', fileUri: 'file:///2.m4a' });
    store.files.set(b.fileUri, 10);
    await discardRecording(repo, store, b);
    expect(store.exists(b.fileUri)).toBe(false);
    expect(await repo.getRecording(b.id)).toBeNull();

    await deleteRecording(repo, store, a.id);
    expect(store.exists(a.fileUri)).toBe(false);
    expect(await repo.listRecordings(r.id)).toHaveLength(0);
  });

  test('missing files are detectable while metadata remains', async () => {
    const repo = createRehearsalsRepository(db);
    const store = new FakeStore();
    const r = await repo.create({ title: 'Run' });
    const a = await repo.beginRecording({ rehearsalId: r.id, name: 'Take', fileUri: 'file:///x.m4a' });
    store.files.set(a.fileUri, 10);
    await commitRecording(repo, store, { recordingId: a.id, fileUri: a.fileUri, durationMs: 100 });
    store.files.clear(); // file removed outside the app
    const [rec] = await repo.listRecordings(r.id);
    expect(rec).toBeDefined();
    expect(store.exists(rec!.fileUri)).toBe(false);
    // Deleting still works and cleans up the metadata.
    await deleteRecording(repo, store, a.id);
    expect(await repo.listRecordings(r.id)).toHaveLength(0);
  });

  test('deleting a rehearsal removes its recording files', async () => {
    const repo = createRehearsalsRepository(db);
    const store = new FakeStore();
    const r = await repo.create({ title: 'Run' });
    for (const n of [1, 2]) {
      const rec = await repo.beginRecording({ rehearsalId: r.id, name: `Take ${n}`, fileUri: `file:///${n}.m4a` });
      store.files.set(rec.fileUri, 5);
      await commitRecording(repo, store, { recordingId: rec.id, fileUri: rec.fileUri, durationMs: 10 });
    }
    await deleteRehearsal(repo, store, r.id);
    expect(store.files.size).toBe(0);
    expect(await repo.get(r.id)).toBeNull();
  });

  test('insufficient storage is refused before recording', () => {
    const store = new FakeStore();
    store.free = 10 * 1024 * 1024;
    expect(() => assertStorageAvailable(store)).toThrow(InsufficientStorageError);
    store.free = null; // unknown → allowed
    expect(() => assertStorageAvailable(store)).not.toThrow();
  });

  test('duration formatting', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(61500)).toBe('1:01');
    expect(formatDuration(3723000)).toBe('1:02:03');
  });
});

describe('learning progress and settings', () => {
  test('attempts, best score and sticky completion', async () => {
    const repo = createProgressRepository(db);
    expect((await repo.recordAttempt('l1', 2, 5)).completedAt).toBeNull();
    const p = await repo.recordAttempt('l1', 4, 5);
    expect(p.attempts).toBe(2);
    expect(p.bestScore).toBe(4);
    expect(p.completedAt).not.toBeNull();
    const again = await repo.recordAttempt('l1', 1, 5);
    expect(again.bestScore).toBe(4);
    expect(again.lastScore).toBe(1);
    expect(again.completedAt).toBe(p.completedAt);
    await expect(repo.recordAttempt('l1', 6, 5)).rejects.toThrow();
  });

  test('settings fall back to safe defaults for unknown values', async () => {
    const repo = createSettingsRepository(db);
    expect((await repo.load()).learningPath).toBe('beginner');
    await repo.set('learningPath', 'experienced');
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('inputMode', 'theremin')");
    const s = await repo.load();
    expect(s.learningPath).toBe('experienced');
    expect(s.inputMode).toBe('microphone');
  });
});
