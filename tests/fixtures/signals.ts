/**
 * Deterministic synthetic audio fixtures.
 *
 * Generation process (documented so expected values are reproducible):
 * - Each note is a sum of harmonics 1..4 with amplitudes 1, 0.5, 0.33, 0.25
 *   (a simple voice/organ-like timbre), multiplied by a 10 ms linear
 *   attack/release envelope to avoid clicks.
 * - Frequencies use 12-TET with A4 = 440 Hz, optionally detuned in cents.
 * - Noise is uniform white noise from a seeded xorshift32 PRNG, so every run is identical.
 * - Clipping hard-limits the mixed signal to ±clip.
 * - No recordings of real voices are used; results on these fixtures are not
 *   evidence of real-microphone accuracy.
 */

export interface NoteEvent {
  midi: number;
  start: number; // seconds
  duration: number; // seconds
  amplitude?: number;
}

export interface SynthOptions {
  sampleRate?: number;
  detuneCents?: number;
  noiseAmplitude?: number;
  seed?: number;
  clip?: number;
  harmonics?: number[];
  /** Overall gain applied before noise/clipping. */
  gain?: number;
}

export function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function synth(notes: NoteEvent[], totalSeconds: number, options: SynthOptions = {}): Float32Array {
  const sr = options.sampleRate ?? 16000;
  const harmonics = options.harmonics ?? [1, 0.5, 0.33, 0.25];
  const gain = options.gain ?? 0.25;
  const out = new Float32Array(Math.round(totalSeconds * sr));
  const ramp = Math.round(0.01 * sr);
  for (const n of notes) {
    const f0 = 440 * Math.pow(2, (n.midi - 69 + (options.detuneCents ?? 0) / 100) / 12);
    const startIdx = Math.round(n.start * sr);
    const len = Math.round(n.duration * sr);
    const amp = n.amplitude ?? 1;
    const omegas: number[] = [];
    const weights: number[] = [];
    harmonics.forEach((h, k) => {
      if (f0 * (k + 1) < sr / 2) {
        omegas.push((2 * Math.PI * f0 * (k + 1)) / sr);
        weights.push(h);
      }
    });
    const end = Math.min(len, out.length - startIdx);
    for (let i = 0; i < end; i++) {
      const env = Math.min(1, i / ramp, (len - i) / ramp);
      let v = 0;
      for (let k = 0; k < omegas.length; k++) v += (weights[k] as number) * Math.sin((omegas[k] as number) * i);
      out[startIdx + i] = (out[startIdx + i] as number) + v * amp * env * gain;
    }
  }
  if (options.noiseAmplitude) {
    const rand = xorshift(options.seed ?? 12345);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (rand() * 2 - 1) * options.noiseAmplitude;
  }
  if (options.clip !== undefined) {
    const c = options.clip;
    for (let i = 0; i < out.length; i++) out[i] = Math.max(-c, Math.min(c, out[i] as number)) / c;
  }
  return out;
}

/** Sequential melody: [midi, beats] pairs at `bpm`, starting at `offset` seconds. */
export function melody(pairs: [number, number][], bpm = 100, offset = 0, amplitude = 1): NoteEvent[] {
  const beat = 60 / bpm;
  let t = offset;
  return pairs.map(([midi, beats]) => {
    const ev = { midi, start: t, duration: beats * beat * 0.95, amplitude };
    t += beats * beat;
    return ev;
  });
}

/** Block chords: each chord is a list of MIDI notes held for `beats`. */
export function chords(progression: number[][], beats: number, bpm = 100, offset = 0, amplitude = 0.35): NoteEvent[] {
  const beat = 60 / bpm;
  const events: NoteEvent[] = [];
  progression.forEach((chord, i) => {
    for (const midi of chord) {
      events.push({ midi, start: offset + i * beats * beat, duration: beats * beat * 0.98, amplitude });
    }
  });
  return events;
}

export function durationOf(notes: NoteEvent[]): number {
  return notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
}

export function transposeEvents(notes: NoteEvent[], semitones: number): NoteEvent[] {
  return notes.map((n) => ({ ...n, midi: n.midi + semitones }));
}

export function shiftEvents(notes: NoteEvent[], seconds: number): NoteEvent[] {
  return notes.map((n) => ({ ...n, start: n.start + seconds }));
}

/** A tonal C-major tune emphasising the tonic triad (original, not a real song). */
export const C_MAJOR_TUNE: [number, number][] = [
  [60, 1],
  [64, 1],
  [67, 2],
  [65, 1],
  [64, 1],
  [62, 2],
  [60, 1],
  [62, 1],
  [64, 1],
  [65, 1],
  [67, 2],
  [67, 2],
  [69, 1],
  [67, 1],
  [65, 1],
  [64, 1],
  [62, 2],
  [71, 1],
  [72, 3],
  [67, 1],
  [64, 1],
  [60, 2],
  [62, 1],
  [59, 1],
  [60, 4],
];

/** A tonal A-minor tune (original): emphasises A, C, E with a G♯ leading tone. */
export const A_MINOR_TUNE: [number, number][] = [
  [57, 1],
  [60, 1],
  [64, 2],
  [62, 1],
  [60, 1],
  [59, 2],
  [57, 1],
  [59, 1],
  [60, 1],
  [62, 1],
  [64, 2],
  [64, 2],
  [65, 1],
  [64, 1],
  [62, 1],
  [60, 1],
  [59, 2],
  [56, 1],
  [57, 3],
  [64, 1],
  [60, 1],
  [57, 2],
  [59, 1],
  [56, 1],
  [57, 4],
];

/** I–IV–V–I in C (root position, mid register). */
export const C_PROGRESSION = [
  [48, 52, 55],
  [53, 57, 60],
  [55, 59, 62],
  [48, 52, 55],
];

/** i–iv–V–i in A minor. */
export const AM_PROGRESSION = [
  [45, 48, 52],
  [50, 53, 57],
  [52, 56, 59],
  [45, 48, 52],
];
