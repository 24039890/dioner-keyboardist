import {
  type Key,
  allKeys,
  chordIntervals,
  chordPitchClasses,
  chordSymbolToNumber,
  decodeKey,
  describeChord,
  diatonicChords,
  encodeKey,
  formatChord,
  formatNoteName,
  keyLabel,
  keySignature,
  midiToNoteLabel,
  mod12,
  normalizeOffset,
  noteNameToPc,
  numberToChord,
  numbersToChords,
  offsetBetweenKeys,
  parseChord,
  parseKey,
  parseNoteName,
  relativeKey,
  scaleNotes,
  signedOffset,
  spellInKey,
  stepOffset,
  targetKey,
  tokenizeNumbers,
  transposeChordSymbol,
  transposeLine,
} from '@/features/music-theory';

const K = (text: string): Key => {
  const k = parseKey(text);
  if (!k) throw new Error(`bad key ${text}`);
  return k;
};
const names = (key: Key) =>
  scaleNotes(key)
    .map((n) => formatNoteName(n, 'ascii'))
    .join(' ');

describe('pitch classes', () => {
  test('mod12 handles negatives and large values', () => {
    expect(mod12(-1)).toBe(11);
    expect(mod12(-13)).toBe(11);
    expect(mod12(25)).toBe(1);
  });

  test('all 12 sharp and flat note names map to the right pitch class', () => {
    const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flats = ['C', 'Db', 'D', 'Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb'];
    sharps.forEach((n, pc) => expect(noteNameToPc(parseNoteName(n)!)).toBe(pc));
    flats.forEach((n, pc) => expect(noteNameToPc(parseNoteName(n)!)).toBe(pc));
  });

  test('unicode accidentals, E#, B#, double accidentals', () => {
    expect(noteNameToPc(parseNoteName('F♯')!)).toBe(6);
    expect(noteNameToPc(parseNoteName('B♭')!)).toBe(10);
    expect(noteNameToPc(parseNoteName('E#')!)).toBe(5);
    expect(noteNameToPc(parseNoteName('B#')!)).toBe(0);
    expect(noteNameToPc(parseNoteName('Fx')!)).toBe(7);
    expect(noteNameToPc(parseNoteName('Ebb')!)).toBe(2);
  });

  test('invalid note names are rejected', () => {
    expect(parseNoteName('H')).toBeNull();
    expect(parseNoteName('C###')).toBeNull();
    expect(parseNoteName('')).toBeNull();
  });

  test('signed offsets follow the spec examples', () => {
    expect(signedOffset(6, 8)).toBe(2); // F# -> G#
    expect(signedOffset(8, 6)).toBe(-2); // G# -> F#
    expect(signedOffset(0, 11)).toBe(-1);
    expect(signedOffset(11, 0)).toBe(1);
    expect(signedOffset(0, 6)).toBe(6);
  });

  test('every pair of pitch classes round-trips through a signed offset', () => {
    for (let a = 0; a < 12; a++) {
      for (let b = 0; b < 12; b++) {
        const d = signedOffset(a, b);
        expect(d).toBeGreaterThanOrEqual(-5);
        expect(d).toBeLessThanOrEqual(6);
        expect(mod12(a + d)).toBe(b);
      }
    }
  });

  test('MIDI labels', () => {
    expect(midiToNoteLabel(69, false, 'ascii')).toBe('A4');
    expect(midiToNoteLabel(60, false, 'ascii')).toBe('C4');
    expect(midiToNoteLabel(61, true, 'ascii')).toBe('Db4');
    expect(midiToNoteLabel(21, false, 'ascii')).toBe('A0');
  });
});

