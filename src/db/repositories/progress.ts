import { nowIso } from '../../utils/id';
import type { Db } from '../types';

export interface LessonProgress {
  lessonId: string;
  attempts: number;
  bestScore: number | null;
  lastScore: number | null;
  questionCount: number | null;
  completedAt: string | null;
  updatedAt: string;
}

interface ProgressRow {
  lesson_id: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  question_count: number | null;
  completed_at: string | null;
  updated_at: string;
}

const toProgress = (r: ProgressRow): LessonProgress => ({
  lessonId: r.lesson_id,
  attempts: r.attempts,
  bestScore: r.best_score,
  lastScore: r.last_score,
  questionCount: r.question_count,
  completedAt: r.completed_at,
  updatedAt: r.updated_at,
});

/** A lesson counts as complete when at least this fraction of questions is correct. */
export const PASS_RATIO = 0.7;

export function createProgressRepository(db: Db) {
  async function all(): Promise<LessonProgress[]> {
    const rows = await db.getAllAsync<ProgressRow>('SELECT * FROM lesson_progress');
    return rows.map(toProgress);
  }

  async function get(lessonId: string): Promise<LessonProgress | null> {
    const row = await db.getFirstAsync<ProgressRow>('SELECT * FROM lesson_progress WHERE lesson_id = ?', [lessonId]);
    return row ? toProgress(row) : null;
  }

  /** Records a finished attempt. Completion is kept once earned. */
  async function recordAttempt(lessonId: string, score: number, questionCount: number): Promise<LessonProgress> {
    if (!Number.isInteger(score) || !Number.isInteger(questionCount) || questionCount <= 0 || score < 0 || score > questionCount) {
      throw new Error('Invalid score');
    }
    const now = nowIso();
    const passed = score / questionCount >= PASS_RATIO;
    await db.runAsync(
      `INSERT INTO lesson_progress (lesson_id, attempts, best_score, last_score, question_count, completed_at, updated_at)
       VALUES (?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT (lesson_id) DO UPDATE SET
         attempts = attempts + 1,
         best_score = MAX(COALESCE(best_score, 0), excluded.best_score),
         last_score = excluded.last_score,
         question_count = excluded.question_count,
         completed_at = COALESCE(completed_at, excluded.completed_at),
         updated_at = excluded.updated_at`,
      [lessonId, score, score, questionCount, passed ? now : null, now],
    );
    const p = await get(lessonId);
    if (!p) throw new Error('Progress write failed');
    return p;
  }

  async function reset(lessonId: string): Promise<void> {
    await db.runAsync('DELETE FROM lesson_progress WHERE lesson_id = ?', [lessonId]);
  }

  return { all, get, recordAttempt, reset };
}

export type ProgressRepository = ReturnType<typeof createProgressRepository>;
