/**
 * Video-tutorial provider boundary.
 *
 * No provider is connected yet: every real option (e.g. the YouTube Data API)
 * is an external integration that needs the owner's approval and an API key.
 * Until one is configured the Learn tab shows an explicit "not connected"
 * state. No video URLs are fabricated.
 */
export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  difficulty: 'beginner' | 'experienced' | null;
  watchUrl: string;
  attribution: string;
}

export interface VideoSearch {
  query: string;
  category?: string;
  difficulty?: 'beginner' | 'experienced';
}

export type VideoSearchResult =
  { ok: true; results: VideoResult[] } | { ok: false; reason: 'not-configured' | 'network' | 'provider-error'; message: string };

export interface VideoProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  search(params: VideoSearch): Promise<VideoSearchResult>;
}

export const unconfiguredVideoProvider: VideoProvider = {
  id: 'none',
  name: 'No video provider',
  isConfigured: () => false,
  async search() {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'Video tutorials need an authorised video provider. None is connected in this build.',
    };
  },
};

export function getVideoProvider(): VideoProvider {
  return unconfiguredVideoProvider;
}
