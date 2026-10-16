/**
 * Musical keys, scales and key-aware spelling.
 *
 * Spelling strategy (documented in docs/ARCHITECTURE.md):
 * - Each key has one conventional tonic spelling (e.g. D♭ major, E♭ minor, F♯ major).
 * - Scale notes are spelled letter-by-letter from the tonic, so every letter
 *   appears once (F♯ major → F♯ G♯ A♯ B C♯ D♯ E♯).
 * - Non-diatonic pitch classes are spelled as altered scale degrees
 *   (♭2, ♭3, ♯4, ♭6, ♭7 in major; ♭2, ♮3, ♯4, ♮6, ♮7 in minor).
 * - If that spelling would need a double accidental (e.g. F𝄪 in G♯ minor),
 *   the simpler enharmonic in the key's sharp/flat direction is used instead,
 *   because chord charts are read at sight.
 */
import {
  type AccidentalStyle,
  type Letter,
  type NoteName,
  type PitchClass,
  LETTERS,
  formatNoteName,
  letterIndex,
  mod12,
  noteNameToPc,
  parseNoteName,
  spellPitchClass,
  spellWithLetter,
  spokenNoteName,
} from './pitch';

export type Mode = 'major' | 'minor';

export interface Key {
  tonic: PitchClass;
  mode: Mode;
}

export const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
export const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;

const MAJOR_TONICS: readonly string[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONICS: readonly string[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export function scaleIntervals(mode: Mode): readonly number[] {
  return mode === 'major' ? MAJOR_INTERVALS : NATURAL_MINOR_INTERVALS;
}

export function tonicName(key: Key): NoteName {
  const table = key.mode === 'major' ? MAJOR_TONICS : MINOR_TONICS;
  const parsed = parseNoteName(table[mod12(key.tonic)] as string);
  if (!parsed) throw new Error('Invalid tonic table');
  return parsed;
}

/** Number of sharps (positive) or flats (negative) in the key signature. */
export function keySignature(key: Key): number {
  const majorTonic = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3);
  // Position on the circle of fifths: C=0, G=1 … F=−1.
  const fifths = mod12(majorTonic * 7);
  const sharps = fifths > 6 ? fifths - 12 : fifths;
  // Respect the conventional tonic spelling for the 6-accidental keys.
  // (E♭ minor → 6 flats, F♯ major / D♯… → 6 sharps.)
  if (Math.abs(sharps) === 6) return tonicName(key).accidental < 0 ? -6 : 6;
  return sharps;
}

export function prefersFlats(key: Key): boolean {
  return keySignature(key) < 0;
}

/** The seven scale notes, spelled letter by letter from the tonic. */
export function scaleNotes(key: Key): NoteName[] {
  const tonic = tonicName(key);
  const start = letterIndex(tonic.letter);
  return scaleIntervals(key.mode).map((interval, degree) => {
    const letter = LETTERS[(start + degree) % 7] as Letter;
    const spelled = spellWithLetter(mod12(key.tonic + interval), letter);
    if (!spelled) throw new Error('Unspellable scale degree');
    return spelled;
  });
}

export function scalePitchClasses(key: Key): PitchClass[] {
  return scaleIntervals(key.mode).map((i) => mod12(key.tonic + i));
}

export function isDiatonic(pc: PitchClass, key: Key): boolean {
  return scalePitchClasses(key).includes(mod12(pc));
}

/**
 * Interval above tonic (0–11) → [scale degree index 0–6, alteration relative to that scale's degree].
 */
const MAJOR_DEGREE_MAP: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [2, -1],
  [2, 0],
  [3, 0],
  [3, 1],
  [4, 0],
  [5, -1],
  [5, 0],
  [6, -1],
  [6, 0],
];
const MINOR_DEGREE_MAP: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [2, 0],
  [2, 1],
  [3, 0],
  [3, 1],
  [4, 0],
  [5, 0],
  [5, 1],
  [6, 0],
  [6, 1],
];

/** Degree index (0–6) and alteration (−1/0/+1) of a pitch class relative to the key's own scale. */
export function degreeOf(pc: PitchClass, key: Key): { degree: number; alteration: number } {
  const map = key.mode === 'major' ? MAJOR_DEGREE_MAP : MINOR_DEGREE_MAP;
  const entry = map[mod12(pc - key.tonic)] as readonly [number, number];
  return { degree: entry[0], alteration: entry[1] };
}

/** Spells a pitch class in the context of a key (see strategy at top of file). */
export function spellInKey(pc: PitchClass, key: Key): NoteName {
  const { degree } = degreeOf(pc, key);
  const tonic = tonicName(key);
  const letter = LETTERS[(letterIndex(tonic.letter) + degree) % 7] as Letter;
  const spelled = spellWithLetter(mod12(pc), letter);
  if (spelled && Math.abs(spelled.accidental) <= 1) return spelled;
  return spellPitchClass(pc, prefersFlats(key));
}

export function modeLabel(mode: Mode): string {
  return mode === 'major' ? 'Major' : 'Minor';
}

/** "F♯ Major", "B♭ Minor". */
export function keyLabel(key: Key, style: AccidentalStyle = 'unicode'): string {
  return `${formatNoteName(tonicName(key), style)} ${modeLabel(key.mode)}`;
}

/** Short chord-chart form: "F♯", "B♭m". */
export function keyShortLabel(key: Key, style: AccidentalStyle = 'unicode'): string {
  return formatNoteName(tonicName(key), style) + (key.mode === 'minor' ? 'm' : '');
}

/** "F sharp major" for screen readers. */
export function spokenKeyLabel(key: Key): string {
  return `${spokenNoteName(tonicName(key))} ${key.mode}`;
}

const KEY_RE = /^\s*([A-Ga-g](?:##|bb|#|♯|b|♭)?)\s*(m|min|minor|maj|major|M)?\s*$/;

/** Parses "C", "F#m", "Bb major", "A minor", "C♯ min". */
export function parseKey(text: string): Key | null {
  const m = KEY_RE.exec(text);
  if (!m || !m[1]) return null;
  const note = parseNoteName(m[1]);
  if (!note) return null;
  const q = m[2] ?? '';
  const mode: Mode = q === 'm' || q === 'min' || q === 'minor' ? 'minor' : 'major';
  return { tonic: noteNameToPc(note), mode };
}

export function relativeKey(key: Key): Key {
  return key.mode === 'major' ? { tonic: mod12(key.tonic + 9), mode: 'minor' } : { tonic: mod12(key.tonic + 3), mode: 'major' };
}

export function sameKey(a: Key | null | undefined, b: Key | null | undefined): boolean {
  return !!a && !!b && a.tonic === b.tonic && a.mode === b.mode;
}

export function allKeys(): Key[] {
  const keys: Key[] = [];
  for (const mode of ['major', 'minor'] as const) {
    for (let tonic = 0; tonic < 12; tonic++) keys.push({ tonic, mode });
  }
  return keys;
}

/** Stable compact encoding for storage: "6:major". */
export function encodeKey(key: Key): string {
  return `${key.tonic}:${key.mode}`;
}

export function decodeKey(text: string | null | undefined): Key | null {
  if (!text) return null;
  const [t, mode] = text.split(':');
  const tonic = Number(t);
  if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11) return null;
  if (mode !== 'major' && mode !== 'minor') return null;
  return { tonic, mode };
}
