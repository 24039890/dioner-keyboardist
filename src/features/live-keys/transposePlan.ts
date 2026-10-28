/**
 * "Play in your key": how far a keyboardist who plays in `playKey` must
 * transpose to sound in the song's key.
 *
 * If the modes differ (you play in C major, the song is in B minor), the song
 * key is converted to its relative key in your mode (B minor → D major), since
 * those share the same notes and chords.
 */
import { type Key, diatonicChords, keyLabel, offsetBetweenKeys, relativeKey } from '../music-theory';

export interface ChordMapping {
  degree: string;
  from: string;
  to: string;
}

export interface TransposePlan {
  playKey: Key;
  songKey: Key;
  /** The song key expressed in the keyboardist's mode (equal to songKey when modes match). */
  target: Key;
  /** Signed shortest transpose amount, −5..+6. 0 means no transpose needed. */
  semitones: number;
  /** The same transpose the other way round (e.g. +2 ↔ −10), for keyboards with a ±12 range. */
  alternative: number | null;
  /** Explains a major/minor conversion, or null. */
  relativeNote: string | null;
  chords: ChordMapping[];
}

/** The four chords keyboardists use most: 1, 4, 5 and 6 of the key. */
const DEGREES = [
  { index: 0, label: '1' },
  { index: 3, label: '4' },
  { index: 4, label: '5' },
  { index: 5, label: '6' },
];

export function planTranspose(playKey: Key, songKey: Key): TransposePlan {
  const target = playKey.mode === songKey.mode ? songKey : relativeKey(songKey);
  const semitones = offsetBetweenKeys(playKey, target);
  const from = diatonicChords(playKey);
  const to = diatonicChords(target);
  return {
    playKey,
    songKey,
    target,
    semitones,
    alternative: semitones === 0 ? null : semitones > 0 ? semitones - 12 : semitones + 12,
    relativeNote:
      target === songKey
        ? null
        : `${keyLabel(songKey)} uses the same notes as ${keyLabel(target)}, so it is treated as ${keyLabel(target)}.`,
    chords: DEGREES.map((d) => ({ degree: d.label, from: from[d.index] ?? '', to: to[d.index] ?? '' })),
  };
}

export function formatSemitones(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}
