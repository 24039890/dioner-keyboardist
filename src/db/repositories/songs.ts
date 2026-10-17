import { type Key, decodeKey, encodeKey } from '../../features/music-theory/keys';
import { newId, nowIso } from '../../utils/id';
import { type Db, type SqlValue, type SyncStatus, NotFoundError, ValidationError } from '../types';

export interface SongSection {
  id: string;
  label: string;
  chords: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  songNumber: string | null;
  originalKey: Key;
  tags: string[];
  notes: string | null;
  lyrics: string | null;
  sourceAttribution: string | null;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface SongWithSections extends Song {
  sections: SongSection[];
}

export interface SongInput {
  title: string;
  artist?: string | null;
  songNumber?: string | null;
  originalKey: Key;
  tags?: string[];
  notes?: string | null;
  lyrics?: string | null;
  sourceAttribution?: string | null;
  isSaved?: boolean;
  sections: { label: string; chords: string }[];
}

export interface SongFilter {
  query?: string;
  mode?: 'major' | 'minor';
  tonic?: number;
  savedOnly?: boolean;
}

interface SongRow {
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
  sync_status: string;
}

export const SONG_LIMITS = {
  title: 200,
  artist: 200,
  songNumber: 20,
  tag: 30,
  tags: 20,
  notes: 5000,
  lyrics: 20000,
  attribution: 500,
  sections: 50,
  sectionLabel: 40,
  chordLine: 500,
} as const;

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t.length > 0 ? t : null;
};

export function validateSongInput(input: SongInput): string[] {
  const issues: string[] = [];
  const title = input.title.trim();
  if (!title) issues.push('Title is required.');
  if (title.length > SONG_LIMITS.title) issues.push(`Title must be at most ${SONG_LIMITS.title} characters.`);
  if ((input.artist ?? '').length > SONG_LIMITS.artist) issues.push('Artist name is too long.');
  if ((input.songNumber ?? '').length > SONG_LIMITS.songNumber)
    issues.push(`Song number must be at most ${SONG_LIMITS.songNumber} characters.`);
  if (!decodeKey(encodeKey(input.originalKey))) issues.push('Original key is invalid.');
  const tags = input.tags ?? [];
  if (tags.length > SONG_LIMITS.tags) issues.push(`At most ${SONG_LIMITS.tags} tags are allowed.`);
  if (tags.some((t) => t.length > SONG_LIMITS.tag)) issues.push(`Tags must be at most ${SONG_LIMITS.tag} characters.`);
  if ((input.notes ?? '').length > SONG_LIMITS.notes) issues.push('Notes are too long.');
  if ((input.lyrics ?? '').length > SONG_LIMITS.lyrics) issues.push('Lyrics are too long.');
  if ((input.sourceAttribution ?? '').length > SONG_LIMITS.attribution) issues.push('Source attribution is too long.');
  if (input.sections.length > SONG_LIMITS.sections) issues.push(`At most ${SONG_LIMITS.sections} chart sections are allowed.`);
  input.sections.forEach((s, i) => {
    if (s.label.length > SONG_LIMITS.sectionLabel) issues.push(`Section ${i + 1} label is too long.`);
    if (s.chords.length > SONG_LIMITS.chordLine) issues.push(`Section ${i + 1} chords are too long.`);
  });
  return issues;
}

function parseTags(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const t of tags ?? []) {
    const v = t.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

function toSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    songNumber: row.song_number,
    originalKey: decodeKey(row.original_key) ?? { tonic: 0, mode: 'major' },
    tags: parseTags(row.tags),
    notes: row.notes,
    lyrics: row.lyrics,
    sourceAttribution: row.source_attribution,
    isSaved: row.is_saved === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status as SyncStatus,
  };
}

