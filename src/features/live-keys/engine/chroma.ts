/**
 * FFT-based chroma (pitch-class energy) features.
 *
 * A monophonic pitch tracker cannot see accompaniment harmony, so key
 * evidence comes primarily from a 12-bin chroma vector computed from the
 * magnitude spectrum between 100 Hz and 2 kHz.
 */

/** In-place iterative radix-2 complex FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k] as number;
        const aIm = im[i + k] as number;
        const bRe0 = re[i + k + half] as number;
        const bIm0 = im[i + k + half] as number;
        const bRe = bRe0 * curRe - bIm0 * curIm;
        const bIm = bRe0 * curIm + bIm0 * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + half] = aRe - bRe;
        im[i + k + half] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export interface ChromaOptions {
  minFrequency?: number;
  maxFrequency?: number;
}

/**
 * Reusable chroma extractor with precomputed Hann window and bin→pitch-class map.
 */
export class ChromaExtractor {
  private readonly window: Float64Array;
  private readonly binPc: Int8Array;
  private readonly binWeight: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(
    readonly fftSize: number,
    readonly sampleRate: number,
    options: ChromaOptions = {},
  ) {
    const minF = options.minFrequency ?? 100;
    const maxF = options.maxFrequency ?? 2000;
    this.window = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
    const bins = fftSize / 2;
    this.binPc = new Int8Array(bins).fill(-1);
    this.binWeight = new Float64Array(bins);
    for (let b = 1; b < bins; b++) {
      const f = (b * sampleRate) / fftSize;
      if (f < minF || f > maxF) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      const nearest = Math.round(midi);
      const centsOff = Math.abs(midi - nearest);
      // Bins near a semitone centre count fully; bins between notes are discounted.
      this.binPc[b] = ((nearest % 12) + 12) % 12;
      this.binWeight[b] = Math.max(0, 1 - centsOff / 0.5);
    }
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
  }

  /** Returns a chroma vector normalised to sum 1, or null if there is no tonal energy. */
  compute(frame: Float32Array): Float64Array | null {
    const n = this.fftSize;
    const offset = Math.max(0, frame.length - n);
    for (let i = 0; i < n; i++) {
      const s = i + offset < frame.length ? (frame[i + offset] as number) : 0;
      this.re[i] = s * (this.window[i] as number);
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    const bins = n / 2;
    const mags = new Float64Array(bins);
    for (let b = 0; b < bins; b++) mags[b] = Math.hypot(this.re[b] as number, this.im[b] as number);

    // Spectral whitening: keep only energy that stands above the local median-ish floor
    // (local mean over ±12 bins), so broadband noise contributes little.
    const chroma = new Float64Array(12);
    const radius = 12;
    const prefix = new Float64Array(bins + 1);
    for (let b = 0; b < bins; b++) prefix[b + 1] = (prefix[b] as number) + (mags[b] as number);
    for (let b = 1; b < bins - 1; b++) {
      const pc = this.binPc[b] as number;
      if (pc < 0) continue;
      const m = mags[b] as number;
      // Local peaks only.
      if (m < (mags[b - 1] as number) || m < (mags[b + 1] as number)) continue;
      const lo = Math.max(0, b - radius);
      const hi = Math.min(bins, b + radius + 1);
      const localMean = ((prefix[hi] as number) - (prefix[lo] as number)) / (hi - lo);
      const excess = m - 2 * localMean;
      if (excess <= 0) continue;
      chroma[pc] = (chroma[pc] as number) + excess * (this.binWeight[b] as number);
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += chroma[i] as number;
    if (sum <= 1e-9) return null;
    for (let i = 0; i < 12; i++) chroma[i] = (chroma[i] as number) / sum;
    return chroma;
  }
}
