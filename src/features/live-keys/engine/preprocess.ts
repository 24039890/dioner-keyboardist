/**
 * Buffer conversion and resampling. No React or Expo imports.
 */

export type PcmEncoding = 'float32' | 'int16';

/** Converts an interleaved PCM buffer to mono float32 in −1..1. */
export function toMonoFloat32(data: ArrayBuffer, channels: number, encoding: PcmEncoding): Float32Array {
  const ch = Math.max(1, Math.floor(channels));
  if (encoding === 'float32') {
    const src = new Float32Array(data, 0, Math.floor(data.byteLength / 4));
    if (ch === 1) return new Float32Array(src);
    const out = new Float32Array(Math.floor(src.length / ch));
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (let c = 0; c < ch; c++) sum += src[i * ch + c] as number;
      out[i] = sum / ch;
    }
    return out;
  }
  const src = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
  const out = new Float32Array(Math.floor(src.length / ch));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let c = 0; c < ch; c++) sum += src[i * ch + c] as number;
    out[i] = sum / ch / 32768;
  }
  return out;
}

/** Subtracts the mean (removes DC offset). Returns a new array. */
export function removeDc(frame: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < frame.length; i++) mean += frame[i] as number;
  mean /= frame.length || 1;
  const out = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) out[i] = (frame[i] as number) - mean;
  return out;
}

/**
 * Streaming resampler: moving-average low-pass (width ≈ decimation ratio)
 * followed by linear interpolation. Adequate for pitch/chroma analysis below
 * 2 kHz; not intended for audio playback quality.
 */
export class StreamingResampler {
  private readonly ratio: number;
  private readonly boxWidth: number;
  private history: number[] = [];
  private boxSum = 0;
  private position = 0; // fractional input index of next output sample, relative to `prev`
  private prev = 0;
  private started = false;

  constructor(
    readonly inputRate: number,
    readonly outputRate: number,
  ) {
    if (!(inputRate > 0) || !(outputRate > 0)) throw new Error('Sample rates must be positive');
    this.ratio = inputRate / outputRate;
    this.boxWidth = Math.max(1, Math.floor(this.ratio));
  }

  process(input: Float32Array): Float32Array {
    if (this.ratio === 1) return new Float32Array(input);
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      // Low-pass with a running box filter.
      const x = input[i] as number;
      this.history.push(x);
      this.boxSum += x;
      if (this.history.length > this.boxWidth) this.boxSum -= this.history.shift() as number;
      const filtered = this.boxSum / this.history.length;
      if (!this.started) {
        this.prev = filtered;
        this.started = true;
        out.push(filtered);
        this.position = this.ratio;
        continue;
      }
      // Emit outputs that fall between prev (index 0) and filtered (index 1).
      while (this.position <= 1) {
        out.push(this.prev + (filtered - this.prev) * this.position);
        this.position += this.ratio;
      }
      this.position -= 1;
      this.prev = filtered;
    }
    return Float32Array.from(out);
  }

  reset(): void {
    this.history = [];
    this.boxSum = 0;
    this.position = 0;
    this.prev = 0;
    this.started = false;
  }
}

/** Fixed-capacity ring buffer that keeps the most recent samples. */
export class SampleRing {
  private readonly data: Float32Array;
  private writeIndex = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity);
  }

  push(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.data[this.writeIndex] = samples[i] as number;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }
    this.filled = Math.min(this.capacity, this.filled + samples.length);
  }

  get length(): number {
    return this.filled;
  }

  /** Copies the latest `n` samples in chronological order. */
  latest(n: number): Float32Array {
    const count = Math.min(n, this.filled);
    const out = new Float32Array(count);
    let idx = (this.writeIndex - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.data[idx] as number;
      idx = (idx + 1) % this.capacity;
    }
    return out;
  }

  clear(): void {
    this.data.fill(0);
    this.writeIndex = 0;
    this.filled = 0;
  }
}
