/**
 * Offline tests of the live-analysis engine on synthetic fixtures
 * (see tests/fixtures/signals.ts for how they are generated).
 * These do NOT exercise a physical microphone.
 */
import { keyLabel, sameKey, type Key } from '@/features/music-theory';
import { type AnalysisSnapshot, LiveAnalyzer } from '@/features/live-keys/engine/analyzer';
import { ChromaExtractor } from '@/features/live-keys/engine/chroma';
import { estimateKey, scoreKeys } from '@/features/live-keys/engine/keyEstimator';
import { MidiKeyAnalyzer } from '@/features/live-keys/engine/midiEvidence';
import { StreamingResampler, toMonoFloat32 } from '@/features/live-keys/engine/preprocess';
import { assessSignal } from '@/features/live-keys/engine/signalQuality';
import { detectPitchYin, nearestNote } from '@/features/live-keys/engine/yin';
import {
  AM_PROGRESSION,
  A_MINOR_TUNE,
  C_MAJOR_TUNE,
  C_PROGRESSION,
  type NoteEvent,
  type SynthOptions,
  chords,
  durationOf,
  melody,
  shiftEvents,
  synth,
  transposeEvents,
} from '../fixtures/signals';

const C_MAJOR: Key = { tonic: 0, mode: 'major' };
const A_MINOR: Key = { tonic: 9, mode: 'minor' };

function run(samples: Float32Array, sampleRate = 16000, chunk = 1024): AnalysisSnapshot[] {
  const analyzer = new LiveAnalyzer();
  const snaps: AnalysisSnapshot[] = [];
  for (let i = 0; i < samples.length; i += chunk) {
    snaps.push(...analyzer.pushSamples(samples.subarray(i, i + chunk), sampleRate));
  }
  return snaps;
}

function last<T>(xs: T[]): T {
  const v = xs[xs.length - 1];
  if (v === undefined) throw new Error('empty');
  return v;
}

/** Tune + accompaniment, repeated `times`. */
function song(tune: [number, number][], progression: number[][], times = 2, semitones = 0): NoteEvent[] {
  const one = [...melody(tune, 100), ...chords(progression, 4, 100), ...chords(progression, 4, 100, (16 * 60) / 100)];
  const len = Math.max(durationOf(one), (32 * 60) / 100);
  let all: NoteEvent[] = [];
  for (let i = 0; i < times; i++) all = all.concat(shiftEvents(one, i * len));
  return transposeEvents(all, semitones);
}

function render(events: NoteEvent[], options: SynthOptions = {}): Float32Array {
  return synth(events, durationOf(events) + 0.5, options);
}

describe('signal quality', () => {
  test('silence, weak, clipping and normal input are distinguished', () => {
    expect(assessSignal(new Float32Array(2048)).status).toBe('silent');
    const tone = synth([{ midi: 69, start: 0, duration: 1 }], 1);
    expect(assessSignal(tone.subarray(1000, 3048)).status).toBe('ok');
    const weak = synth([{ midi: 69, start: 0, duration: 1 }], 1, { gain: 0.006 });
    expect(assessSignal(weak.subarray(1000, 3048)).status).toBe('weak');
    const clipped = synth([{ midi: 69, start: 0, duration: 1 }], 1, { gain: 0.9, clip: 0.3 });
    expect(assessSignal(clipped.subarray(1000, 3048)).status).toBe('clipping');
  });

  test('PCM conversion: int16 stereo → mono float', () => {
    const int16 = new Int16Array([16384, -16384, 32767, 32767]);
    const mono = toMonoFloat32(int16.buffer, 2, 'int16');
    expect(mono.length).toBe(2);
    expect(mono[0]).toBeCloseTo(0, 5);
    expect(mono[1]).toBeCloseTo(32767 / 32768, 4);
  });
});

