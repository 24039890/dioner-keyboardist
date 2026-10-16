/**
 * Recording lifecycle rules that do not depend on the audio API:
 * storage checks, committing files + metadata, recovery and deletion.
 */
import type { Recording, RehearsalsRepository } from '../../../db/repositories/rehearsals';

/** Minimal file operations, implemented with expo-file-system in the app and faked in tests. */
export interface RecordingFileStore {
  exists(uri: string): boolean;
  size(uri: string): number | null;
  remove(uri: string): void;
  /** Free bytes on the device, or null when unknown. */
  availableBytes(): number | null;
}

/** Refuse to start a recording with less free space than this (≈ 50 min of 128 kbps AAC). */
export const MIN_FREE_BYTES = 50 * 1024 * 1024;

export class InsufficientStorageError extends Error {
  constructor(readonly availableBytes: number) {
    super(`Only ${Math.round(availableBytes / (1024 * 1024))} MB free. Free up space before recording.`);
    this.name = 'InsufficientStorageError';
  }
}

export class MissingRecordingFileError extends Error {
  constructor(uri: string) {
    super(`The recording file could not be found (${uri}).`);
    this.name = 'MissingRecordingFileError';
  }
}

export function assertStorageAvailable(store: RecordingFileStore, minBytes = MIN_FREE_BYTES): void {
  const free = store.availableBytes();
  if (free !== null && free < minBytes) throw new InsufficientStorageError(free);
}

/**
 * Marks a capture as saved. The file must exist and be non-empty first.
 * If the metadata write fails the row stays in 'recording' state so the next
 * launch's recovery pass finds it; the error is rethrown so the UI never
 * reports success.
 */
export async function commitRecording(
  repo: RehearsalsRepository,
  store: RecordingFileStore,
  args: { recordingId: string; fileUri: string; durationMs: number },
): Promise<Recording> {
  if (!store.exists(args.fileUri)) throw new MissingRecordingFileError(args.fileUri);
  const size = store.size(args.fileUri);
  if (size === null || size <= 0) throw new MissingRecordingFileError(args.fileUri);
  return repo.completeRecording(args.recordingId, { durationMs: args.durationMs, sizeBytes: size, fileUri: args.fileUri });
}

/** Removes an unsaved capture (user tapped Discard, or capture failed to start). */
export async function discardRecording(repo: RehearsalsRepository, store: RecordingFileStore, recording: Recording): Promise<void> {
  if (store.exists(recording.fileUri)) store.remove(recording.fileUri);
  await repo.deleteRecordingRow(recording.id);
}

/**
 * Deletes a saved recording: file first, then metadata. If the file cannot be
 * deleted the metadata is kept, so nothing is orphaned silently.
 */
export async function deleteRecording(repo: RehearsalsRepository, store: RecordingFileStore, recordingId: string): Promise<void> {
  const rec = await repo.getRecording(recordingId);
  if (!rec) return;
  if (store.exists(rec.fileUri)) store.remove(rec.fileUri);
  await repo.deleteRecordingRow(rec.id);
}

/** Deletes every recording of a rehearsal, then soft-deletes the rehearsal. */
export async function deleteRehearsal(repo: RehearsalsRepository, store: RecordingFileStore, rehearsalId: string): Promise<void> {
  for (const rec of await repo.listRecordings(rehearsalId)) await deleteRecording(repo, store, rec.id);
  await repo.remove(rehearsalId);
}

export interface RecoveryReport {
  recovered: number;
  removed: number;
}

/**
 * Run on launch. Captures interrupted before they were committed are kept as
 * 'recovered' (labelled as possibly incomplete) when a non-empty file exists,
 * and removed otherwise.
 */
export async function recoverInterruptedRecordings(repo: RehearsalsRepository, store: RecordingFileStore): Promise<RecoveryReport> {
  const report: RecoveryReport = { recovered: 0, removed: 0 };
  for (const rec of await repo.pendingRecordings()) {
    const size = store.exists(rec.fileUri) ? store.size(rec.fileUri) : null;
    if (size !== null && size > 0) {
      await repo.markRecovered(rec.id, size);
      report.recovered++;
    } else {
      if (store.exists(rec.fileUri)) store.remove(rec.fileUri);
      await repo.deleteRecordingRow(rec.id);
      report.removed++;
    }
  }
  return report;
}

export function isRecordingAvailable(store: RecordingFileStore, rec: Recording): boolean {
  return store.exists(rec.fileUri);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
