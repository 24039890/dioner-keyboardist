/**
 * Chord-symbol parsing, formatting and transposition.
 *
 * A chord symbol is root + suffix + optional slash bass. Transposition moves the
 * root and bass independently and keeps the user's suffix text exactly, so
 * "Bbmaj7/D" up 2 becomes "Cmaj7/E" with the suffix untouched. Symbols that
 * cannot be parsed are never rewritten; a structured error is returned instead.
 */
import { type Key, spellInKey } from './keys';
import { type AccidentalStyle, type NoteName, type PitchClass, formatNoteName, mod12, noteNameToPc, parseNoteName } from './pitch';

export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4' | 'power' | 'half-diminished';

export type Seventh = 'none' | 'dominant' | 'major' | 'minor' | 'diminished';

export interface ParsedSuffix {
  triad: TriadQuality;
  seventh: Seventh;
  /** Highest extension number (6, 9, 11, 13) when present. */
  extension: number | null;
  /** Additions and alterations such as "add9", "b9", "#11". */
  alterations: string[];
}

export interface Chord {
  root: NoteName;
  /** Suffix exactly as written by the user, e.g. "maj7", "m7b5", "sus4". */
  suffix: string;
  quality: ParsedSuffix;
  bass: NoteName | null;
}

export type ChordParseResult = { ok: true; chord: Chord } | { ok: false; input: string; error: string };