describe('YIN pitch estimation', () => {
  test.each([45, 52, 57, 60, 64, 69, 72, 76, 81, 84])('detects MIDI %i across octaves', (midi) => {
    const s = synth([{ midi, start: 0, duration: 0.5 }], 0.5);
    const est = detectPitchYin(s.subarray(1600, 1600 + 1024), 16000);
    expect(est).not.toBeNull();
    const n = nearestNote(est!.frequency);
    expect(n.midi).toBe(midi);
    expect(Math.abs(n.cents)).toBeLessThanOrEqual(5);
    expect(est!.confidence).toBeGreaterThan(0.9);
  });

  test('out-of-tune singing is reported with a cents offset', () => {
    const s = synth([{ midi: 67, start: 0, duration: 0.5 }], 0.5, { detuneCents: 30 });
    const est = detectPitchYin(s.subarray(1600, 2624), 16000)!;
    const n = nearestNote(est.frequency);
    expect(n.midi).toBe(67);
    expect(n.cents).toBeGreaterThanOrEqual(25);
    expect(n.cents).toBeLessThanOrEqual(35);
  });

  test('white noise does not produce a confident pitch', () => {
    const noise = synth([], 0.2, { noiseAmplitude: 0.3, seed: 7 });
    const est = detectPitchYin(noise.subarray(0, 1024), 16000);
    expect(est === null || est.confidence < 0.85).toBe(true);
  });

  test('48 kHz input is resampled to 16 kHz without moving the pitch', () => {
    const s48 = synth([{ midi: 69, start: 0, duration: 0.5 }], 0.5, { sampleRate: 48000 });
    const r = new StreamingResampler(48000, 16000);
    const out = Float32Array.from([...r.process(s48.subarray(0, 12000)), ...r.process(s48.subarray(12000))]);
    expect(Math.abs(out.length - 8000)).toBeLessThanOrEqual(2);
    const n = nearestNote(detectPitchYin(out.subarray(2000, 3024), 16000)!.frequency);
    expect(n.midi).toBe(69);
    expect(Math.abs(n.cents)).toBeLessThanOrEqual(5);
  });

  test('44.1 kHz (non-integer ratio) resampling keeps pitch', () => {
    const s = synth([{ midi: 64, start: 0, duration: 0.5 }], 0.5, { sampleRate: 44100 });
    const out = new StreamingResampler(44100, 16000).process(s);
    expect(nearestNote(detectPitchYin(out.subarray(2000, 3024), 16000)!.frequency).midi).toBe(64);
  });
});

