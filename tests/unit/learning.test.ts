import { LESSONS, getLesson, lessonsForPath } from '@/features/learning/curriculum';
import { unconfiguredVideoProvider } from '@/features/learning/videoProviders';

describe('curriculum', () => {
  test('six complete lessons, three per path, with every required field', () => {
    expect(LESSONS).toHaveLength(6);
    expect(lessonsForPath('beginner')).toHaveLength(3);
    expect(lessonsForPath('experienced')).toHaveLength(3);
    const ids = new Set<string>();
    for (const l of LESSONS) {
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(l.title && l.description && l.objective && l.category).toBeTruthy();
      expect(l.minutes).toBeGreaterThan(0);
      expect(l.content.length).toBeGreaterThan(0);
    }
    expect(getLesson('b1-keyboard-layout')?.title).toMatch(/Keyboard/);
    expect(getLesson('nope')).toBeUndefined();
  });
});

describe('video provider boundary', () => {
  test('reports not-configured instead of fabricating results', async () => {
    expect(unconfiguredVideoProvider.isConfigured()).toBe(false);
    const r = await unconfiguredVideoProvider.search({ query: 'scales' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-configured');
  });
});
