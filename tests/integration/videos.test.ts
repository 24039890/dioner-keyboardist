import { migrate } from '@/db/migrations';
import { createVideoProgressRepository } from '@/db/repositories/videos';
import type { VideoResult } from '@/features/learning/videoProviders';

import { openTestDb } from '../helpers/nodeDb';

const v = (id: string): VideoResult => ({
  id,
  title: `Video ${id}`,
  channel: 'Keys',
  durationSeconds: 60,
  difficulty: 'beginner',
  watchUrl: `https://www.youtube.com/watch?v=${id}`,
  thumbnailUrl: null,
  attribution: 'Keys on YouTube',
});

test('opened and watched state persists; reopening keeps watched', async () => {
  const db = openTestDb();
  await migrate(db);
  const repo = createVideoProgressRepository(db);
  await repo.markOpened(v('a'));
  await new Promise((r) => setTimeout(r, 5));
  await repo.markOpened(v('b'));
  await repo.setWatched('a', true);
  await new Promise((r) => setTimeout(r, 5));
  await repo.markOpened(v('a')); // re-open: should not reset watched
  const status = await repo.statusFor(['a', 'b', 'c']);
  expect(status.get('a')?.watched).toBe(true);
  expect(status.get('b')?.watched).toBe(false);
  expect(status.has('c')).toBe(false);
  expect((await repo.recent()).map((x) => x.videoId)).toEqual(['a', 'b']);
  expect(await repo.statusFor([])).toEqual(new Map());
  db.close();
});
