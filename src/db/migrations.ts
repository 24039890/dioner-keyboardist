/**
 * Versioned local migrations, tracked with PRAGMA user_version.
 * Each migration runs in a transaction together with its version bump, so a
 * failed migration leaves the database at the previous version.
 * Re-running `migrate` on an up-to-date database does nothing.
 */
import type { Db } from './types';

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Initial schema: settings, songs, sections, rehearsals, recordings, lesson progress',
    sql: `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  artist TEXT,
  song_number TEXT,
  original_key TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  lyrics TEXT,
  source_attribution TEXT,
  is_saved INTEGER NOT NULL DEFAULT 0 CHECK (is_saved IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs (title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_songs_deleted ON songs (deleted_at);

CREATE TABLE IF NOT EXISTS song_sections (
  id TEXT PRIMARY KEY NOT NULL,
  song_id TEXT NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  chords TEXT NOT NULL,
  UNIQUE (song_id, position)
);

CREATE TABLE IF NOT EXISTS rehearsals (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  song_id TEXT REFERENCES songs (id) ON DELETE SET NULL,
  original_key TEXT,
  played_key TEXT,
  transposition_semitones INTEGER NOT NULL DEFAULT 0 CHECK (transposition_semitones BETWEEN -11 AND 11),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_rehearsals_song ON rehearsals (song_id);
CREATE INDEX IF NOT EXISTS idx_rehearsals_created ON rehearsals (created_at);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY NOT NULL,
  rehearsal_id TEXT NOT NULL REFERENCES rehearsals (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  file_uri TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  size_bytes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('recording', 'saved', 'recovered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_recordings_rehearsal ON recordings (rehearsal_id);

CREATE TABLE IF NOT EXISTS lesson_progress (
  lesson_id TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER,
  last_score INTEGER,
  question_count INTEGER,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    description: 'Cloud sync bookkeeping: progress sync status, recording cloud path, deletion tombstones',
    sql: `
ALTER TABLE lesson_progress ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local';
ALTER TABLE recordings ADD COLUMN remote_path TEXT;
CREATE TABLE IF NOT EXISTS tombstones (
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  remote_path TEXT,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (table_name, record_id)
);
`,
  },
  {
    version: 3,
    description: 'Video tutorial history: opened and watched state',
    sql: `
CREATE TABLE IF NOT EXISTS video_progress (
  video_id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  watch_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  opened_at TEXT NOT NULL,
  watched INTEGER NOT NULL DEFAULT 0 CHECK (watched IN (0, 1)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_progress_opened ON video_progress (opened_at);
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export async function getSchemaVersion(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Applies pending migrations. Returns the versions that were applied. */
export async function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const current = await getSchemaVersion(db);
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      // PRAGMA does not accept bound parameters; version is a trusted integer constant.
      await db.execAsync(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
    applied.push(m.version);
  }
  return applied;
}
