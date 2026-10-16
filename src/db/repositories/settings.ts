import type { Db } from '../types';

export interface AppSettings {
  onboardingComplete: boolean;
  learningPath: 'beginner' | 'experienced';
  inputMode: 'microphone' | 'midi';
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboardingComplete: false,
  learningPath: 'beginner',
  inputMode: 'microphone',
};

/** Validates a stored value against the allowed set; falls back to the default. */
function coerce<K extends keyof AppSettings>(key: K, raw: string | undefined): AppSettings[K] {
  const d = DEFAULT_SETTINGS[key];
  if (raw === undefined) return d;
  switch (key) {
    case 'onboardingComplete':
      return (raw === 'true') as AppSettings[K];
    case 'learningPath':
      return (raw === 'beginner' || raw === 'experienced' ? raw : d) as AppSettings[K];
    case 'inputMode':
      return (raw === 'microphone' || raw === 'midi' ? raw : d) as AppSettings[K];
    default:
      return d;
  }
}

export function createSettingsRepository(db: Db) {
  async function load(): Promise<AppSettings> {
    const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      onboardingComplete: coerce('onboardingComplete', map.get('onboardingComplete')),
      learningPath: coerce('learningPath', map.get('learningPath')),
      inputMode: coerce('inputMode', map.get('inputMode')),
    };
  }

  async function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
      key,
      String(value),
    ]);
  }

  return { load, set };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