const SYMBOL_RE = /^([A-G](?:##|bb|#|♯|b|♭)?)([^/]*)(?:\/([A-G](?:#|♯|b|♭)?))?$/;

const ALTERATION_RE = /^\(?((?:add|no)(?:2|4|9|11|13|3|5)|[b#♭♯](?:5|9|11|13))\)?/;

/**
 * Parses a chord suffix. Returns null for unsupported text so callers can
 * report an error instead of guessing.
 */
export function parseSuffix(input: string): ParsedSuffix | null {
  let s = input;
  let triad: TriadQuality = 'major';
  let seventh: Seventh = 'none';
  let extension: number | null = null;
  let majorSeventhMarker = false;
  let minorMajor = false;

  const take = (re: RegExp): string | null => {
    const m = re.exec(s);
    if (!m) return null;
    s = s.slice(m[0].length);
    return m[0];
  };

  if (take(/^(mMaj|mmaj|mM|minMaj|-Maj|-maj|m\(maj|mΔ)/)) {
    triad = 'minor';
    minorMajor = true;
    take(/^\)/);
  } else if (take(/^(maj|Maj|MA|M|Δ)/)) {
    majorSeventhMarker = true;
  } else if (take(/^(min|mi|m|-)/)) {
    triad = 'minor';
  } else if (take(/^(dim|°|o)/)) {
    triad = 'diminished';
  } else if (take(/^(aug|\+)/)) {
    triad = 'augmented';
  } else if (take(/^ø/)) {
    triad = 'half-diminished';
    seventh = 'minor';
  }

  const ext = take(/^(13|11|9|7|69|6|5)/);
  if (ext === '5') {
    if (triad !== 'major' || majorSeventhMarker) return null;
    triad = 'power';
  } else if (ext === '6' || ext === '69') {
    extension = ext === '69' ? 9 : 6;
  } else if (ext) {
    const n = Number(ext);
    if (n >= 9) extension = n;
    if (minorMajor || majorSeventhMarker) seventh = 'major';
    else if (triad === 'minor') seventh = 'minor';
    else if (triad === 'diminished') seventh = 'diminished';
    else if (triad === 'half-diminished') seventh = 'minor';
    else seventh = 'dominant';
  } else if (minorMajor) {
    seventh = 'major';
  } else if (majorSeventhMarker && s.length > 0 && !/^(sus|add|\(|[b#♭♯])/.test(s)) {
    return null;
  }

  const sus = take(/^(sus2|sus4|sus)/);
  if (sus) {
    if (triad !== 'major') return null;
    triad = sus === 'sus2' ? 'sus2' : 'sus4';
  }

  const alterations: string[] = [];
  for (;;) {
    const alt = take(ALTERATION_RE);
    if (!alt) break;
    alterations.push(alt.replace(/[()]/g, ''));
  }

  if (s.length > 0) return null;
  // "m7b5" is the common spelling of a half-diminished chord.
  if (triad === 'minor' && seventh === 'minor' && alterations.some((a) => /^[b♭]5$/.test(a))) {
    triad = 'half-diminished';
  }
  return { triad, seventh, extension, alterations };
}

export function parseChord(input: string): ChordParseResult {
  const text = input.trim();
  const m = SYMBOL_RE.exec(text);
  if (!m || !m[1]) return { ok: false, input, error: `"${input}" is not a recognised chord symbol` };
  const root = parseNoteName(m[1]);
  if (!root) return { ok: false, input, error: `Invalid chord root in "${input}"` };
  const suffix = m[2] ?? '';
  const quality = parseSuffix(suffix);
  if (!quality) return { ok: false, input, error: `Unsupported chord suffix "${suffix}" in "${input}"` };
  let bass: NoteName | null = null;
  if (m[3]) {
    bass = parseNoteName(m[3]);
    if (!bass) return { ok: false, input, error: `Invalid bass note in "${input}"` };
  }
  return { ok: true, chord: { root, suffix, quality, bass } };
}

export function formatChord(chord: Chord, style: AccidentalStyle = 'unicode'): string {
  const bass = chord.bass ? `/${formatNoteName(chord.bass, style)}` : '';
  return formatNoteName(chord.root, style) + chord.suffix + bass;
}

/**
 * Transposes a parsed chord. Root and bass are moved independently and
 * respelled for the target key. The suffix is preserved verbatim.
 */
export function transposeChord(chord: Chord, semitones: number, targetKey: Key): Chord {
  const root = spellInKey(mod12(noteNameToPc(chord.root) + semitones), targetKey);
  const bass = chord.bass ? spellInKey(mod12(noteNameToPc(chord.bass) + semitones), targetKey) : null;
  return { ...chord, root, bass };
}

export type SymbolTransposeResult = { ok: true; text: string } | { ok: false; text: string; error: string };

/** Transposes one chord symbol. On failure, returns the original text unchanged with an error. */
export function transposeChordSymbol(
  symbol: string,
  semitones: number,
  targetKey: Key,
  style: AccidentalStyle = 'unicode',
): SymbolTransposeResult {
  const parsed = parseChord(symbol);
  if (!parsed.ok) return { ok: false, text: symbol, error: parsed.error };
  return { ok: true, text: formatChord(transposeChord(parsed.chord, semitones, targetKey), style) };
}

/** Semitone intervals above the root for the chord's core tones (no bass). */
export function chordIntervals(q: ParsedSuffix): number[] {
  const triad: Record<TriadQuality, number[]> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
    augmented: [0, 4, 8],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    power: [0, 7],
    'half-diminished': [0, 3, 6],
  };
  const tones = [...triad[q.triad]];
  const seventh: Record<Seventh, number | null> = {
    none: null,
    dominant: 10,
    major: 11,
    minor: 10,
    diminished: 9,
  };
  const s = seventh[q.seventh];
  if (s !== null) tones.push(s);
  if (q.extension === 6) tones.push(9);
  if (q.extension !== null && q.extension >= 9) tones.push(14);
  if (q.extension !== null && q.extension >= 11) tones.push(17);
  if (q.extension === 13) tones.push(21);
  for (const alt of q.alterations) {
    const m = /^(add|no)?([b#♭♯])?(\d+)$/.exec(alt);
    if (!m) continue;
    const degreeSemis: Record<string, number> = { '2': 2, '3': 4, '4': 5, '5': 7, '9': 14, '11': 17, '13': 21 };
    const base = degreeSemis[m[3] ?? ''];
    if (base === undefined) continue;
    const shift = m[2] === 'b' || m[2] === '♭' ? -1 : m[2] ? 1 : 0;
    if (m[1] === 'no') {
      const idx = tones.indexOf(base);
      if (idx >= 0) tones.splice(idx, 1);
      continue;
    }
    if (!m[1] && m[3] === '5') {
      // Altered fifth replaces the natural fifth.
      const idx = tones.indexOf(7);
      if (idx >= 0) tones.splice(idx, 1);
    }
    tones.push(base + shift);
  }
  return tones;
}

/** Pitch classes sounded by a chord, including a slash bass. */
export function chordPitchClasses(chord: Chord): PitchClass[] {
  const root = noteNameToPc(chord.root);
  const pcs = chordIntervals(chord.quality).map((i) => mod12(root + i));
  if (chord.bass) pcs.unshift(noteNameToPc(chord.bass));
  return Array.from(new Set(pcs));
}

/** Plain-language name used in lessons: "D major", "B minor seventh". */
export function describeChord(chord: Chord, style: AccidentalStyle = 'unicode'): string {
  const root = formatNoteName(chord.root, style);
  const q = chord.quality;
  const triadWord: Record<TriadQuality, string> = {
    major: 'major',
    minor: 'minor',
    diminished: 'diminished',
    augmented: 'augmented',
    sus2: 'suspended second',
    sus4: 'suspended fourth',
    power: 'power chord',
    'half-diminished': 'half-diminished',
  };
  let name = `${root} ${triadWord[q.triad]}`;
  if (q.triad === 'half-diminished') name = `${root} half-diminished seventh`;
  else if (q.seventh === 'dominant') name = `${root} dominant seventh`;
  else if (q.seventh === 'major') name = `${root} ${q.triad === 'minor' ? 'minor-major' : 'major'} seventh`;
  else if (q.seventh === 'minor') name = `${root} minor seventh`;
  else if (q.seventh === 'diminished') name = `${root} diminished seventh`;
  if (chord.bass) name += ` over ${formatNoteName(chord.bass, style)}`;
  return name;
}
