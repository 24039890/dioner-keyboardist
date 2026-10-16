/**
 * Exercise generation and answer validation. Every correct answer is computed
 * with the music-theory engine, never hard-coded, and question sets are
 * deterministic for a given seed so they can be tested and resumed.
 */
import { formatChord, parseChord, transposeChordSymbol } from '../music-theory/chords';
import { type Key, keyLabel, keyShortLabel, scaleNotes, spellInKey } from '../music-theory/keys';
import { chordSymbolToNumber, diatonicChords, numberToChord } from '../music-theory/numberSystem';
import { type NoteName, formatNoteName, mod12, noteNameToPc, spellPitchClass } from '../music-theory/pitch';
import { formatOffset, targetKey } from '../music-theory/transposition';

export type ExerciseKind =
  | 'note-recognition'
  | 'scale-construction'
  | 'chord-identification'
  | 'chord-construction'
  | 'number-to-chord'
  | 'transposition'
  | 'progression-recognition';

export interface Question {
  id: string;
  kind: ExerciseKind;
  prompt: string;
  /** 'single' = choose one; 'multi' = choose every correct option. */
  selection: 'single' | 'multi';
  options: string[];
  correct: string[];
  explanation: string;
  /** Pitch classes to highlight on the on-screen keyboard (C4 octave). */
  highlight?: number[];
}

export interface AnswerResult {
  correct: boolean;
  missing: string[];
  extra: string[];
}

export function checkAnswer(q: Question, selected: readonly string[]): AnswerResult {
  const want = new Set(q.correct);
  const got = new Set(selected);
  const missing = [...want].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !want.has(x));
  if (q.selection === 'single') return { correct: got.size === 1 && missing.length === 0, missing, extra };
  return { correct: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Small seeded PRNG (mulberry32) so question sets are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T;
}

