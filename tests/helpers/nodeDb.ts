/**
 * Adapter that exposes Node's built-in SQLite (node:sqlite, Node ≥ 22.5) through
 * the same `Db` interface the app uses with expo-sqlite. It runs the real
 * SQLite engine, so constraints, foreign keys and transactions are exercised.
 */
import type { Db, RunResult, SqlValue } from '@/db/types';

interface StatementSync {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

export interface TestDb extends Db {
  close(): void;
  /** When set, the next runAsync whose SQL matches throws (simulates a failed write). */
  failNextWrite: RegExp | null;
}

export function openTestDb(path = ':memory:'): TestDb {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync: Ctor } = require('node:sqlite') as { DatabaseSync: new (p: string) => DatabaseSync };
  const raw = new Ctor(path);
  let depth = 0;
  const db: TestDb = {
    failNextWrite: null,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params = []): Promise<RunResult> {
      if (db.failNextWrite && db.failNextWrite.test(sql)) {
        db.failNextWrite = null;
        throw new Error('Simulated write failure');
      }
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      if (depth > 0) return task();
      depth++;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close() {
      raw.close();
    },
  };
  return db;
}
