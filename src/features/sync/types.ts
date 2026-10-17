/** Rows as stored in Supabase (snake_case, see supabase/migrations). */
export interface RemoteSong {
  id: string;
  owner_id: string;
  title: string;
  artist: string | null;
  song_number: string | null;
  original_key: string;
  tags: string[];
  notes: string | null;
  lyrics: string | null;
  source_attribution: string | null;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RemoteSection {
  id: string;
  owner_id: string;
  song_id: string;
  position: number;
  label: string;
  chords: string;
}

export interface RemoteRehearsal {
  id: string;
  owner_id: string;
  title: string;
  song_id: string | null;
  original_key: string | null;
  played_key: string | null;
  transposition_semitones: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RemoteRecording {
  id: string;
  owner_id: string;
  rehearsal_id: string;
  name: string;
  storage_path: string | null;
  duration_ms: number;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RemoteProgress {
  owner_id: string;
  lesson_id: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  question_count: number | null;
  completed_at: string | null;
  updated_at: string;
}

/** Cloud operations used by the sync engine (Supabase in the app, a fake in tests). */
export interface RemoteStore {
  upsertSongs(rows: RemoteSong[]): Promise<void>;
  replaceSections(songId: string, rows: RemoteSection[]): Promise<void>;
  upsertRehearsals(rows: RemoteRehearsal[]): Promise<void>;
  upsertRecordings(rows: RemoteRecording[]): Promise<void>;
  deleteRecording(id: string): Promise<void>;
  upsertProgress(rows: RemoteProgress[]): Promise<void>;
  songsSince(since: string | null): Promise<RemoteSong[]>;
  sectionsFor(songIds: string[]): Promise<RemoteSection[]>;
  rehearsalsSince(since: string | null): Promise<RemoteRehearsal[]>;
  recordingsSince(since: string | null): Promise<RemoteRecording[]>;
  progressSince(since: string | null): Promise<RemoteProgress[]>;
  uploadAudio(path: string, fileUri: string): Promise<void>;
  removeAudio(path: string): Promise<void>;
}