describe('keys and scales', () => {
  test('major scales are spelled letter by letter', () => {
    expect(names(K('C'))).toBe('C D E F G A B');
    expect(names(K('D'))).toBe('D E F# G A B C#');
    expect(names(K('F#'))).toBe('F# G# A# B C# D# E#');
    expect(names(K('Bb'))).toBe('Bb C D Eb F G A');
    expect(names(K('Db'))).toBe('Db Eb F Gb Ab Bb C');
    expect(names(K('B'))).toBe('B C# D# E F# G# A#');
  });

  test('natural minor scales', () => {
    expect(names(K('Am'))).toBe('A B C D E F G');
    expect(names(K('Ebm'))).toBe('Eb F Gb Ab Bb Cb Db');
    expect(names(K('G#m'))).toBe('G# A# B C# D# E F#');
    expect(names(K('Cm'))).toBe('C D Eb F G Ab Bb');
  });

  test('every one of the 24 keys has seven distinct letters and the right pitch classes', () => {
    for (const key of allKeys()) {
      const notes = scaleNotes(key);
      expect(new Set(notes.map((n) => n.letter)).size).toBe(7);
      expect(noteNameToPc(notes[0]!)).toBe(key.tonic);
      notes.forEach((n) => expect(Math.abs(n.accidental)).toBeLessThanOrEqual(1));
    }
  });

  test('key signatures', () => {
    expect(keySignature(K('C'))).toBe(0);
    expect(keySignature(K('G'))).toBe(1);
    expect(keySignature(K('F'))).toBe(-1);
    expect(keySignature(K('F#'))).toBe(6);
    expect(keySignature(K('Db'))).toBe(-5);
    expect(keySignature(K('Am'))).toBe(0);
    expect(keySignature(K('Ebm'))).toBe(-6);
    expect(keySignature(K('Bm'))).toBe(2);
  });

  test('labels', () => {
    expect(keyLabel(K('F#'))).toBe('F♯ Major');
    expect(keyLabel(K('Bb'))).toBe('B♭ Major');
    expect(keyLabel(K('Am'))).toBe('A Minor');
    expect(keyLabel({ tonic: 6, mode: 'major' }, 'ascii')).toBe('F# Major');
  });

  test('parseKey accepts several forms', () => {
    expect(parseKey('A minor')).toEqual({ tonic: 9, mode: 'minor' });
    expect(parseKey('Bb major')).toEqual({ tonic: 10, mode: 'major' });
    expect(parseKey('C♯m')).toEqual({ tonic: 1, mode: 'minor' });
    expect(parseKey('X major')).toBeNull();
  });

  test('relative keys and storage encoding', () => {
    expect(relativeKey(K('C'))).toEqual(K('Am'));
    expect(relativeKey(K('F#m'))).toEqual(K('A'));
    for (const key of allKeys()) expect(decodeKey(encodeKey(key))).toEqual(key);
    expect(decodeKey('12:major')).toBeNull();
    expect(decodeKey('3:lydian')).toBeNull();
    expect(decodeKey(null)).toBeNull();
  });

  test('non-diatonic notes are spelled as altered degrees', () => {
    const f = (pc: number, key: string) => formatNoteName(spellInKey(pc, K(key)), 'ascii');
    expect(f(10, 'C')).toBe('Bb'); // b7
    expect(f(6, 'C')).toBe('F#'); // #4
    expect(f(3, 'C')).toBe('Eb'); // b3
    expect(f(8, 'Am')).toBe('G#'); // raised 7th in A minor
    // Raised 7th in G# minor would be F𝄪; the simpler G is used.
    expect(f(7, 'G#m')).toBe('G');
  });
});

