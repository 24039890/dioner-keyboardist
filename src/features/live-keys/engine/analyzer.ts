/**
 * Live analysis pipeline: capture buffers in, analysis snapshots out.
 *
 *   PCM buffer → mono float32 → signal quality → resample to 16 kHz → ring buffer
 *   every hop: YIN pitch (current note) + FFT chroma (harmony) → KeyTracker
 *
 * Pure TypeScript. The React hook feeds it buffers from expo-audio's
 * useAudioStream; tests feed it synthetic fixtures.
 */
import { midiToNoteLabel } from '../../music-theory/pitch';
import { ChromaExtractor } from './chroma';
import { type KeyReading, type KeyTrackerOptions, KeyTracker } from './keyEstimator';
import { type PcmEncoding, SampleRing, StreamingResampler, removeDc, toMonoFloat32 } from './preprocess';
import { type SignalQuality, assessSignal, evidenceWeight } from './signalQuality';
import { detectPitchYin, nearestNote } from './yin';

export const ANALYSIS_SAMPLE_RATE = 16000;

export interface DetectedPitch {
  frequency: number;
  midi: number;
  cents: number;
  label: string;
  confidence: number;
}

export type PitchTrend = 'rising' | 'falling' | 'steady' | 'none';

export interface AnalysisSnapshot {
  /** Seconds since the stream started. */
  time: number;
  signal: SignalQuality;
  /** Current pitch, only when the estimate is reliable. */
  pitch: DetectedPitch | null;
  /** Most recent distinct reliable notes, oldest first. */
  recentNotes: string[];
  trend: PitchTrend;
  key: KeyReading;
  /** Wall-clock milliseconds spent analysing this hop. */
  processingMs: number;
}

export interface AnalyzerOptions {
  /** Analysis hop in seconds (target update interval). */
  hopSeconds: number;
  /** YIN window length in samples at 16 kHz. */
  pitchFrameSize: number;
  /** FFT size for chroma at 16 kHz. */
  fftSize: number;
  /** Minimum YIN confidence for a pitch to be shown. */
  minPitchConfidence: number;
  tracker: Partial<KeyTrackerOptions>;
}

export const DEFAULT_ANALYZER_OPTIONS: AnalyzerOptions = {
  hopSeconds: 0.15,
  pitchFrameSize: 1024,
  fftSize: 4096,
  minPitchConfidence: 0.85,
  tracker: {},
};

const now = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

export interface PcmBuffer {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

export class LiveAnalyzer {
  private readonly opts: AnalyzerOptions;
  private resampler: StreamingResampler | null = null;
  private readonly ring: SampleRing;
  private readonly chroma: ChromaExtractor;
  private readonly tracker: KeyTracker;
  private samplesSinceHop = 0;
  private readonly hopSamples: number;
  private time = 0;
  private recent: string[] = [];
  private pitchHistory: { time: number; midi: number }[] = [];
  private blockQuality: SignalQuality | null = null;

  constructor(options: Partial<AnalyzerOptions> = {}) {
    this.opts = { ...DEFAULT_ANALYZER_OPTIONS, ...options };
    this.ring = new SampleRing(this.opts.fftSize);
    this.chroma = new ChromaExtractor(this.opts.fftSize, ANALYSIS_SAMPLE_RATE);
    this.tracker = new KeyTracker(this.opts.tracker);
    this.hopSamples = Math.round(this.opts.hopSeconds * ANALYSIS_SAMPLE_RATE);
  }

  /** Feeds a raw capture buffer. Returns zero or more snapshots (one per completed hop). */
  pushBuffer(buffer: PcmBuffer, encoding: PcmEncoding = 'float32'): AnalysisSnapshot[] {
    const mono = toMonoFloat32(buffer.data, buffer.channels, encoding);
    return this.pushSamples(mono, buffer.sampleRate);
  }