/** Escapes LIKE wildcards so user text matches literally. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function createSongsRepository(db: Db) {
  async function list(filter: SongFilter = {}): Promise<(Song & { firstLine: string | null })[]> {
    const where: string[] = ['s.deleted_at IS NULL'];
    const params: SqlValue[] = [];
    const q = filter.query?.trim();
    if (q) {
      const p = likePattern(q);
      where.push(
        `(s.title LIKE ? ESCAPE '\\' OR s.artist LIKE ? ESCAPE '\\' OR s.song_number LIKE ? ESCAPE '\\' OR s.tags LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM song_sections x WHERE x.song_id = s.id AND x.chords LIKE ? ESCAPE '\\'))`,
      );
      params.push(p, p, p, p, p);
    }
    if (filter.mode) {
      where.push('s.original_key LIKE ?');
      params.push(`%:${filter.mode}`);
    }
    if (filter.tonic !== undefined) {
      where.push('s.original_key LIKE ?');
      params.push(`${filter.tonic}:%`);
    }
    if (filter.savedOnly) where.push('s.is_saved = 1');
    const rows = await db.getAllAsync<SongRow & { first_line: string | null }>(
      `SELECT s.*, (SELECT chords FROM song_sections x WHERE x.song_id = s.id ORDER BY position LIMIT 1) AS first_line
       FROM songs s WHERE ${where.join(' AND ')} ORDER BY s.title COLLATE NOCASE, s.created_at`,
      params,
    );
    return rows.map((r) => ({ ...toSong(r), firstLine: r.first_line }));
  }

  async function get(id: string): Promise<SongWithSections | null> {
    const row = await db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) return null;
    const sections = await db.getAllAsync<SongSection>('SELECT id, label, chords FROM song_sections WHERE song_id = ? ORDER BY position', [
      id,
    ]);
    return { ...toSong(row), sections };
  }

  async function writeSections(songId: string, sections: SongInput['sections']): Promise<void> {
    await db.runAsync('DELETE FROM song_sections WHERE song_id = ?', [songId]);
    let position = 0;
    for (const s of sections) {
      const label = s.label.trim() || `Section ${position + 1}`;
      const chords = s.chords.trim();
      if (!chords) continue;
      await db.runAsync('INSERT INTO song_sections (id, song_id, position, label, chords) VALUES (?, ?, ?, ?, ?)', [
        newId(),
        songId,
        position,
        label,
        chords,
      ]);
      position++;
    }
  }

  async function create(input: SongInput, id: string = newId()): Promise<SongWithSections> {
    const issues = validateSongInput(input);
    if (issues.length) throw new ValidationError(issues);
    const now = nowIso();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO songs (id, title, artist, song_number, original_key, tags, notes, lyrics, source_attribution, is_saved, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
        [
          id,
          input.title.trim(),
          clean(input.artist),
          clean(input.songNumber),
          encodeKey(input.originalKey),
          JSON.stringify(normalizeTags(input.tags)),
          clean(input.notes),
          clean(input.lyrics),
          clean(input.sourceAttribution),
          input.isSaved ? 1 : 0,
          now,
          now,
        ],
      );
      await writeSections(id, input.sections);
    });
    const song = await get(id);
    if (!song) throw new NotFoundError('Song', id);
    return song;
  }

  async function update(id: string, input: SongInput): Promise<SongWithSections> {
    const issues = validateSongInput(input);
    if (issues.length) throw new ValidationError(issues);
    await db.withTransactionAsync(async () => {
      const res = await db.runAsync(
        `UPDATE songs SET title = ?, artist = ?, song_number = ?, original_key = ?, tags = ?, notes = ?, lyrics = ?,
           source_attribution = ?, is_saved = ?, updated_at = ?,
           sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END
         WHERE id = ? AND deleted_at IS NULL`,
        [
          input.title.trim(),
          clean(input.artist),
          clean(input.songNumber),
          encodeKey(input.originalKey),
          JSON.stringify(normalizeTags(input.tags)),
          clean(input.notes),
          clean(input.lyrics),
          clean(input.sourceAttribution),
          input.isSaved ? 1 : 0,
          nowIso(),
          id,
        ],
      );
      if (res.changes === 0) throw new NotFoundError('Song', id);
      await writeSections(id, input.sections);
    });
    const song = await get(id);
    if (!song) throw new NotFoundError('Song', id);
    return song;
  }

  async function setSaved(id: string, saved: boolean): Promise<void> {
    const res = await db.runAsync(
      `UPDATE songs SET is_saved = ?, updated_at = ?, sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END WHERE id = ? AND deleted_at IS NULL`,
      [saved ? 1 : 0, nowIso(), id],
    );
    if (res.changes === 0) throw new NotFoundError('Song', id);
  }

  /** Soft delete: keeps a tombstone so deletion can propagate to cloud sync later. */
  async function remove(id: string): Promise<void> {
    const now = nowIso();
    const res = await db.runAsync(
      `UPDATE songs SET deleted_at = ?, updated_at = ?, sync_status = CASE sync_status WHEN 'synced' THEN 'pending' ELSE sync_status END WHERE id = ? AND deleted_at IS NULL`,
      [now, now, id],
    );
    if (res.changes === 0) throw new NotFoundError('Song', id);
  }

  async function count(): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM songs WHERE deleted_at IS NULL');
    return row?.n ?? 0;
  }

  return { list, get, create, update, setSaved, remove, count };
}

export type SongsRepository = ReturnType<typeof createSongsRepository>;
