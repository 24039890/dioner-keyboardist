/**
 * Initial curriculum: six complete lessons (three per path). The text is
 * original to DIONER; no third-party lesson material is reproduced.
 */
import type { ExerciseKind } from './exercises';

export type LearningPath = 'beginner' | 'experienced';
export type Difficulty = 'Foundation' | 'Intermediate' | 'Advanced';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'keyboard'; caption: string; highlight: number[] }
  | { type: 'tip'; text: string };

export interface Lesson {
  id: string;
  path: LearningPath;
  order: number;
  title: string;
  description: string;
  objective: string;
  difficulty: Difficulty;
  category: string;
  minutes: number;
  content: ContentBlock[];
  exercise: { kinds: ExerciseKind[]; count: number };
  attribution?: string;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'b1-keyboard-layout',
    path: 'beginner',
    order: 1,
    title: 'Keyboard layout and note names',
    description: 'Find any note quickly using the black-key groups.',
    objective: 'Name every white and black key in one octave.',
    difficulty: 'Foundation',
    category: 'Keyboard basics',
    minutes: 8,
    content: [
      {
        type: 'text',
        text: 'The keyboard repeats the same 12-key pattern from bottom to top. Black keys come in groups of two and three — they are your map.',
      },
      { type: 'keyboard', caption: 'C is the white key just left of each group of two black keys.', highlight: [0] },
      {
        type: 'bullets',
        items: [
          'White keys use the letters C D E F G A B.',
          'Between E–F and B–C there is no black key.',
          'A black key is named from its neighbours: C♯ (C raised) is the same key as D♭ (D lowered).',
        ],
      },
      { type: 'tip', text: 'Close your eyes, feel for a group of two black keys, and play the white key on its left: that is always C.' },
    ],
    exercise: { kinds: ['note-recognition'], count: 6 },
  },
  {
    id: 'b2-major-scales',
    path: 'beginner',
    order: 2,
    title: 'Sharps, flats and major scales',
    description: 'Build any major scale from one simple pattern.',
    objective: 'Construct major and natural minor scales in common keys.',
    difficulty: 'Foundation',
    category: 'Scales',
    minutes: 12,
    content: [
      {
        type: 'text',
        text: 'A semitone (half step) is the distance to the very next key, black or white. A tone (whole step) is two semitones.',
      },
      {
        type: 'bullets',
        items: [
          'Major: whole, whole, half, whole, whole, whole, half.',
          'Natural minor: whole, half, whole, whole, half, whole, whole.',
          'Each letter appears once, so D major uses F♯ (not G♭) and C♯ (not D♭).',
        ],
      },
      { type: 'keyboard', caption: 'D major: D E F♯ G A B C♯', highlight: [2, 4, 6, 7, 9, 11, 1] },
      {
        type: 'tip',
        text: 'Every major key has a relative minor that uses the same notes, starting on its 6th degree: C major ↔ A minor.',
      },
    ],
    exercise: { kinds: ['scale-construction'], count: 5 },
  },
  {
    id: 'b3-triads',
    path: 'beginner',
    order: 3,
    title: 'Major and minor chords',
    description: 'Play and recognise your first complete triads.',
    objective: 'Identify and build major and minor triads from their notes.',
    difficulty: 'Foundation',
    category: 'Chords',
    minutes: 15,
    content: [
      { type: 'text', text: 'A triad stacks three notes: a root, a third and a fifth. The third decides the colour.' },
      {
        type: 'bullets',
        items: [
          'Major third = 4 semitones above the root (bright).',
          'Minor third = 3 semitones above the root (darker).',
          'The perfect fifth is 7 semitones above the root in both.',
        ],
      },
      { type: 'keyboard', caption: 'C major (C E G) — try lowering E to E♭ to hear C minor.', highlight: [0, 4, 7] },
      { type: 'tip', text: 'Use fingers 1, 3 and 5 in the right hand for root-position triads.' },
    ],
    exercise: { kinds: ['chord-identification', 'chord-construction'], count: 6 },
  },
  {
    id: 'e1-number-system',
    path: 'experienced',
    order: 1,
    title: 'Number-system fluency',
    description: 'Think in scale degrees so any key feels the same.',
    objective: 'Convert scale-degree numbers to chords in any major key instantly.',
    difficulty: 'Intermediate',
    category: 'Number system',
    minutes: 14,
    content: [
      {
        type: 'text',
        text: 'In the number system, 1 is the key’s tonic chord and 2–7 follow the scale. A plain number gets the chord quality that naturally occurs on that degree.',
      },
      {
        type: 'bullets',
        items: [
          'Major keys: 1, 4, 5 are major; 2, 3, 6 are minor; 7 is diminished.',
          '1–5–6–4 in C major = C G Am F; in D major = D A Bm G.',
          'A song number (No. 014) is not a scale degree — only chart numbers are.',
        ],
      },
      { type: 'tip', text: 'Say the numbers aloud as you play a progression, then switch keys without changing what you say.' },
    ],
    exercise: { kinds: ['number-to-chord'], count: 6 },
  },
  {
    id: 'e2-transposition',
    path: 'experienced',
    order: 2,
    title: 'Transposing on the fly',
    description: 'Move a whole progression to a singer’s key.',
    objective: 'Transpose four-chord progressions by any interval while keeping chord qualities.',
    difficulty: 'Intermediate',
    category: 'Transposition',
    minutes: 15,
    content: [
      {
        type: 'text',
        text: 'Transposing moves every chord by the same number of semitones. Qualities (m, 7, sus4, slash bass) never change — only the letters do.',
      },
      {
        type: 'bullets',
        items: [
          'C to D is +2: C | G | Am | F → D | A | Bm | G.',
          'Slash chords move both notes: C/E up 2 is D/F♯.',
          'Spell chords for the new key: in E♭ major write B♭, not A♯.',
        ],
      },
      {
        type: 'tip',
        text: 'For large moves, transpose the numbers instead: find the progression in numbers once, then read it in the new key.',
      },
    ],
    exercise: { kinds: ['transposition'], count: 5 },
  },
  {
    id: 'e3-progressions',
    path: 'experienced',
    order: 3,
    title: 'Recognising common progressions',
    description: 'Spot the patterns behind thousands of songs.',
    objective: 'Identify common progressions from chord charts in any major key.',
    difficulty: 'Advanced',
    category: 'Harmony',
    minutes: 12,
    content: [
      {
        type: 'text',
        text: 'A handful of progressions appear again and again. Recognising them on the chart lets you predict the next chord before it comes.',
      },
      {
        type: 'bullets',
        items: [
          '1–5–6–4 and 6–4–1–5 are rotations of the same four chords.',
          '2–5–1 is the strongest cadence: it pulls home to the tonic.',
          '1–4–5–1 is the classic hymn and blues foundation.',
        ],
      },
      { type: 'tip', text: 'This lesson trains recognition on the page. Practise with recordings afterwards to train your ear.' },
    ],
    exercise: { kinds: ['progression-recognition'], count: 5 },
  },
];

export function lessonsForPath(path: LearningPath): Lesson[] {
  return LESSONS.filter((l) => l.path === path).sort((a, b) => a.order - b.order);
}

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
