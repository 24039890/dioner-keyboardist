/**
 * Video-tutorial provider boundary.
 *
 * The app never talks to YouTube directly: it calls the DIONER backend
 * (backend/, FastAPI), which holds the YouTube Data API key server-side,
 * forces safe search and caches results. Without EXPO_PUBLIC_API_URL the Learn
 * tab shows an explicit "not connected" state. No video URLs are fabricated.
 */
export type VideoDifficulty = 'beginner' | 'experienced';

export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  difficulty: VideoDifficulty | null;
  watchUrl: string;
  thumbnailUrl: string | null;
  attribution: string;
}

export interface VideoCategory {
  id: string;
  title: string;
  description: string;
  difficulty: VideoDifficulty;
}

export interface VideoSearch {
  query: string;
  category?: string;
  difficulty?: VideoDifficulty;
  pageToken?: string;
}

export type VideoFailureReason = 'not-configured' | 'network' | 'provider-error' | 'rate-limited' | 'invalid-request';

export type VideoSearchResult =
  | { ok: true; results: VideoResult[]; nextPageToken: string | null; cached: boolean }
  | { ok: false; reason: VideoFailureReason; message: string };

export type CategoriesResult = { ok: true; categories: VideoCategory[] } | { ok: false; reason: VideoFailureReason; message: string };

export interface VideoProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  categories(): Promise<CategoriesResult>;
  search(params: VideoSearch): Promise<VideoSearchResult>;
}

const NOT_CONFIGURED = 'Video tutorials need the DIONER backend. Set EXPO_PUBLIC_API_URL to enable them.';

export const unconfiguredVideoProvider: VideoProvider = {
  id: 'none',
  name: 'No video provider',
  isConfigured: () => false,
  async categories() {
    return { ok: false, reason: 'not-configured', message: NOT_CONFIGURED };
  },
  async search() {
    return { ok: false, reason: 'not-configured', message: NOT_CONFIGURED };
  },
};

// ---------- runtime validation of backend responses ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const diff = (v: unknown): VideoDifficulty | null => (v === 'beginner' || v === 'experienced' ? v : null);

export function parseVideo(v: unknown): VideoResult | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const title = str(v.title);
  const watchUrl = str(v.watchUrl);
  if (!id || !title || !watchUrl || !/^https:\/\/(www\.)?youtube\.com\/watch\?v=/.test(watchUrl)) return null;
  return {
    id,
    title,
    channel: str(v.channel) ?? '',
    durationSeconds: typeof v.durationSeconds === 'number' && Number.isFinite(v.durationSeconds) ? v.durationSeconds : null,
    difficulty: diff(v.difficulty),
    watchUrl,
    thumbnailUrl: str(v.thumbnailUrl)?.startsWith('https://') ? (v.thumbnailUrl as string) : null,
    attribution: str(v.attribution) ?? 'YouTube',
  };
}

const REASONS: readonly VideoFailureReason[] = ['not-configured', 'network', 'provider-error', 'rate-limited', 'invalid-request'];

function failureFrom(body: unknown, status: number): { ok: false; reason: VideoFailureReason; message: string } {
  if (isObj(body) && REASONS.includes(body.reason as VideoFailureReason) && typeof body.message === 'string') {
    return { ok: false, reason: body.reason as VideoFailureReason, message: body.message };
  }
  return { ok: false, reason: 'provider-error', message: `The video service returned an error (${status}).` };
}

type Fetch = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createBackendVideoProvider(baseUrl: string, fetchImpl: Fetch = fetch, timeoutMs = 10_000): VideoProvider {
  const base = baseUrl.replace(/\/+$/, '');

  async function getJson(path: string): Promise<{ status: number; ok: boolean; body: unknown } | { error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, { signal: controller.signal });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, ok: res.ok, body };
    } catch {
      return { error: 'Could not reach the DIONER server. Check your internet connection.' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: 'dioner-backend',
    name: 'YouTube (via DIONER server)',
    isConfigured: () => true,
    async categories() {
      const r = await getJson('/v1/videos/categories');
      if ('error' in r) return { ok: false, reason: 'network', message: r.error };
      if (!r.ok) return failureFrom(r.body, r.status);
      const list = isObj(r.body) && Array.isArray(r.body.categories) ? r.body.categories : [];
      const categories = list.flatMap((c): VideoCategory[] => {
        if (!isObj(c)) return [];
        const id = str(c.id);
        const title = str(c.title);
        const difficulty = diff(c.difficulty);
        return id && title && difficulty ? [{ id, title, description: str(c.description) ?? '', difficulty }] : [];
      });
      return { ok: true, categories };
    },
    async search({ query, category, difficulty, pageToken }) {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category) params.set('category', category);
      if (difficulty) params.set('difficulty', difficulty);
      if (pageToken) params.set('pageToken', pageToken);
      const r = await getJson(`/v1/videos/search?${params.toString()}`);
      if ('error' in r) return { ok: false, reason: 'network', message: r.error };
      if (!r.ok) return failureFrom(r.body, r.status);
      const body = isObj(r.body) ? r.body : {};
      const results = (Array.isArray(body.results) ? body.results : []).map(parseVideo).filter((v): v is VideoResult => v !== null);
      return { ok: true, results, nextPageToken: str(body.nextPageToken), cached: body.cached === true };
    },
  };
}

/** Accepts https URLs, or http on local/LAN addresses for development. */
export function validApiUrl(url: string | undefined): string | null {
  const u = url?.trim();
  if (!u) return null;
  if (/^https:\/\/[^\s/]+(\/.*)?$/i.test(u)) return u;
  if (/^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?\/?$/.test(u))
    return u;
  return null;
}

let provider: VideoProvider | null = null;

export function getVideoProvider(): VideoProvider {
  if (!provider) {
    // Literal access so Expo inlines the value at build time.
    const url = validApiUrl(process.env.EXPO_PUBLIC_API_URL);
    provider = url ? createBackendVideoProvider(url) : unconfiguredVideoProvider;
  }
  return provider;
}

export function formatVideoDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
