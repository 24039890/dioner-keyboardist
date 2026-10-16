/**
 * Pitch classes and note spelling.
 *
 * Pitch classes are integers 0–11 (C = 0). All arithmetic is modulo 12.
 * A *note name* adds spelling: a letter plus an accidental (−2..+2), so
 * F♯ and G♭ share pitch class 6 but are distinct names.
 */

export type PitchClass = number;

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const NATURAL_PC: Record<Letter, PitchClass> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export interface NoteName {
  letter: Letter;
  /** −2 = double flat, −1 = flat, 0 = natural, 1 = sharp, 2 = double sharp */
  accidental: number;
}

export type AccidentalStyle = 'unicode' | 'ascii';

/** Modulo 12 that always returns 0..11, including for negative input. */
export function mod12(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

export function isPitchClass(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 11;
}

export function noteNameToPc(note: NoteName): PitchClass {
  return mod12(NATURAL_PC[note.letter] + note.accidental);
}

export function letterIndex(letter: Letter): number {
  return LETTERS.indexOf(letter);
}

export function naturalPc(letter: Letter): PitchClass {
  return NATURAL_PC[letter];
}

const ACCIDENTAL_TOKENS: Record<string, number> = {
  '': 0,
  '#': 1,
  '♯': 1,
  b: -1,
  '♭': -1,
  '##': 2,
  x: 2,
  '𝄪': 2,
  bb: -2,
  '♭♭': -2,
  '𝄫': -2,
  '♮': 0,
};

const NOTE_RE = /^([A-Ga-g])(##|bb|♭♭|#|♯|b|♭|x|𝄪|𝄫|♮)?$/;

/** Parses "F#", "Bb", "F♯", "B♭", "Cb", "E#", "Fx". Returns null if invalid. */
export function parseNoteName(text: string): NoteName | null {
  const m = NOTE_RE.exec(text.trim());
  if (!m || !m[1]) return null;
  const accidental = ACCIDENTAL_TOKENS[m[2] ?? ''];
  if (accidental === undefined) return null;
  return { letter: m[1].toUpperCase() as Letter, accidental };
}

export function formatAccidental(accidental: number, style: AccidentalStyle = 'unicode'): string {
  const unicode = style === 'unicode';
  switch (accidental) {
    case -2:
      return unicode ? '𝄫' : 'bb';
    case -1:
      return unicode ? '♭' : 'b';
    case 1:
      return unicode ? '♯' : '#';
    case 2:
      return unicode ? '𝄪' : '##';
    default:
      return '';
  }
}

export function formatNoteName(note: NoteName, style: AccidentalStyle = 'unicode'): string {
  return note.letter + formatAccidental(note.accidental, style);
}

/** Spoken form for screen readers, e.g. "F sharp". */
export function spokenNoteName(note: NoteName): string {
  const words: Record<number, string> = {
    [-2]: ' double flat',
    [-1]: ' flat',
    0: '',
    1: ' sharp',
    2: ' double sharp',
  };
  return note.letter + (words[note.accidental] ?? '');
}

const SHARP_SPELLING: readonly NoteName[] = [
  { letter: 'C', accidental: 0 },
  { letter: 'C', accidental: 1 },
  { letter: 'D', accidental: 0 },
  { letter: 'D', accidental: 1 },
  { letter: 'E', accidental: 0 },
  { letter: 'F', accidental: 0 },
  { letter: 'F', accidental: 1 },
  { letter: 'G', accidental: 0 },
  { letter: 'G', accidental: 1 },
  { letter: 'A', accidental: 0 },
  { letter: 'A', accidental: 1 },
  { letter: 'B', accidental: 0 },
];

const FLAT_SPELLING: readonly NoteName[] = [
  { letter: 'C', accidental: 0 },
  { letter: 'D', accidental: -1 },
  { letter: 'D', accidental: 0 },
  { letter: 'E', accidental: -1 },
  { letter: 'E', accidental: 0 },
  { letter: 'F', accidental: 0 },
  { letter: 'G', accidental: -1 },
  { letter: 'G', accidental: 0 },
  { letter: 'A', accidental: -1 },
  { letter: 'A', accidental: 0 },
  { letter: 'B', accidental: -1 },
  { letter: 'B', accidental: 0 },
];

/** Context-free spelling: naturals where possible, otherwise sharps or flats. */
export function spellPitchClass(pc: PitchClass, preferFlats: boolean): NoteName {
  const table = preferFlats ? FLAT_SPELLING : SHARP_SPELLING;
  return table[mod12(pc)] as NoteName;
}

/** The note name with a given letter that has pitch class `pc`, or null if it would need >2 accidentals. */
export function spellWithLetter(pc: PitchClass, letter: Letter): NoteName | null {
  let diff = mod12(pc - NATURAL_PC[letter]);
  if (diff > 6) diff -= 12;
  if (Math.abs(diff) > 2) return null;
  return { letter, accidental: diff };
}

/**
 * Signed shortest offset in semitones from `from` to `to`, in −5..+6.
 * F♯→G♯ = +2, G♯→F♯ = −2.
 */
export function signedOffset(from: PitchClass, to: PitchClass): number {
  const d = mod12(to - from);
  return d > 6 ? d - 12 : d;
}

export function transposePc(pc: PitchClass, semitones: number): PitchClass {
  return mod12(pc + semitones);
}

/** MIDI note number → scientific pitch name, e.g. 69 → "A4". */
export function midiToNoteLabel(midi: number, preferFlats = false, style: AccidentalStyle = 'unicode'): string {
  const octave = Math.floor(midi / 12) - 1;
  return formatNoteName(spellPitchClass(mod12(midi), preferFlats), style) + String(octave);
}
