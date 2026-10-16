/**
 * The subset of the expo-sqlite `SQLiteDatabase` API that repositories use.
 * Keeping repositories on this interface lets them run against Node's
 * built-in SQLite in tests without mocking.
 */
export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<RunResult>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict';

export class ValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(' '));
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} was not found`);
    this.name = 'NotFoundError';
  }
}
