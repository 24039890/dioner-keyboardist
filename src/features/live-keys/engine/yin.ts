/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002):
 * difference function → cumulative mean normalised difference (CMND) →
 * absolute threshold → parabolic interpolation.
 *
 * Confidence is 1 − CMND(τ) at the chosen lag, so periodic signals approach 1
 * and noise approaches 0.
 */

export interface YinOptions {
  minFrequency?: number;
  maxFrequency?: number;
  /** CMND threshold; lower is stricter. */
  threshold?: number;
}

export interface PitchEstimate {
  frequency: number;
  confidence: number;
}

export function detectPitchYin(frame: Float32Array, sampleRate: number, options: YinOptions = {}): PitchEstimate | null {
  const minF = options.minFrequency ?? 65;
  const maxF = options.maxFrequency ?? 1100;
  const threshold = options.threshold ?? 0.15;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxF));
  const tauMax = Math.min(Math.floor(frame.length / 2), Math.ceil(sampleRate / minF));
  if (tauMax <= tauMin + 2) return null;

  const window = frame.length - tauMax;
  const diff = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const d = (frame[i] as number) - (frame[i + tau] as number);
      sum += d * d;
    }
    diff[tau] = sum;
  }

  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau] as number;
    cmnd[tau] = running > 0 ? ((diff[tau] as number) * tau) / running : 1;
  }

  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if ((cmnd[tau] as number) < threshold) {
      while (tau + 1 <= tauMax && (cmnd[tau + 1] as number) < (cmnd[tau] as number)) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate < 0) return null;

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let betterTau = tauEstimate;
  if (tauEstimate > 1 && tauEstimate < tauMax) {
    const s0 = cmnd[tauEstimate - 1] as number;
    const s1 = cmnd[tauEstimate] as number;
    const s2 = cmnd[tauEstimate + 1] as number;
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }
  const frequency = sampleRate / betterTau;
  if (frequency < minF || frequency > maxF) return null;
  return { frequency, confidence: Math.max(0, Math.min(1, 1 - (cmnd[tauEstimate] as number))) };
}

/** Frequency → fractional MIDI note number (A4 = 440 Hz = 69). */
export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Nearest MIDI note and the deviation from it in cents (−50..+50). */
export function nearestNote(frequency: number): { midi: number; cents: number } {
  const exact = frequencyToMidi(frequency);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}
