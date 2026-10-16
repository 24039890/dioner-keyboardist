/**
 * Number-system (Nashville-style) notation.
 *
 * Convention used throughout DIONER (shown to users in the UI):
 * - Numbers 1–7 are scale degrees of the selected key's own scale:
 *   the major scale in a major key, the natural minor scale in a minor key.
 *   "1" is always the tonic. Song numbers (e.g. "No. 014") are never scale degrees.
 * - A plain number gets the diatonic triad quality of that degree.
 *   In C major: 1 = C, 2 = Dm, 3 = Em, 4 = F, 5 = G, 6 = Am, 7 = B°.
 * - "♭"/"#" before the number alters the root: ♭7 in C major = B♭.
 * - An explicit quality replaces the default: 4m, 2maj, 5sus4, 1aug.
 * - "7" after a degree adds the diatonic-style seventh:
 *   minor degree → m7, major degree → dominant 7, diminished degree → m7♭5.
 *   Use "maj7" for a major seventh: 4maj7.
 * - A slash gives the bass as a degree: 1/3 = C/E, 5/7 = G/B.
 * - Progressions may be separated by "-", spaces, commas or bar lines.
 *
 * When converting chords back to numbers, any non-major quality is written
 * explicitly (6m, 7°, 57) so the result is unambiguous.
 */
import { type Chord, parseChord, parseSuffix } from './chords';
import { type Key, degreeOf, scaleIntervals, spellInKey } from './keys';
import { type AccidentalStyle, type PitchClass, formatAccidental, formatNoteName, mod12, noteNameToPc } from './pitch';

type DiatonicTriad = 'major' | 'minor' | 'diminished';

const MAJOR_TRIADS: readonly DiatonicTriad[] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];
const MINOR_TRIADS: readonly DiatonicTriad[] = ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'];

export function diatonicTriad(degreeIndex: number, key: Key): DiatonicTriad {
  const table = key.mode === 'major' ? MAJOR_TRIADS : MINOR_TRIADS;
  return table[degreeIndex] as DiatonicTriad;
}

