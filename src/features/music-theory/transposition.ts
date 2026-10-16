/**
 * Key-to-key transposition of chord lines and progressions.
 */
import { transposeChordSymbol } from './chords';
import { type Key, keyLabel } from './keys';
import { type AccidentalStyle, mod12, signedOffset } from './pitch';

/** Keeps a user-stepped offset in −11..+11; ±12 wraps to 0 (same key). */
export function normalizeOffset(semitones: number): number {
  const n = Math.trunc(semitones) % 12;
  return Object.is(n, -0) ? 0 : n;
}

export function stepOffset(current: number, delta: number): number {
  return normalizeOffset(current + delta);
}

export function targetKey(original: Key, semitones: number): Key {
  return { tonic: mod12(original.tonic + semitones), mode: original.mode };
}

/** Signed shortest offset between keys' tonics, in −5..+6. */
export function offsetBetweenKeys(from: Key, to: Key): number {
  return signedOffset(from.tonic, to.tonic);
}

export function formatOffset(semitones: number): string {
  if (semitones === 0) return '0';
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`;
}

/** Tokens that may appear in a chord line but are not chords; kept verbatim. */
const PASSTHROUGH_RE = /^(\|+|:?\|\|?:?|%|\/|-|–|N\.?C\.?|\(?x\d+\)?|\(|\)|\.+|,)$/i;

export interface LineToken {
  text: string;
  kind: 'space' | 'symbol' | 'chord' | 'error';
  error?: string;
}

export interface LineTransposeResult {
  text: string;
  tokens: LineToken[];
  errors: string[];
}

/**
 * Transposes every chord in a chart line such as "C | G/B | Am7 | Fmaj7".
 * Whitespace and bar symbols are preserved. Tokens that are not valid chords
 * are left unchanged and reported in `errors`.
 */
export function transposeLine(line: string, semitones: number, target: Key, style: AccidentalStyle = 'unicode'): LineTransposeResult {
  const parts = line.split(/(\s+|\|)/).filter((p) => p.length > 0);
  const tokens: LineToken[] = parts.map((part) => {
    if (/^\s+$/.test(part)) return { text: part, kind: 'space' };
    if (PASSTHROUGH_RE.test(part)) return { text: part, kind: 'symbol' };
    const r = transposeChordSymbol(part, semitones, target, style);
    return r.ok ? { text: r.text, kind: 'chord' } : { text: part, kind: 'error', error: r.error };
  });
  return {
    text: tokens.map((t) => t.text).join(''),
    tokens,
    errors: tokens.flatMap((t) => (t.error ? [t.error] : [])),
  };
}

/** Plain-language explanation for the transposition screen. */
export function explainTransposition(original: Key, semitones: number): string {
  if (semitones === 0) return `Playing in the original key, ${keyLabel(original)}.`;
  const direction = semitones > 0 ? 'up' : 'down';
  const n = Math.abs(semitones);
  return `Every chord moves ${direction} ${n} semitone${n === 1 ? '' : 's'}, from ${keyLabel(original)} to ${keyLabel(targetKey(original, semitones))}. The chord qualities stay the same, so the progression sounds identical, only higher or lower.`;
}