function shuffle<T>(r: () => number, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** `correct` plus distinct distractors, shuffled. */
function choices(r: () => number, correct: string, pool: readonly string[], n = 4): string[] {
  const distractors = shuffle(
    r,
    [...new Set(pool)].filter((p) => p !== correct),
  ).slice(0, n - 1);
  return shuffle(r, [correct, ...distractors]);
}

const n = (note: NoteName) => formatNoteName(note);
const COMMON_MAJOR: Key[] = [0, 7, 2, 9, 4, 5, 10, 3].map((t) => ({ tonic: t, mode: 'major' }));
const COMMON_MINOR: Key[] = [9, 4, 11, 2, 7, 0].map((t) => ({ tonic: t, mode: 'minor' }));

function noteRecognition(r: () => number, i: number): Question {
  const pc = Math.floor(r() * 12);
  const sharp = n(spellPitchClass(pc, false));
  const flat = n(spellPitchClass(pc, true));
  const label = sharp === flat ? sharp : `${sharp} / ${flat}`;
  const pool = Array.from({ length: 12 }, (_, p) => {
    const s = n(spellPitchClass(p, false));
    const f = n(spellPitchClass(p, true));
    return s === f ? s : `${s} / ${f}`;
  });
  const black = sharp !== flat;
  return {
    id: `note-${i}`,
    kind: 'note-recognition',
    prompt: 'Which note is highlighted on the keyboard?',
    selection: 'single',
    options: choices(r, label, pool),
    correct: [label],
    explanation: black
      ? `This black key sits between ${n(spellPitchClass(pc - 1, false))} and ${n(spellPitchClass(pc + 1, false))}. It can be called ${sharp} (raised) or ${flat} (lowered) — the same key, two names.`
      : `This white key is ${sharp}. Use the groups of two and three black keys to find it: C sits just left of the group of two.`,
    highlight: [pc],
  };
}

function scaleConstruction(r: () => number, i: number): Question {
  const key = pick(r, [...COMMON_MAJOR, ...COMMON_MAJOR, ...COMMON_MINOR]);
  const notes = scaleNotes(key).map(n);
  const scalePcs = new Set(scaleNotes(key).map(noteNameToPc));
  const outside = Array.from({ length: 12 }, (_, p) => p)
    .filter((p) => !scalePcs.has(p))
    .map((p) => n(spellInKey(p, key)));
  const options = shuffle(r, [...notes, ...shuffle(r, outside).slice(0, 3)]);
  const pattern = key.mode === 'major' ? 'whole, whole, half, whole, whole, whole, half' : 'whole, half, whole, whole, half, whole, whole';
  return {
    id: `scale-${i}`,
    kind: 'scale-construction',
    prompt: `Select every note in the ${keyLabel(key)} scale.`,
    selection: 'multi',
    options,
    correct: notes,
    explanation: `${keyLabel(key)}: ${notes.join(' – ')}. The ${key.mode} pattern is ${pattern}, and each letter appears once.`,
    highlight: [...scalePcs],
  };
}

const TRIAD_KINDS = [
  { suffix: '', name: 'major', steps: [0, 4, 7] },
  { suffix: 'm', name: 'minor', steps: [0, 3, 7] },
] as const;

function triadNotes(rootPc: number, steps: readonly number[], key: Key): string[] {
  return steps.map((s) => n(spellInKey(mod12(rootPc + s), key)));
}

function chordIdentification(r: () => number, i: number): Question {
  const kind = pick(r, TRIAD_KINDS);
  const rootPc = Math.floor(r() * 12);
  // Spell in the key where this chord is the tonic.
  const key: Key = { tonic: rootPc, mode: kind.suffix === 'm' ? 'minor' : 'major' };
  const notes = triadNotes(rootPc, kind.steps, key);
  const correct = `${keyShortLabel(key)}`.replace(/m$/, '') + kind.suffix;
  const rootName = notes[0] as string;
  const pool = [
    `${rootName}${kind.suffix === 'm' ? '' : 'm'}`,
    ...Array.from({ length: 12 }, (_, p) => n(spellPitchClass(p, false)) + kind.suffix),
  ];
  return {
    id: `chordid-${i}`,
    kind: 'chord-identification',
    prompt: `Which chord is made of ${notes.join(' – ')}?`,
    selection: 'single',
    options: choices(r, correct, pool),
    correct: [correct],
    explanation: `${notes[0]} up ${kind.steps[1]} semitones is ${notes[1]} (a ${kind.name === 'major' ? 'major' : 'minor'} third), then up 3–4 more to ${notes[2]} (a perfect fifth above the root). That makes ${correct}, a ${kind.name} chord.`,
    highlight: kind.steps.map((s) => mod12(rootPc + s)),
  };
}

function chordConstruction(r: () => number, i: number): Question {
  const kind = pick(r, TRIAD_KINDS);
  const key = pick(r, kind.suffix === 'm' ? COMMON_MINOR : COMMON_MAJOR);
  const notes = triadNotes(key.tonic, kind.steps, key);
  const symbol = keyShortLabel(key);
  const outside = Array.from({ length: 12 }, (_, p) => p)
    .filter((p) => !kind.steps.map((s) => mod12(key.tonic + s)).includes(p))
    .map((p) => n(spellInKey(p, key)));
  return {
    id: `chordbuild-${i}`,
    kind: 'chord-construction',
    prompt: `Build ${symbol}: select its three notes.`,
    selection: 'multi',
    options: shuffle(r, [...notes, ...shuffle(r, outside).slice(0, 3)]),
    correct: notes,
    explanation: `${symbol} = root ${notes[0]}, ${kind.name === 'major' ? 'major' : 'minor'} third ${notes[1]}, fifth ${notes[2]}.`,
    highlight: kind.steps.map((s) => mod12(key.tonic + s)),
  };
}

function numberToChordQuestion(r: () => number, i: number): Question {
  const key = pick(r, COMMON_MAJOR);
  const degree = 1 + Math.floor(r() * 6);
  const res = numberToChord(String(degree), key);
  const correct = res.ok ? res.chord : '';
  const pool = diatonicChords(key);
  return {
    id: `nns-${i}`,
    kind: 'number-to-chord',
    prompt: `In ${keyLabel(key)}, what chord is the ${degree}?`,
    selection: 'single',
    options: choices(r, correct, pool),
    correct: [correct],
    explanation: `${keyLabel(key)} chords: ${pool.map((c, d) => `${d + 1} = ${c}`).join(', ')}. Degrees 2, 3 and 6 are minor; 7 is diminished.`,
  };
}

const PROGRESSIONS = ['1-5-6-4', '1-4-5-1', '6-4-1-5', '1-6-4-5', '2-5-1', '1-4-6-5'] as const;

function chordsFor(prog: string, key: Key): string[] {
  return prog.split('-').map((d) => {
    const res = numberToChord(d, key);
    return res.ok ? res.chord : d;
  });
}

function transpositionQuestion(r: () => number, i: number): Question {
  const from = pick(r, COMMON_MAJOR);
  let offset = 0;
  while (offset === 0) offset = Math.floor(r() * 11) - 5;
  const to = targetKey(from, offset);
  const prog = pick(r, PROGRESSIONS);
  const original = chordsFor(prog, from);
  const correct = original
    .map((c) => {
      const t = transposeChordSymbol(c, offset, to);
      return t.ok ? t.text : c;
    })
    .join(' – ');
  const wrongs = [-1, 1, 2, -2, 7].map((delta) => targetKey(from, offset + delta)).map((k) => chordsFor(prog, k).join(' – '));
  return {
    id: `transpose-${i}`,
    kind: 'transposition',
    prompt: `Transpose ${original.join(' – ')} from ${keyLabel(from)} to ${keyLabel(to)} (${formatOffset(offset)} semitones).`,
    selection: 'single',
    options: choices(r, correct, wrongs),
    correct: [correct],
    explanation: `Move every chord ${offset > 0 ? 'up' : 'down'} ${Math.abs(offset)} semitone${Math.abs(offset) === 1 ? '' : 's'} and keep its quality: ${original.map((c, k) => `${c} → ${correct.split(' – ')[k]}`).join(', ')}.`,
  };
}

function progressionRecognition(r: () => number, i: number): Question {
  const key = pick(r, COMMON_MAJOR);
  const prog = pick(r, PROGRESSIONS);
  const chords = chordsFor(prog, key);
  const numbers = chords.map((c) => {
    const res = chordSymbolToNumber(c, key);
    return res.ok ? res.number : '?';
  });
  const correct = prog;
  return {
    id: `progression-${i}`,
    kind: 'progression-recognition',
    prompt: `These chords are in ${keyLabel(key)}: ${chords.join(' – ')}. Which number pattern is this?`,
    selection: 'single',
    options: choices(r, correct, PROGRESSIONS),
    correct: [correct],
    explanation: `In ${keyLabel(key)}: ${chords.map((c, k) => `${c} = ${numbers[k]}`).join(', ')}, so the pattern is ${prog} (minor degrees are written 2m, 3m, 6m in full notation).`,
  };
}

const GENERATORS: Record<ExerciseKind, (r: () => number, i: number) => Question> = {
  'note-recognition': noteRecognition,
  'scale-construction': scaleConstruction,
  'chord-identification': chordIdentification,
  'chord-construction': chordConstruction,
  'number-to-chord': numberToChordQuestion,
  transposition: transpositionQuestion,
  'progression-recognition': progressionRecognition,
};

/** Generates `count` questions cycling through `kinds`, deterministically for `seed`. */
export function generateQuestions(kinds: readonly ExerciseKind[], count: number, seed: number): Question[] {
  const r = rng(seed);
  const out: Question[] = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length] as ExerciseKind;
    out.push(GENERATORS[kind](r, i));
  }
  return out;
}

/** Normalises a chord symbol for display (keeps the user's suffix). */
export function displayChord(symbol: string): string {
  const p = parseChord(symbol);
  return p.ok ? formatChord(p.chord) : symbol;
}
