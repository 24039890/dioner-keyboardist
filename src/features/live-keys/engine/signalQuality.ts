/**
 * Signal-quality assessment for one block of input.
 */

export type SignalStatus = 'silent' | 'weak' | 'clipping' | 'ok';

export interface SignalQuality {
  rms: number;
  /** RMS in dBFS (−∞ for digital silence, clamped to −120). */
  rmsDb: number;
  peak: number;
  /** Fraction of samples at or above the clipping threshold. */
  clippingRatio: number;
  status: SignalStatus;
  /** 0..1 display level mapped from −60..0 dBFS. */
  level: number;
}

export const SILENCE_DB = -55;
export const WEAK_DB = -42;
export const CLIP_THRESHOLD = 0.98;
export const CLIP_RATIO_LIMIT = 0.01;

export function assessSignal(samples: Float32Array): SignalQuality {
  let sumSq = 0;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] as number;
    const a = Math.abs(v);
    sumSq += v * v;
    if (a > peak) peak = a;
    if (a >= CLIP_THRESHOLD) clipped++;
  }
  const n = samples.length || 1;
  const rms = Math.sqrt(sumSq / n);
  const rmsDb = rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
  const clippingRatio = clipped / n;
  let status: SignalStatus = 'ok';
  if (rmsDb < SILENCE_DB) status = 'silent';
  else if (clippingRatio > CLIP_RATIO_LIMIT) status = 'clipping';
  else if (rmsDb < WEAK_DB) status = 'weak';
  const level = Math.min(1, Math.max(0, (rmsDb + 60) / 60));
  return { rms, rmsDb, peak, clippingRatio, status, level };
}

/** How much a frame of this quality should count as musical evidence. */
export function evidenceWeight(status: SignalStatus): number {
  switch (status) {
    case 'ok':
      return 1;
    case 'clipping':
      return 0.5; // harmonics are distorted; keep some evidence
    case 'weak':
      return 0.35;
    case 'silent':
      return 0;
  }
}
