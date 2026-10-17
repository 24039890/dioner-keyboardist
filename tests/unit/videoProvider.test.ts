import { createBackendVideoProvider, formatVideoDuration, parseVideo, validApiUrl } from '@/features/learning/videoProviders';

function fakeFetch(handler: (url: string) => { status: number; body: unknown } | Error) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const r = handler(url);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fn, calls };
}

const video = {
  id: 'abc',
  title: 'Major scales',
  channel: 'Keys Academy',
  durationSeconds: 725,
  difficulty: 'beginner',
  watchUrl: 'https://www.youtube.com/watch?v=abc',
  thumbnailUrl: 'https://i.ytimg.com/abc.jpg',
  attribution: 'Keys Academy on YouTube',
};

describe('backend video provider', () => {
  test('search builds the query and maps results', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { results: [video], nextPageToken: 'N', cached: true } }));
    const p = createBackendVideoProvider('http://10.0.0.5:8000/', f.fn);
    const r = await p.search({ query: ' worship chords ', category: 'chords', difficulty: 'beginner', pageToken: 'T' });
    expect(f.calls[0]).toBe('http://10.0.0.5:8000/v1/videos/search?q=worship+chords&category=chords&difficulty=beginner&pageToken=T');
    expect(r).toEqual({ ok: true, results: [{ ...video }], nextPageToken: 'N', cached: true });
  });

  test('invalid or unsafe items are dropped', () => {
    expect(parseVideo({ ...video, watchUrl: 'https://evil.example/watch?v=1' })).toBeNull();
    expect(parseVideo({ ...video, id: 5 })).toBeNull();
    expect(parseVideo({ ...video, thumbnailUrl: 'http://insecure/x.jpg' })?.thumbnailUrl).toBeNull();
    expect(parseVideo(null)).toBeNull();
  });

  test('server errors keep their reason; unknown errors become provider-error', async () => {
    const notConfigured = createBackendVideoProvider(
      'https://api.example.com',
      fakeFetch(() => ({ status: 503, body: { reason: 'not-configured', message: 'missing key' } })).fn,
    );
    expect(await notConfigured.search({ query: 'x' })).toEqual({ ok: false, reason: 'not-configured', message: 'missing key' });
    const weird = createBackendVideoProvider('https://api.example.com', fakeFetch(() => ({ status: 500, body: 'oops' })).fn);
    const r = await weird.search({ query: 'x' });
    expect(r.ok === false && r.reason).toBe('provider-error');
  });

  test('network failures are reported as offline', async () => {
    const p = createBackendVideoProvider('https://api.example.com', fakeFetch(() => new Error('fail')).fn);
    const r = await p.search({ query: 'x' });
    expect(r.ok === false && r.reason).toBe('network');
    const c = await p.categories();
    expect(c.ok === false && c.reason).toBe('network');
  });

  test('categories are validated', async () => {
    const p = createBackendVideoProvider(
      'https://api.example.com',
      fakeFetch(() => ({
        status: 200,
        body: { categories: [{ id: 'scales', title: 'Scales', description: 'd', difficulty: 'beginner' }, { id: 1 }] },
      })).fn,
    );
    expect(await p.categories()).toEqual({
      ok: true,
      categories: [{ id: 'scales', title: 'Scales', description: 'd', difficulty: 'beginner' }],
    });
  });

  test('API URL validation and duration formatting', () => {
    expect(validApiUrl('https://dioner-backend.onrender.com')).toBe('https://dioner-backend.onrender.com');
    expect(validApiUrl('http://192.168.1.20:8000')).toBe('http://192.168.1.20:8000');
    expect(validApiUrl('http://example.com')).toBeNull(); // plain http only for local/LAN development
    expect(validApiUrl('')).toBeNull();
    expect(formatVideoDuration(725)).toBe('12:05');
    expect(formatVideoDuration(3723)).toBe('1:02:03');
    expect(formatVideoDuration(null)).toBeNull();
  });
});
