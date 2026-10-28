import { type Key, parseKey } from '@/features/music-theory';
import { formatSemitones, planTranspose } from '@/features/live-keys/transposePlan';

const K = (s: string): Key => parseKey(s)!;

describe('play-in-your-key transpose plan', () => {
  test('you play in C, the song is in D → +2, chords map across', () => {
    const p = planTranspose(K('C'), K('D'));
    expect(p.semitones).toBe(2);
    expect(p.alternative).toBe(-10);
    expect(p.relativeNote).toBeNull();
    expect(p.chords.map((c) => `${c.from}→${c.to}`)).toEqual(['C→D', 'F→G', 'G→A', 'Am→Bm']);
  });

  test('negative direction is chosen when shorter', () => {
    expect(planTranspose(K('C'), K('A')).semitones).toBe(-3);
    expect(planTranspose(K('G'), K('F')).semitones).toBe(-2);
    expect(planTranspose(K('C'), K('F#')).semitones).toBe(6);
  });

  test('same key needs no transpose', () => {
    const p = planTranspose(K('Eb'), K('Eb'));
    expect(p.semitones).toBe(0);
    expect(p.alternative).toBeNull();
  });

  test('major/minor mismatch uses the relative key', () => {
    const p = planTranspose(K('C'), K('Bm')); // B minor = D major family
    expect(p.target).toEqual(K('D'));
    expect(p.semitones).toBe(2);
    expect(p.relativeNote).toMatch(/B Minor uses the same notes as D Major/);
    const m = planTranspose(K('Am'), K('E')); // E major → C♯ minor
    expect(m.target).toEqual(K('C#m'));
    expect(m.semitones).toBe(4);
    expect(m.chords[0]).toEqual({ degree: '1', from: 'Am', to: 'C♯m' });
  });

  test('formatting', () => {
    expect(formatSemitones(2)).toBe('+2');
    expect(formatSemitones(-3)).toBe('−3');
    expect(formatSemitones(0)).toBe('0');
  });
});
