import { type SQLiteDatabase, SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { migrate } from '@/db/migrations';
import { createProgressRepository } from '@/db/repositories/progress';
import { createRehearsalsRepository } from '@/db/repositories/rehearsals';
import { type AppSettings, DEFAULT_SETTINGS, createSettingsRepository } from '@/db/repositories/settings';
import { createSongsRepository } from '@/db/repositories/songs';
import type { Db } from '@/db/types';
import { expoRecordingStore } from '@/features/rehearsals/services/expoRecordingStore';
import { recoverInterruptedRecordings } from '@/features/rehearsals/services/recordingService';

export const DATABASE_NAME = 'dioner.db';

/** Runs before any screen renders: migrations, then recovery of interrupted recordings. */
async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const asDb = db as unknown as Db;
  await migrate(asDb);
  try {
    await recoverInterruptedRecordings(createRehearsalsRepository(asDb), expoRecordingStore);
  } catch (e) {
    // Recovery must never block app start; the rows stay pending and are retried next launch.
    console.warn('Recording recovery failed', e);
  }
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase}>
      {children}
    </SQLiteProvider>
  );
}

/**
 * Repositories bound to the app database. expo-sqlite's SQLiteDatabase is used
 * through the narrower `Db` interface (see src/db/types.ts); the cast is needed
 * only because expo-sqlite declares its query methods as overload sets.
 */
export function useRepositories() {
  const sqlite = useSQLiteContext();
  return useMemo(() => {
    const db = sqlite as unknown as Db;
    return {
      songs: createSongsRepository(db),
      rehearsals: createRehearsalsRepository(db),
      progress: createProgressRepository(db),
      settings: createSettingsRepository(db),
    };
  }, [sqlite]);
}

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { settings: repo } = useRepositories();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    repo
      .load()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch((e: unknown) => console.warn('Settings failed to load; using defaults', e))
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [repo]);

  const update = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      await repo.set(key, value);
      setSettings((s) => ({ ...s, [key]: value }));
    },
    [repo],
  );

  const value = useMemo(() => ({ settings, loaded, update }), [settings, loaded, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
