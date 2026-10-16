import { LESSONS, getLesson, lessonsForPath } from '@/features/learning/curriculum';
import { type ExerciseKind, checkAnswer, generateQuestions } from '@/features/learning/exercises';
import { unconfiguredVideoProvider } from '@/features/learning/videoProviders';
import { chordPitchClasses, noteNameToPc, parseChord, parseNoteName } from '@/features/music-theory';

const ALL_KINDS: ExerciseKind[] = [
  'note-recognition',
  'scale-construction',
  'chord-identification',
  'chord-construction',
  'number-to-chord',
  'transposition',
  'progression-recognition',
];

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
      expect(l.exercise.count).toBeGreaterThan(0);
    }
    expect(getLesson('b1-keyboard-layout')?.title).toMatch(/Keyboard/);
    expect(getLesson('nope')).toBeUndefined();
  });

  test('every exercise kind is used by at least one lesson', () => {
    const used = new Set(LESSONS.flatMap((l) => l.exercise.kinds));
    for (const k of ALL_KINDS) expect(used.has(k)).toBe(true);
  });
});

describe('exercise generation', () => {
  test('questions are well-formed for many seeds', () => {
    for (const kind of ALL_KINDS) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const q of generateQuestions([kind], 3, seed)) {
          expect(new Set(q.options).size).toBe(q.options.length);
          for (const c of q.correct) expect(q.options).toContain(c);
          expect(q.correct.length).toBeGreaterThan(0);
          if (q.selection === 'single') expect(q.correct).toHaveLength(1);
          expect(q.options.length).toBeGreaterThanOrEqual(q.selection === 'single' ? 3 : q.correct.length + 1);
          expect(q.prompt.length).toBeGreaterThan(0);
          expect(q.explanation.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('generation is deterministic for a seed', () => {
    expect(generateQuestions(ALL_KINDS, 14, 42)).toEqual(generateQuestions(ALL_KINDS, 14, 42));
    expect(generateQuestions(ALL_KINDS, 14, 42)).not.toEqual(generateQuestions(ALL_KINDS, 14, 43));
  });

  test('scale and chord answers agree with the theory engine', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const [scale, chordId, chordBuild, note] = [
        ...generateQuestions(['scale-construction'], 1, seed),
        ...generateQuestions(['chord-identification'], 1, seed),
        ...generateQuestions(['chord-construction'], 1, seed),
        ...generateQuestions(['note-recognition'], 1, seed),
      ];
      // Scale answers: seven distinct letters matching the highlighted pitch classes.
      const pcs = scale!.correct.map((x) => noteNameToPc(parseNoteName(x)!));
      expect(new Set(pcs)).toEqual(new Set(scale!.highlight));
      expect(new Set(scale!.correct.map((x) => x[0])).size).toBe(7);
      // Chord identification: the answer chord sounds exactly the highlighted notes.
      const chord = parseChord(chordId!.correct[0]!);
      expect(chord.ok).toBe(true);
      if (chord.ok) expect(new Set(chordPitchClasses(chord.chord))).toEqual(new Set(chordId!.highlight));
      // Chord construction: three notes matching the highlighted pitch classes.
      expect(new Set(chordBuild!.correct.map((x) => noteNameToPc(parseNoteName(x)!)))).toEqual(new Set(chordBuild!.highlight));
      // Note recognition: the answer names the highlighted key.
      const first = note!.correct[0]!.split(' / ')[0]!;
      expect(noteNameToPc(parseNoteName(first)!)).toBe(note!.highlight![0]);
    }
  });

  test('number-system and progression answers are consistent', () => {
    const q = generateQuestions(['number-to-chord'], 20, 5);
    for (const x of q) expect(x.explanation).toContain(x.correct[0]!);
    for (const p of generateQuestions(['progression-recognition'], 20, 9)) {
      expect(['1-5-6-4', '1-4-5-1', '6-4-1-5', '1-6-4-5', '2-5-1', '1-4-6-5']).toContain(p.correct[0]);
    }
  });
});

describe('answer validation', () => {
  const [single] = generateQuestions(['number-to-chord'], 1, 1);
  const [multi] = generateQuestions(['scale-construction'], 1, 1);

  test('single-choice', () => {
    expect(checkAnswer(single!, single!.correct).correct).toBe(true);
    const wrong = single!.options.find((o) => o !== single!.correct[0])!;
    expect(checkAnswer(single!, [wrong]).correct).toBe(false);
    expect(checkAnswer(single!, []).correct).toBe(false);
  });

  test('multi-select requires exactly the right set', () => {
    expect(checkAnswer(multi!, multi!.correct).correct).toBe(true);
    const missingOne = checkAnswer(multi!, multi!.correct.slice(1));
    expect(missingOne.correct).toBe(false);
    expect(missingOne.missing).toHaveLength(1);
    const extra = multi!.options.find((o) => !multi!.correct.includes(o))!;
    const withExtra = checkAnswer(multi!, [...multi!.correct, extra]);
    expect(withExtra.correct).toBe(false);
    expect(withExtra.extra).toEqual([extra]);
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