describe('chroma', () => {
  test('a C major triad concentrates energy on C, E, G', () => {
    const s = synth(chords([[48, 52, 55]], 4), 2);
    const chroma = new ChromaExtractor(4096, 16000).compute(s.subarray(8000, 8000 + 4096))!;
    const top = Array.from(chroma)
      .map((v, pc) => ({ v, pc }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map((x) => x.pc)
      .sort((a, b) => a - b);
    expect(top).toEqual([0, 4, 7]);
  });

  test('silence produces no chroma', () => {
    expect(new ChromaExtractor(4096, 16000).compute(new Float32Array(4096))).toBeNull();
  });
});

describe('key profiles', () => {
  test('ideal diatonic profiles rank their own key first', () => {
    expect(scoreKeys([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1].map((v, i) => v * (i === 0 ? 2 : i === 7 ? 1.5 : 1)))[0]!.key).toEqual(C_MAJOR);
  });

  test('evidence below the threshold is insufficient, never a guess', () => {
    expect(estimateKey([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], 0.5).status).toBe('insufficient');
  });
});

describe('live key estimation on fixtures', () => {
  test('silence stays insufficient', () => {
    const snaps = run(new Float32Array(16000 * 5));
    expect(last(snaps).key.status).toBe('insufficient');
    expect(last(snaps).pitch).toBeNull();
  });

  test('a single sustained note is not reported as a song key', () => {
    const snaps = run(synth([{ midi: 69, start: 0, duration: 8 }], 8));
    const final = last(snaps);
    expect(final.pitch?.label).toBe('A4');
    expect(final.key.status).not.toBe('estimated');
  });

  test('white noise is not reported as a key', () => {
    const snaps = run(synth([], 8, { noiseAmplitude: 0.2, seed: 99 }));
    expect(last(snaps).key.status).not.toBe('estimated');
  });

  test('C major melody alone → C major', () => {
    const notes = [...melody(C_MAJOR_TUNE, 100), ...melody(C_MAJOR_TUNE, 100, (32 * 60) / 100)];
    const final = last(run(render(notes))).key;
    expect(final.status).toBe('estimated');
    expect(final.key).toEqual(C_MAJOR);
  });

  test('A minor melody alone → A minor', () => {
    const notes = [...melody(A_MINOR_TUNE, 100), ...melody(A_MINOR_TUNE, 100, (32 * 60) / 100)];
    const final = last(run(render(notes))).key;
    expect(final.status).toBe('estimated');
    expect(final.key).toEqual(A_MINOR);
  });

  test('melody with accompaniment → C major with at least medium confidence', () => {
    const final = last(run(render(song(C_MAJOR_TUNE, C_PROGRESSION)))).key;
    expect(final.key).toEqual(C_MAJOR);
    expect(['medium', 'high']).toContain(final.level);
  });

  test('minor melody with accompaniment → A minor', () => {
    const final = last(run(render(song(A_MINOR_TUNE, AM_PROGRESSION)))).key;
    expect(final.key).toEqual(A_MINOR);
  });

  test('fixture accuracy across all 24 keys (melody + accompaniment)', () => {
    const results: string[] = [];
    let correct = 0;
    for (const mode of ['major', 'minor'] as const) {
      for (let shift = 0; shift < 12; shift++) {
        const base = mode === 'major' ? song(C_MAJOR_TUNE, C_PROGRESSION, 1, shift) : song(A_MINOR_TUNE, AM_PROGRESSION, 1, shift);
        const expected: Key = { tonic: ((mode === 'major' ? 0 : 9) + shift) % 12, mode };
        const reading = last(run(render(base))).key;
        const ok = sameKey(reading.key, expected);
        if (ok) correct++;
        results.push(
          `${keyLabel(expected, 'ascii')}: ${reading.key ? keyLabel(reading.key, 'ascii') : reading.status}${ok ? '' : '  <-- MISS'}`,
        );
      }
    }
    // Reported in docs/TESTING.md. Synthetic fixtures only.
    console.log(`Fixture key accuracy: ${correct}/24\n${results.join('\n')}`);
    expect(correct).toBeGreaterThanOrEqual(22);
  });

  test('noisy input (SNR ≈ 10 dB) still finds C major', () => {
    const final = last(run(render(song(C_MAJOR_TUNE, C_PROGRESSION), { noiseAmplitude: 0.08, seed: 3 }))).key;
    expect(final.key).toEqual(C_MAJOR);
  });

  test('clipped input is flagged and still finds C major', () => {
    const snaps = run(render(song(C_MAJOR_TUNE, C_PROGRESSION), { gain: 0.6, clip: 0.25 }));
    expect(snaps.some((s) => s.signal.status === 'clipping')).toBe(true);
    expect(last(snaps).key.key).toEqual(C_MAJOR);
  });

  test('weak input is flagged and never yields a wrong key', () => {
    const snaps = run(render(song(C_MAJOR_TUNE, C_PROGRESSION), { gain: 0.006 }));
    expect(snaps.some((s) => s.signal.status === 'weak')).toBe(true);
    const final = last(snaps).key;
    expect(final.key === null || sameKey(final.key, C_MAJOR)).toBe(true);
  });

  test('out-of-tune singing (+35 cents) still finds C major', () => {
    const notes = [...melody(C_MAJOR_TUNE, 100), ...melody(C_MAJOR_TUNE, 100, (32 * 60) / 100)];
    expect(last(run(render(notes, { detuneCents: 35 }))).key.key).toEqual(C_MAJOR);
  });

  test('an ambiguous passage (C–D–E–G only) is not reported with high confidence', () => {
    const pairs: [number, number][] = [];
    for (let i = 0; i < 6; i++) pairs.push([60, 1], [62, 1], [64, 1], [67, 1], [64, 1], [62, 1]);
    const final = last(run(render(melody(pairs, 100)))).key;
    expect(final.status !== 'estimated' || final.level !== 'high' || final.relativeAmbiguity).toBe(true);
  });

  test('an evenly played major scale lands in the C major / A minor family', () => {
    const up = [60, 62, 64, 65, 67, 69, 71, 72];
    const pairs: [number, number][] = [];
    for (let i = 0; i < 3; i++) for (const m of [...up, ...up.slice().reverse()]) pairs.push([m, 1]);
    const final = last(run(render(melody(pairs, 120)))).key;
    if (final.key) expect(sameKey(final.key, C_MAJOR) || sameKey(final.key, A_MINOR)).toBe(true);
  });

  test('a modulation from C major to E♭ major is hinted, then confirmed', () => {
    const first = song(C_MAJOR_TUNE, C_PROGRESSION, 1);
    const firstLen = (32 * 60) / 100;
    const second = shiftEvents(song(C_MAJOR_TUNE, C_PROGRESSION, 2, 3), firstLen);
    const snaps = run(render([...first, ...second]));
    const before = snaps.filter((s) => s.time < firstLen);
    expect(last(before).key.key).toEqual(C_MAJOR);
    const eb: Key = { tonic: 3, mode: 'major' };
    const hintIdx = snaps.findIndex((s) => sameKey(s.key.possibleKeyChange, eb));
    const switchIdx = snaps.findIndex((s) => s.time > firstLen && sameKey(s.key.key, eb));
    expect(hintIdx).toBeGreaterThan(-1);
    expect(switchIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeLessThanOrEqual(switchIdx);
    expect(last(snaps).key.key).toEqual(eb);
    console.log(
      `Key change C→Eb: hint after ${(snaps[hintIdx]!.time - firstLen).toFixed(1)} s, confirmed after ${(snaps[switchIdx]!.time - firstLen).toFixed(1)} s`,
    );
  });

  test('update interval and per-hop processing time (Node.js, not a device)', () => {
    const samples = render(song(C_MAJOR_TUNE, C_PROGRESSION));
    const snaps = run(samples);
    const seconds = samples.length / 16000;
    const interval = (seconds / snaps.length) * 1000;
    const times = snaps.map((s) => s.processingMs).sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.log(
      `Update interval ${interval.toFixed(0)} ms; processing mean ${mean.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms (Node ${process.version})`,
    );
    expect(interval).toBeGreaterThanOrEqual(140);
    expect(interval).toBeLessThanOrEqual(160);
  });

  test('recent notes and trend are reported from reliable pitches only', () => {
    const snaps = run(
      render(
        melody(
          [
            [60, 2],
            [62, 2],
            [64, 2],
            [65, 2],
            [67, 2],
          ],
          100,
        ),
      ),
    );
    const final = last(snaps);
    expect(final.recentNotes).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    expect(snaps.some((s) => s.trend === 'rising')).toBe(true);
  });

  test('reset clears all state', () => {
    const analyzer = new LiveAnalyzer();
    const s = render(song(C_MAJOR_TUNE, C_PROGRESSION, 1));
    analyzer.pushSamples(s, 16000);
    analyzer.reset();
    const after = analyzer.pushSamples(new Float32Array(16000), 16000);
    expect(last(after).key.status).toBe('insufficient');
    expect(last(after).recentNotes).toEqual([]);
  });
});

describe('MIDI key evidence', () => {
  test('no input is insufficient', () => {
    const m = new MidiKeyAnalyzer();
    expect(m.tick(0).key.status).toBe('insufficient');
    expect(m.tick(5).key.status).toBe('insufficient');
  });

  test('note-on/off, velocity-0 note-off and held notes', () => {
    const m = new MidiKeyAnalyzer();
    m.handle({ type: 'noteOn', note: 60, velocity: 100, time: 0 });
    m.handle({ type: 'noteOn', note: 64, velocity: 90, time: 0 });
    expect(m.tick(0.1).heldNotes).toEqual(['C4', 'E4']);
    m.handle({ type: 'noteOn', note: 60, velocity: 0, time: 0.2 });
    expect(m.tick(0.3).heldNotes).toEqual(['E4']);
    m.handle({ type: 'noteOff', note: 64, velocity: 0, time: 0.4 });
    expect(m.tick(0.5).heldNotes).toEqual([]);
    m.handle({ type: 'noteOn', note: 200, velocity: 100, time: 0.5 });
    expect(m.tick(0.6).heldNotes).toEqual([]);
  });

  test('a played I–IV–V–I in G gives G major', () => {
    const m = new MidiKeyAnalyzer();
    const prog = [
      [55, 59, 62, 67],
      [60, 64, 67, 72],
      [62, 66, 69, 74],
      [55, 59, 62, 67],
    ];
    let t = 0;
    let reading = m.tick(t);
    for (let rep = 0; rep < 3; rep++) {
      for (const chord of prog) {
        chord.forEach((n) => m.handle({ type: 'noteOn', note: n, velocity: 90, time: t }));
        for (let k = 0; k < 13; k++) {
          t += 0.15;
          reading = m.tick(t);
        }
        chord.forEach((n) => m.handle({ type: 'noteOff', note: n, velocity: 0, time: t }));
      }
    }
    expect(reading.key.key).toEqual({ tonic: 7, mode: 'major' });
  });
});
