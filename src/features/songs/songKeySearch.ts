/**
 * Song-key search boundary.
 *
 * Like video tutorials, the app never calls the outside service directly: the
 * DIONER backend holds the GetSongBPM API key and caches results. Without
 * EXPO_PUBLIC_API_URL the Songs tab only searches the local songbook.
 * GetSongBPM's terms require a visible link back to getsongbpm.com, which the
 * Songs tab shows with every set of results.
 */
import { validApiUrl } from '@/features/learning/videoProviders';
import type { Key } from '@/features/music-theory';

export interface SongKeyResult {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  /** The key the song is published in, or null when the catalogue has none. */
  key: Key | null;
  tempo: number | null;
  sourceUrl: string;
}

export type SongKeyFailureReason = 'not-configured' | 'network' | 'provider-error' | 'rate-limited' | 'invalid-request';

export type SongKeySearchResult =
  | { ok: true; results: SongKeyResult[]; attribution: string; sourceUrl: string }
  | { ok: false; reason: SongKeyFailureReason; message: string };

export interface SongKeySearch {
  search(query: string): Promise<SongKeySearchResult>;
}

export const SONG_KEY_SOURCE_URL = 'https://getsongbpm.com';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const httpsOr = (v: unknown, fallback: string): string => {
  const s = str(v);
  return s && /^https:\/\/[^\s]+$/.test(s) ? s : fallback;
};

function parseKey(v: unknown): Key | null {
  if (!isObj(v)) return null;
  const tonic = v.tonic;
  if (typeof tonic !== 'number' || !Number.isInteger(tonic) || tonic < 0 || tonic > 11) return null;
  return v.mode === 'major' || v.mode === 'minor' ? { tonic, mode: v.mode } : null;
}

export function parseSongKeyResult(v: unknown): SongKeyResult | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const title = str(v.title)?.trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    artist: str(v.artist)?.trim() ?? '',
    album: str(v.album),
    year: num(v.year),
    key: parseKey(v.key),
    tempo: num(v.tempo),
    sourceUrl: httpsOr(v.sourceUrl, SONG_KEY_SOURCE_URL),
  };
}

const REASONS: readonly SongKeyFailureReason[] = ['not-configured', 'network', 'provider-error', 'rate-limited', 'invalid-request'];

type Fetch = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createBackendSongKeySearch(baseUrl: string, fetchImpl: Fetch = fetch, timeoutMs = 10_000): SongKeySearch {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async search(query) {
      const q = query.trim();
      if (q.length < 2) return { ok: false, reason: 'invalid-request', message: 'Type at least two letters of the song title.' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status = 0;
      let ok = false;
      let body: unknown = null;
      try {
        const res = await fetchImpl(`${base}/v1/songs/search?${new URLSearchParams({ q }).toString()}`, { signal: controller.signal });
        status = res.status;
        ok = res.ok;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
      } catch {
        return { ok: false, reason: 'network', message: 'Could not reach the DIONER server. Check your internet connection.' };
      } finally {
        clearTimeout(timer);
      }
      if (!ok) {
        if (isObj(body) && REASONS.includes(body.reason as SongKeyFailureReason) && typeof body.message === 'string') {
          return { ok: false, reason: body.reason as SongKeyFailureReason, message: body.message };
        }
        return { ok: false, reason: 'provider-error', message: `Song search returned an error (${status}).` };
      }
      const data = isObj(body) ? body : {};
      const results = (Array.isArray(data.results) ? data.results : [])
        .map(parseSongKeyResult)
        .filter((s): s is SongKeyResult => s !== null);
      return {
        ok: true,
        results,
        attribution: str(data.attribution) ?? 'Song keys from GetSongBPM.com',
        sourceUrl: httpsOr(data.sourceUrl, SONG_KEY_SOURCE_URL),
      };
    },
  };
}

let instance: SongKeySearch | null | undefined;

/** The backend song-key search, or null when EXPO_PUBLIC_API_URL is not set. */
export function getSongKeySearch(): SongKeySearch | null {
  if (instance === undefined) {
    // Literal access so Expo inlines the value at build time.
    const url = validApiUrl(process.env.EXPO_PUBLIC_API_URL);
    instance = url ? createBackendSongKeySearch(url) : null;
  }
  return instance;
}
