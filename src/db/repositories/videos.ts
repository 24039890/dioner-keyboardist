import type { VideoResult } from '../../features/learning/videoProviders';
import { nowIso } from '../../utils/id';
import type { Db } from '../types';

export interface VideoHistoryItem {
  videoId: string;
  title: string;
  channel: string;
  watchUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  openedAt: string;
  watched: boolean;
}

interface Row {
  video_id: string;
  title: string;
  channel: string;
  watch_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  opened_at: string;
  watched: number;
}

const toItem = (r: Row): VideoHistoryItem => ({
  videoId: r.video_id,
  title: r.title,
  channel: r.channel,
  watchUrl: r.watch_url,
  thumbnailUrl: r.thumbnail_url,
  durationSeconds: r.duration_seconds,
  openedAt: r.opened_at,
  watched: r.watched === 1,
});

/** Local history of tutorials the user opened and marked as watched. */
export function createVideoProgressRepository(db: Db) {
  async function markOpened(v: VideoResult): Promise<void> {
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO video_progress (video_id, title, channel, watch_url, thumbnail_url, duration_seconds, opened_at, watched, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT (video_id) DO UPDATE SET title = excluded.title, channel = excluded.channel, watch_url = excluded.watch_url,
         thumbnail_url = excluded.thumbnail_url, duration_seconds = excluded.duration_seconds,
         opened_at = excluded.opened_at, updated_at = excluded.updated_at`,
      [v.id, v.title, v.channel, v.watchUrl, v.thumbnailUrl, v.durationSeconds, now, now],
    );
  }

  async function setWatched(videoId: string, watched: boolean): Promise<void> {
    await db.runAsync('UPDATE video_progress SET watched = ?, updated_at = ? WHERE video_id = ?', [watched ? 1 : 0, nowIso(), videoId]);
  }

  async function recent(limit = 20): Promise<VideoHistoryItem[]> {
    const rows = await db.getAllAsync<Row>('SELECT * FROM video_progress ORDER BY opened_at DESC, rowid DESC LIMIT ?', [limit]);
    return rows.map(toItem);
  }

  async function statusFor(ids: string[]): Promise<Map<string, VideoHistoryItem>> {
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await db.getAllAsync<Row>(`SELECT * FROM video_progress WHERE video_id IN (${placeholders})`, ids);
    return new Map(rows.map((r) => [r.video_id, toItem(r)]));
  }

  return { markOpened, setWatched, recent, statusFor };
}

export type VideoProgressRepository = ReturnType<typeof createVideoProgressRepository>;