describe('chord parsing', () => {
  const ok = (s: string) => {
    const r = parseChord(s);
    if (!r.ok) throw new Error(r.error);
    return r.chord;
  };

  test.each([
    ['C', 'major', 'none'],
    ['Am', 'minor', 'none'],
    ['Dmaj7', 'major', 'major'],
    ['G7', 'major', 'dominant'],
    ['Bm7', 'minor', 'minor'],
    ['F#dim', 'diminished', 'none'],
    ['Bdim7', 'diminished', 'diminished'],
    ['Caug', 'augmented', 'none'],
    ['C+', 'augmented', 'none'],
    ['Gsus4', 'sus4', 'none'],
    ['Dsus2', 'sus2', 'none'],
    ['A7sus4', 'sus4', 'dominant'],
    ['Bm7b5', 'half-diminished', 'minor'],
    ['Bø7', 'half-diminished', 'minor'],
    ['CmMaj7', 'minor', 'major'],
    ['E5', 'power', 'none'],
    ['Cmin7', 'minor', 'minor'],
    ['C-7', 'minor', 'minor'],
    ['CΔ7', 'major', 'major'],
  ])('%s → triad %s, seventh %s', (symbol, triad, seventh) => {
    const c = ok(symbol);
    expect(c.quality.triad).toBe(triad);
    expect(c.quality.seventh).toBe(seventh);
  });

  test('extensions and alterations', () => {
    expect(ok('Cmaj9').quality).toMatchObject({ seventh: 'major', extension: 9 });
    expect(ok('G13').quality).toMatchObject({ seventh: 'dominant', extension: 13 });
    expect(ok('Am11').quality).toMatchObject({ seventh: 'minor', extension: 11 });
    expect(ok('C6').quality.extension).toBe(6);
    expect(ok('Cadd9').quality.alterations).toEqual(['add9']);
    expect(ok('G7(b9)').quality.alterations).toEqual(['b9']);
    expect(ok('C7#11').quality.alterations).toEqual(['#11']);
  });

  test('slash chords keep a separate bass', () => {
    const c = ok('C/E');
    expect(formatNoteName(c.bass!, 'ascii')).toBe('E');
    expect(ok('Bbmaj7/D').suffix).toBe('maj7');
  });

  test('invalid and unsupported symbols return structured errors', () => {
    for (const s of ['H7', 'Cxyz', 'C/H', '', 'maj7', 'C7/', 'Cm5', 'Csus4m']) {
      const r = parseChord(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });

  test('chord tones', () => {
    expect(chordPitchClasses(ok('C'))).toEqual([0, 4, 7]);
    expect(chordPitchClasses(ok('Am'))).toEqual([9, 0, 4]);
    expect(chordPitchClasses(ok('G7'))).toEqual([7, 11, 2, 5]);
    expect(chordPitchClasses(ok('Dmaj7'))).toEqual([2, 6, 9, 1]);
    expect(chordPitchClasses(ok('Bm7b5'))).toEqual([11, 2, 5, 9]);
    expect(chordPitchClasses(ok('C/E'))).toEqual([4, 0, 7]);
    expect(chordIntervals(ok('C7b5').quality)).toEqual([0, 4, 10, 6]);
  });

  test('descriptions', () => {
    expect(describeChord(ok('D'))).toBe('D major');
    expect(describeChord(ok('Bm7'))).toBe('B minor seventh');
    expect(describeChord(ok('G7'))).toBe('G dominant seventh');
    expect(describeChord(ok('C/E'))).toBe('C major over E');
  });
});

describe('chord transposition', () => {
  const t = (symbol: string, semis: number, key: string) => {
    const r = transposeChordSymbol(symbol, semis, K(key), 'ascii');
    if (!r.ok) throw new Error(r.error);
    return r.text;
  };

  test('spec example: C | G | Am | F up 2 to D major', () => {
    expect(transposeLine('C | G | Am | F', 2, K('D'), 'ascii').text).toBe('D | A | Bm | G');
  });

  test('qualities and suffixes are preserved', () => {
    expect(t('Dmaj7', 2, 'E')).toBe('Emaj7');
    expect(t('Bm7b5', 1, 'C')).toBe('Cm7b5');
    expect(t('Gsus4', -2, 'F')).toBe('Fsus4');
    expect(t('A7sus4', 3, 'C')).toBe('C7sus4');
    expect(t('Cadd9', 5, 'F')).toBe('Fadd9');
  });

  test('slash bass moves independently of the root', () => {
    expect(t('C/E', 2, 'D')).toBe('D/F#');
    expect(t('G/B', -2, 'F')).toBe('F/A');
    expect(t('Bbmaj7/D', 2, 'C')).toBe('Cmaj7/E');
    expect(t('Am/G', 3, 'Cm')).toBe('Cm/Bb');
  });

  test('negative offsets', () => {
    expect(transposeLine('D A Bm G', -2, K('C'), 'ascii').text).toBe('C G Am F');
    expect(t('F#', -2, 'E')).toBe('E');
    expect(t('G#m', -2, 'F#m')).toBe('F#m');
  });

  test('spelling follows the target key', () => {
    expect(t('C', 1, 'Db')).toBe('Db');
    expect(t('C', 6, 'F#')).toBe('F#');
    expect(t('G', 3, 'Bb')).toBe('Bb');
    expect(t('E', 3, 'Eb')).toBe('G');
    expect(t('Bb', 2, 'D')).toBe('C'); // b7 of D stays as C, not B#
  });

  test('every chord in all 12 starting keys returns to itself after +n then −n', () => {
    const progression = 'C G/B Am7 Fmaj7 Dm7 G7sus4 Bdim Esus2';
    for (let start = 0; start < 12; start++) {
      const startKey: Key = { tonic: start, mode: 'major' };
      const fromC = transposeLine(progression, start, startKey, 'ascii');
      expect(fromC.errors).toEqual([]);
      for (let n = -11; n <= 11; n++) {
        const up = transposeLine(fromC.text, n, targetKey(startKey, n), 'ascii');
        const back = transposeLine(up.text, -n, startKey, 'ascii');
        expect(back.text).toBe(fromC.text);
      }
    }
  });

  test('unparseable tokens are preserved and reported, symbols kept', () => {
    const r = transposeLine('C | Qx7 | G N.C. (x2) %', 2, K('D'), 'ascii');
    expect(r.text).toBe('D | Qx7 | A N.C. (x2) %');
    expect(r.errors).toHaveLength(1);
    expect(r.tokens.find((tok) => tok.kind === 'error')?.text).toBe('Qx7');
  });

  test('original-key restoration and offsets', () => {
    expect(normalizeOffset(12)).toBe(0);
    expect(normalizeOffset(-12)).toBe(0);
    expect(stepOffset(11, 1)).toBe(0);
    expect(stepOffset(-11, -1)).toBe(0);
    expect(stepOffset(0, -1)).toBe(-1);
    expect(targetKey(K('C'), 2)).toEqual(K('D'));
    expect(targetKey(K('C'), -1)).toEqual(K('B'));
    expect(offsetBetweenKeys(K('F#'), K('G#'))).toBe(2);
    expect(offsetBetweenKeys(K('G#'), K('F#'))).toBe(-2);
    expect(transposeLine('C G Am F', 0, K('C'), 'ascii').text).toBe('C G Am F');
  });

  test('formatChord keeps the user suffix verbatim', () => {
    const r = parseChord('Cmin7');
    expect(r.ok && formatChord(r.chord, 'ascii')).toBe('Cmin7');
  });
});

describe('number system', () => {
  const conv = (prog: string, key: string) => numbersToChords(prog, K(key), 'ascii').chords.join(' ');

  test('spec examples', () => {
    expect(conv('1-5-6-4', 'C')).toBe('C G Am F');
    expect(conv('1-5-6-4', 'D')).toBe('D A Bm G');
    expect(conv('1-4-5-1', 'G')).toBe('G C D G');
    expect(conv('6-4-1-5', 'Eb')).toBe('Cm Ab Eb Bb');
  });

  test('diatonic chords in every major and minor key', () => {
    expect(diatonicChords(K('C'), 'ascii')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(diatonicChords(K('Am'), 'ascii')).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(diatonicChords(K('F#'), 'ascii')).toEqual(['F#', 'G#m', 'A#m', 'B', 'C#', 'D#m', 'E#dim']);
  });

  test('minor-key convention: 1 is the minor tonic', () => {
    expect(conv('1 4 5 1', 'Am')).toBe('Am Dm Em Am');
    expect(conv('1 6 3 7', 'Em')).toBe('Em C G D');
  });

  test('accidentals, explicit qualities, sevenths and slash bass', () => {
    expect(conv('b7', 'C')).toBe('Bb');
    expect(conv('4m', 'C')).toBe('Fm');
    expect(conv('2-', 'C')).toBe('Dm');
    expect(conv('57', 'C')).toBe('G7');
    expect(conv('27', 'C')).toBe('Dm7');
    expect(conv('77', 'C')).toBe('Bm7b5');
    expect(conv('4maj7', 'C')).toBe('Fmaj7');
    expect(conv('5sus4', 'C')).toBe('Gsus4');
    expect(conv('1/3', 'C')).toBe('C/E');
    expect(conv('5/7', 'D')).toBe('A/C#');
    expect(conv('5M', 'Am')).toBe('E');
    expect(conv('5dom7', 'Am')).toBe('E7');
  });

  test('tokenizer keeps the minor dash but splits progressions', () => {
    expect(tokenizeNumbers('1-5-6-4')).toEqual(['1', '5', '6', '4']);
    expect(tokenizeNumbers('2--5-1')).toEqual(['2-', '5', '1']);
    expect(tokenizeNumbers('1 | 4, 5')).toEqual(['1', '4', '5']);
  });

  test('invalid numbers are reported, not guessed', () => {
    const r = numbersToChords('1 8 5 x', K('C'), 'ascii');
    expect(r.errors).toHaveLength(2);
    expect(r.chords).toEqual(['C', '8', 'G', 'x']);
    expect(numberToChord('0', K('C')).ok).toBe(false);
  });

  test('chords → numbers', () => {
    const n = (s: string, key: string) => {
      const r = chordSymbolToNumber(s, K(key), 'ascii');
      if (!r.ok) throw new Error(r.error);
      return r.number;
    };
    expect(n('C', 'C')).toBe('1');
    expect(n('Am', 'C')).toBe('6m');
    expect(n('G7', 'C')).toBe('57');
    expect(n('Bb', 'C')).toBe('b7');
    expect(n('C/E', 'C')).toBe('1/3');
    expect(n('Bm', 'D')).toBe('6m');
    expect(n('E', 'Am')).toBe('5M');
    expect(n('E7', 'Am')).toBe('5dom7');
    expect(chordSymbolToNumber('Hm', K('C')).ok).toBe(false);
  });

  test('chord → number → chord round-trips in all 24 keys', () => {
    const chords = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'dim', 'add9'];
    for (const key of allKeys()) {
      for (let pc = 0; pc < 12; pc++) {
        for (const suffix of chords) {
          const symbol = formatNoteName(spellInKey(pc, key), 'ascii') + suffix;
          const num = chordSymbolToNumber(symbol, key, 'ascii');
          expect(num.ok).toBe(true);
          if (!num.ok) continue;
          const back = numberToChord(num.number, key, 'ascii');
          expect(back.ok).toBe(true);
          if (!back.ok) continue;
          const a = parseChord(symbol);
          const b = parseChord(back.chord);
          expect(a.ok && b.ok).toBe(true);
          if (a.ok && b.ok) expect(chordPitchClasses(b.chord)).toEqual(chordPitchClasses(a.chord));
        }
      }
    }
  });
});
