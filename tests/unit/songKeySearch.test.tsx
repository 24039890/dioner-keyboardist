/**
 * Song-key search client (fake fetch, no network) and the "Played in" pop-up (rendered in Jest, not on a device).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SongKeySheet } from '@/features/songs/components/SongKeySheet';
import { type SongKeyResult, createBackendSongKeySearch, parseSongKeyResult } from '@/features/songs/songKeySearch';

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

const wire = {
  id: 's1',
  title: 'Way Maker',
  artist: 'Sinach',
  album: 'Way Maker',
  year: 2016,
  key: { tonic: 4, mode: 'minor' },
  tempo: 68,
  sourceUrl: 'https://getsongbpm.com/song/way-maker/s1',
};

const found: SongKeyResult = { ...wire, key: { tonic: 4, mode: 'minor' } };

describe('backend song-key search', () => {
  test('searches by title and maps results', async () => {
    const f = fakeFetch(() => ({
      status: 200,
      body: { results: [wire], attribution: 'Song keys from GetSongBPM.com', sourceUrl: 'https://getsongbpm.com' },
    }));
    const r = await createBackendSongKeySearch('http://10.0.0.5:8000/', f.fn).search('  way maker ');
    expect(f.calls[0]).toBe('http://10.0.0.5:8000/v1/songs/search?q=way+maker');
    expect(r).toEqual({ ok: true, results: [found], attribution: 'Song keys from GetSongBPM.com', sourceUrl: 'https://getsongbpm.com' });
  });

  test('bad items and unsafe links are dropped or replaced', () => {
    expect(parseSongKeyResult({ ...wire, title: '' })).toBeNull();
    expect(parseSongKeyResult(null)).toBeNull();
    expect(parseSongKeyResult({ ...wire, key: { tonic: 12, mode: 'minor' } })?.key).toBeNull();
    expect(parseSongKeyResult({ ...wire, key: { tonic: 4, mode: 'dorian' } })?.key).toBeNull();
    expect(parseSongKeyResult({ ...wire, sourceUrl: 'javascript:alert(1)' })?.sourceUrl).toBe('https://getsongbpm.com');
  });

  test('server and network failures are reported, not hidden', async () => {
    const notConfigured = fakeFetch(() => ({ status: 503, body: { reason: 'not-configured', message: 'Missing key' } }));
    expect(await createBackendSongKeySearch('http://x.test', notConfigured.fn).search('way maker')).toEqual({
      ok: false,
      reason: 'not-configured',
      message: 'Missing key',
    });
    const offline = fakeFetch(() => new Error('offline'));
    const r = await createBackendSongKeySearch('http://x.test', offline.fn).search('way maker');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('network');
  });

  test('one letter is not sent to the server', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { results: [] } }));
    const r = await createBackendSongKeySearch('http://x.test', f.fn).search('w');
    expect(f.calls).toHaveLength(0);
    expect(r.ok).toBe(false);
  });
});

describe('SongKeySheet', () => {
  test('pops up the key the song is played in and saves it', async () => {
    const saved: SongKeyResult[] = [];
    await render(<SongKeySheet onClose={() => undefined} onSave={(s) => saved.push(s)} saving={false} song={found} />);
    expect(screen.getByLabelText('Played in E Minor')).toBeTruthy();
    expect(screen.getByText('Same notes as G Major · 68 BPM')).toBeTruthy();
    expect(screen.getByText('Key from GetSongBPM.com')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save to my songs'));
    expect(saved).toEqual([found]);
  });

  test('says so when the catalogue has no key', async () => {
    await render(<SongKeySheet onClose={() => undefined} onSave={() => undefined} saving={false} song={{ ...found, key: null }} />);
    expect(screen.getByText('Key not listed')).toBeTruthy();
    expect(screen.queryByText('Save to my songs')).toBeNull();
  });
});