const NUMBER_RE = /^([b#♭♯]?)([1-7])([^/]*)(?:\/([b#♭♯]?)([1-7]))?$/;

function accidentalValue(token: string | undefined): number {
  if (token === 'b' || token === '♭') return -1;
  if (token === '#' || token === '♯') return 1;
  return 0;
}

function degreePc(degreeIndex: number, alteration: number, key: Key): PitchClass {
  return mod12(key.tonic + (scaleIntervals(key.mode)[degreeIndex] as number) + alteration);
}

const EXPLICIT_QUALITY_RE = /^(dom|maj|Maj|M|Δ|min|mi|m|-|dim|°|o|aug|\+|ø|sus|5$)/;

export type NumberTokenResult = { ok: true; input: string; chord: string } | { ok: false; input: string; error: string };

/** Converts one number token ("6m", "♭7", "5/7", "47") to a chord symbol in `key`. */
export function numberToChord(token: string, key: Key, style: AccidentalStyle = 'unicode'): NumberTokenResult {
  const m = NUMBER_RE.exec(token.trim());
  if (!m || !m[2]) return { ok: false, input: token, error: `"${token}" is not a scale-degree number (1–7)` };
  const degree = Number(m[2]) - 1;
  const alteration = accidentalValue(m[1]);
  const rawSuffix = m[3] ?? '';
  let suffix: string;
  if (rawSuffix === '' || !EXPLICIT_QUALITY_RE.test(rawSuffix)) {
    const triad = alteration === 0 ? diatonicTriad(degree, key) : 'major';
    const ext = /^(7|9|11|13)/.exec(rawSuffix);
    if (triad === 'minor') suffix = 'm' + rawSuffix;
    else if (triad === 'diminished') suffix = ext ? 'm' + rawSuffix.replace(/^(7|9|11|13)/, '$1b5') : dimMark(style) + rawSuffix;
    else suffix = rawSuffix;
  } else if (rawSuffix === 'M') {
    suffix = '';
  } else if (rawSuffix.startsWith('dom')) {
    suffix = rawSuffix.slice(3);
  } else {
    suffix = rawSuffix.replace(/^-/, 'm');
  }
  if (!parseSuffix(suffix)) return { ok: false, input: token, error: `Unsupported quality "${rawSuffix}" in "${token}"` };
  const root = spellInKey(degreePc(degree, alteration, key), key);
  let bassText = '';
  if (m[5]) {
    const bassPc = degreePc(Number(m[5]) - 1, accidentalValue(m[4]), key);
    bassText = '/' + formatNoteName(spellInKey(bassPc, key), style);
  }
  return { ok: true, input: token, chord: formatNoteName(root, style) + suffix + bassText };
}

/** Splits "1-5-6m-4", "1 5 6 4", "1 | 4 | 5" into tokens, keeping "2-" (minor) intact. */
export function tokenizeNumbers(progression: string): string[] {
  return progression
    .split(/[\s,|]+/)
    .flatMap((t) => t.split(/-(?=[b#♭♯]?[1-7])/))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export interface ProgressionConversion {
  tokens: NumberTokenResult[];
  chords: string[];
  errors: string[];
}

export function numbersToChords(progression: string, key: Key, style: AccidentalStyle = 'unicode'): ProgressionConversion {
  const tokens = tokenizeNumbers(progression).map((t) => numberToChord(t, key, style));
  return {
    tokens,
    chords: tokens.map((t) => (t.ok ? t.chord : t.input)),
    errors: tokens.flatMap((t) => (t.ok ? [] : [t.error])),
  };
}

function degreeLabel(pc: PitchClass, key: Key, style: AccidentalStyle): { label: string; degree: number; altered: boolean } {
  const { degree, alteration } = degreeOf(pc, key);
  return { label: formatAccidental(alteration, style) + String(degree + 1), degree, altered: alteration !== 0 };
}

function dimMark(style: AccidentalStyle): string {
  return style === 'unicode' ? '°' : 'dim';
}

/**
 * Converts a parsed chord into number notation relative to `key`.
 * The output always parses back (via numberToChord) to the same chord:
 * a major-quality chord on a degree whose diatonic triad is not major is
 * marked "M" (major triad) or "dom" (dominant seventh), e.g. E in A minor = "5M".
 */
export function chordToNumber(chord: Chord, key: Key, style: AccidentalStyle = 'unicode'): string {
  const root = degreeLabel(noteNameToPc(chord.root), key, style);
  const q = chord.quality;
  const defaultTriad = root.altered ? 'major' : diatonicTriad(root.degree, key);
  let suffix = chord.suffix;
  if (q.triad === 'minor' && q.seventh === 'none' && /^(min|mi|-)$/.test(suffix)) suffix = 'm';
  if (q.triad === 'diminished' && q.seventh === 'none' && /^(dim|o|°)$/.test(suffix)) suffix = dimMark(style);
  if (q.triad === 'major' && defaultTriad !== 'major' && !EXPLICIT_QUALITY_RE.test(suffix)) {
    suffix = q.seventh === 'dominant' ? 'dom' + suffix : 'M' + suffix;
  }
  const bass = chord.bass ? '/' + degreeLabel(noteNameToPc(chord.bass), key, style).label : '';
  return root.label + suffix + bass;
}

export type ChordToNumberResult = { ok: true; input: string; number: string } | { ok: false; input: string; error: string };

export function chordSymbolToNumber(symbol: string, key: Key, style: AccidentalStyle = 'unicode'): ChordToNumberResult {
  const parsed = parseChord(symbol);
  if (!parsed.ok) return { ok: false, input: symbol, error: parsed.error };
  return { ok: true, input: symbol, number: chordToNumber(parsed.chord, key, style) };
}

/** Diatonic chord for each degree, e.g. C major → ["C","Dm","Em","F","G","Am","B°"]. */
export function diatonicChords(key: Key, style: AccidentalStyle = 'unicode'): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const root = formatNoteName(spellInKey(degreePc(d, 0, key), key), style);
    const triad = diatonicTriad(d, key);
    return root + (triad === 'minor' ? 'm' : triad === 'diminished' ? dimMark(style) : '');
  });
}