  /** Feeds mono float32 samples at `sampleRate`. */
  pushSamples(samples: Float32Array, sampleRate: number): AnalysisSnapshot[] {
    if (!this.resampler || this.resampler.inputRate !== sampleRate) {
      this.resampler = new StreamingResampler(sampleRate, ANALYSIS_SAMPLE_RATE);
    }
    // Quality is judged on the raw input so clipping is visible before filtering.
    this.blockQuality = assessSignal(samples);
    const resampled = this.resampler.process(samples);
    const snapshots: AnalysisSnapshot[] = [];
    let offset = 0;
    while (offset < resampled.length) {
      const take = Math.min(this.hopSamples - this.samplesSinceHop, resampled.length - offset);
      this.ring.push(resampled.subarray(offset, offset + take));
      offset += take;
      this.samplesSinceHop += take;
      this.time += take / ANALYSIS_SAMPLE_RATE;
      if (this.samplesSinceHop >= this.hopSamples) {
        this.samplesSinceHop = 0;
        snapshots.push(this.analyzeHop());
      }
    }
    return snapshots;
  }

  private analyzeHop(): AnalysisSnapshot {
    const start = now();
    const fullFrame = removeDc(this.ring.latest(this.opts.fftSize));
    const pitchFrame = fullFrame.subarray(Math.max(0, fullFrame.length - this.opts.pitchFrameSize));
    const frameQuality = assessSignal(pitchFrame);
    // Use the worse of the raw block and the analysis frame for gating.
    const raw = this.blockQuality;
    const signal: SignalQuality =
      raw && raw.status === 'clipping' && frameQuality.status !== 'silent'
        ? { ...frameQuality, status: 'clipping', clippingRatio: raw.clippingRatio, peak: raw.peak }
        : frameQuality;
    const weight = evidenceWeight(signal.status);

    let pitch: DetectedPitch | null = null;
    let chroma: Float64Array | null = null;
    if (weight > 0 && fullFrame.length >= this.opts.pitchFrameSize) {
      const est = detectPitchYin(pitchFrame, ANALYSIS_SAMPLE_RATE);
      if (est && est.confidence >= this.opts.minPitchConfidence) {
        const { midi, cents } = nearestNote(est.frequency);
        pitch = { frequency: est.frequency, midi, cents, label: midiToNoteLabel(midi), confidence: est.confidence };
      }
      if (fullFrame.length >= this.opts.fftSize) chroma = this.chroma.compute(fullFrame);
    }

    // Combine harmonic (chroma) and melodic (reliable pitch) evidence.
    let evidence: Float64Array | null = chroma ? Float64Array.from(chroma) : null;
    if (pitch) {
      evidence = evidence ?? new Float64Array(12);
      const pc = ((pitch.midi % 12) + 12) % 12;
      for (let i = 0; i < 12; i++) evidence[i] = (evidence[i] as number) * 0.6;
      evidence[pc] = (evidence[pc] as number) + 0.4;
    }
    const key = this.tracker.update(evidence, evidence ? weight : 0, this.time);

    this.trackPitch(pitch);
    return {
      time: this.time,
      signal,
      pitch,
      recentNotes: [...this.recent],
      trend: this.computeTrend(),
      key,
      processingMs: now() - start,
    };
  }

  private trackPitch(pitch: DetectedPitch | null): void {
    if (!pitch) return;
    if (this.recent[this.recent.length - 1] !== pitch.label) {
      this.recent.push(pitch.label);
      if (this.recent.length > 6) this.recent.shift();
    }
    this.pitchHistory.push({ time: this.time, midi: pitch.midi + pitch.cents / 100 });
    while (this.pitchHistory.length > 0 && this.time - (this.pitchHistory[0]?.time ?? 0) > 2) this.pitchHistory.shift();
  }

  private computeTrend(): PitchTrend {
    const h = this.pitchHistory;
    if (h.length < 4) return 'none';
    const mid = Math.floor(h.length / 2);
    const avg = (xs: { midi: number }[]) => xs.reduce((s, x) => s + x.midi, 0) / xs.length;
    const delta = avg(h.slice(mid)) - avg(h.slice(0, mid));
    if (delta > 0.75) return 'rising';
    if (delta < -0.75) return 'falling';
    return 'steady';
  }

  reset(): void {
    this.resampler?.reset();
    this.ring.clear();
    this.tracker.reset();
    this.samplesSinceHop = 0;
    this.time = 0;
    this.recent = [];
    this.pitchHistory = [];
    this.blockQuality = null;
  }
}
