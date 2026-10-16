/**
 * Musical-key estimation from accumulated pitch-class evidence.
 *
 * Method: Krumhansl–Kessler key profiles (Krumhansl, 1990) correlated
 * (Pearson) with an exponentially decaying pitch-class histogram. Two windows
 * run in parallel: a long window (stable song key) and a short window (recent
 * passage, used to detect possible key changes).
 *
 * The estimator never infers a key from one note: it reports
 * `insufficient` until enough weighted evidence has accumulated, and
 * `ambiguous` when the best keys are too close to separate.
 */
import { type Key, relativeKey, sameKey } from '../../music-theory/keys';

export const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const;
export const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const;

export interface KeyScore {
  key: Key;
  score: number;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>, rotation: number): number {
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < 12; i++) {
    meanA += a[i] as number;
    meanB += b[i] as number;
  }
  meanA /= 12;
  meanB /= 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = (a[(i + rotation) % 12] as number) - meanA;
    const y = (b[i] as number) - meanB;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/** Correlation of a 12-bin histogram with all 24 keys, best first. */
export function scoreKeys(histogram: ArrayLike<number>): KeyScore[] {
  const scores: KeyScore[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    scores.push({ key: { tonic, mode: 'major' }, score: pearson(histogram, KK_MAJOR, tonic) });
    scores.push({ key: { tonic, mode: 'minor' }, score: pearson(histogram, KK_MINOR, tonic) });
  }
  return scores.sort((x, y) => y.score - x.score);
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type KeyEstimate =
  | { status: 'insufficient'; evidence: number; candidates: KeyScore[] }
  | { status: 'ambiguous'; evidence: number; candidates: KeyScore[]; relativeAmbiguity: boolean }
  | {
      status: 'estimated';
      key: Key;
      score: number;
      margin: number;
      level: ConfidenceLevel;
      relativeAmbiguity: boolean;
      evidence: number;
      candidates: KeyScore[];
    };

export interface EstimateThresholds {
  /** Minimum accumulated evidence weight (≈ seconds of usable signal × weight). */
  minEvidence: number;
  /** Below this correlation the result is ambiguous. */
  minScore: number;
  /** Below this best-vs-second margin the result is ambiguous. */
  minMargin: number;
}

export const DEFAULT_THRESHOLDS: EstimateThresholds = {
  minEvidence: 2.5,
  minScore: 0.5,
  minMargin: 0.02,
};

export function estimateKey(
  histogram: ArrayLike<number>,
  evidence: number,
  thresholds: EstimateThresholds = DEFAULT_THRESHOLDS,
): KeyEstimate {
  const ranked = scoreKeys(histogram);
  const candidates = ranked.slice(0, 3);
  if (evidence < thresholds.minEvidence) return { status: 'insufficient', evidence, candidates };
  const best = ranked[0] as KeyScore;
  const second = ranked[1] as KeyScore;
  const margin = best.score - second.score;
  const relativeAmbiguity = sameKey(second.key, relativeKey(best.key)) && margin < 0.06;
  if (best.score < thresholds.minScore || margin < thresholds.minMargin) {
    return { status: 'ambiguous', evidence, candidates, relativeAmbiguity };
  }
  let level: ConfidenceLevel = 'low';
  if (best.score >= 0.75 && margin >= 0.08) level = 'high';
  else if (best.score >= 0.6 && margin >= 0.04) level = 'medium';
  return {
    status: 'estimated',
    key: best.key,
    score: best.score,
    margin,
    level,
    relativeAmbiguity,
    evidence,
    candidates,
  };
}

/** Correlation by which the recent passage must prefer another key over the displayed one. */
const MISFIT_MARGIN = 0.12;
/** Minimum fit of the new key, and its lead over the old key, before a key change is confirmed. */
const CONFIRM_MIN_SCORE = 0.8;
const CONFIRM_MARGIN = 0.15;

/** Key family = the tonic of the major key sharing its pitch-class set (C major and A minor → 0). */
export function keyFamily(key: Key): number {
  return key.mode === 'major' ? key.tonic : (key.tonic + 3) % 12;
}

/** Exponentially decaying pitch-class histogram. */
export class DecayingHistogram {
  readonly bins = new Float64Array(12);
  evidence = 0;

  constructor(readonly timeConstantSeconds: number) {}

  /** Decays existing evidence by `dt` seconds, then adds `vector × weight`. */
  add(vector: ArrayLike<number>, weight: number, dt: number): void {
    const decay = Math.exp(-Math.max(0, dt) / this.timeConstantSeconds);
    for (let i = 0; i < 12; i++) this.bins[i] = (this.bins[i] as number) * decay + (vector[i] as number) * weight;
    this.evidence = this.evidence * decay + weight * Math.max(0, dt);
  }

  decayOnly(dt: number): void {
    this.add(new Float64Array(12), 0, dt);
  }

  copyFrom(other: DecayingHistogram): void {
    this.bins.set(other.bins);
    this.evidence = other.evidence;
  }

  clear(): void {
    this.bins.fill(0);
    this.evidence = 0;
  }
}

export interface KeyReading {
  /** Overall state of the displayed song key. */
  status: 'insufficient' | 'ambiguous' | 'estimated';
  /** The smoothed, displayed song key (null unless status is 'estimated'). */
  key: Key | null;
  level: ConfidenceLevel | null;
  score: number;
  relativeAmbiguity: boolean;
  candidates: KeyScore[];
  /** A different key that the recent passage strongly suggests but is not yet confirmed. */
  possibleKeyChange: Key | null;
  /** Approximate seconds of usable evidence in the long window. */
  evidence: number;
}

export interface KeyTrackerOptions {
  longTimeConstant: number;
  shortTimeConstant: number;
  /** Seconds a different long-window winner must lead before the display switches. */
  switchAfter: number;
  /** Seconds the short window must disagree before a possible key change is reported. */
  changeHintAfter: number;
  /** Seconds the short window must disagree before the key change is confirmed. */
  changeConfirmAfter: number;
  thresholds: EstimateThresholds;
}

export const DEFAULT_TRACKER_OPTIONS: KeyTrackerOptions = {
  longTimeConstant: 30,
  shortTimeConstant: 5,
  switchAfter: 4,
  changeHintAfter: 2,
  changeConfirmAfter: 10,
  thresholds: DEFAULT_THRESHOLDS,
};

/**
 * Temporal smoothing and key-change detection on top of `estimateKey`.
 */
export class KeyTracker {
  private readonly long: DecayingHistogram;
  private readonly short: DecayingHistogram;
  private displayed: Key | null = null;
  private challenger: Key | null = null;
  private challengerSince = 0;
  private since: DecayingHistogram | null = null;
  private misfitSince = 0;
  private fitSince: number | null = null;
  private lastTime: number | null = null;
  private readonly opts: KeyTrackerOptions;

  constructor(options: Partial<KeyTrackerOptions> = {}) {
    this.opts = { ...DEFAULT_TRACKER_OPTIONS, ...options };
    this.long = new DecayingHistogram(this.opts.longTimeConstant);
    this.short = new DecayingHistogram(this.opts.shortTimeConstant);
  }

  /**
   * Adds evidence observed at `time` (seconds). `vector` should sum to 1;
   * `weight` is 0..1 (signal quality). Pass weight 0 for silence so old
   * evidence still decays.
   */
  update(vector: ArrayLike<number> | null, weight: number, time: number): KeyReading {
    const dt = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    if (vector && weight > 0) {
      this.long.add(vector, weight, dt);
      this.short.add(vector, weight, dt);
    } else {
      this.long.decayOnly(dt);
      this.short.decayOnly(dt);
    }

    if (this.since) {
      if (vector && weight > 0) this.since.add(vector, weight, dt);
      else this.since.decayOnly(dt);
    }

    // 1. Does the displayed key still fit the recent passage (short window)?
    //    If the short window's best key beats the displayed key by a clear margin,
    //    a modulation may be under way. Evidence gathered since that moment is kept
    //    in `since`, so the new key is chosen from whole phrases rather than from a
    //    5-second window that can flip between closely related keys.
    let possibleKeyChange: Key | null = null;
    const shortRanked = this.short.evidence >= this.opts.thresholds.minEvidence * 0.8 ? scoreKeys(this.short.bins) : null;
    const displayedNow = this.displayed;
    const misfit =
      !!displayedNow &&
      !!shortRanked &&
      (shortRanked[0]?.score ?? 0) >= 0.6 &&
      (shortRanked[0]?.score ?? 0) - (shortRanked.find((k) => sameKey(k.key, displayedNow))?.score ?? 0) >= MISFIT_MARGIN &&
      keyFamily(shortRanked[0]!.key) !== keyFamily(displayedNow);
    if (misfit) {
      this.fitSince = null;
      if (!this.since) {
        this.since = new DecayingHistogram(this.opts.longTimeConstant);
        this.since.copyFrom(this.short);
        this.misfitSince = time;
      }
    } else if (this.since) {
      // Tolerate brief moments where the old key fits again (e.g. a shared chord).
      if (this.fitSince === null) this.fitSince = time;
      if (time - this.fitSince >= 2) {
        this.since = null;
        this.fitSince = null;
      }
    }
    if (this.since) {
      const held = time - this.misfitSince;
      const sinceRanked = scoreKeys(this.since.bins);
      const best = sinceRanked[0];
      const candidate = best?.key ?? null;
      if (best && candidate && displayedNow && keyFamily(candidate) !== keyFamily(displayedNow)) {
        const displayedScore = sinceRanked.find((k) => sameKey(k.key, displayedNow))?.score ?? 0;
        // A short excursion (e.g. a phrase resting on the dominant) also fits another key for
        // a few seconds; a real modulation fits the new key strongly and for longer.
        const strong = best.score >= CONFIRM_MIN_SCORE && best.score - displayedScore >= CONFIRM_MARGIN;
        if (held >= this.opts.changeConfirmAfter && strong) {
          // Confirmed modulation: evidence since the change becomes the song-key evidence.
          this.displayed = candidate;
          this.long.copyFrom(this.since);
          this.since = null;
          this.fitSince = null;
          this.challenger = null;
        } else if (held >= this.opts.changeHintAfter) {
          possibleKeyChange = candidate;
        }
      }
    }

    // 2. Long-window smoothing with hysteresis (suspended while a modulation is pending,
    //    because the long window then mixes old and new keys).
    const longEst = estimateKey(this.long.bins, this.long.evidence, this.opts.thresholds);
    if (longEst.status === 'estimated' && !this.since) {
      if (!this.displayed) {
        this.displayed = longEst.key;
        this.challenger = null;
      } else if (!sameKey(longEst.key, this.displayed)) {
        if (!sameKey(this.challenger, longEst.key)) {
          this.challenger = longEst.key;
          this.challengerSince = time;
        } else if (time - this.challengerSince >= this.opts.switchAfter) {
          this.displayed = longEst.key;
          this.challenger = null;
        }
      } else {
        this.challenger = null;
      }
    }

    const final = estimateKey(this.long.bins, this.long.evidence, this.opts.thresholds);
    if (final.status === 'insufficient' && !this.displayed) {
      return {
        status: 'insufficient',
        key: null,
        level: null,
        score: 0,
        relativeAmbiguity: false,
        candidates: final.candidates,
        possibleKeyChange: null,
        evidence: final.evidence,
      };
    }
    if (final.status === 'ambiguous' || !this.displayed) {
      return {
        status: final.status === 'insufficient' ? 'insufficient' : 'ambiguous',
        key: null,
        level: null,
        score: final.candidates[0]?.score ?? 0,
        relativeAmbiguity: final.status === 'ambiguous' ? final.relativeAmbiguity : false,
        candidates: final.candidates,
        possibleKeyChange,
        evidence: final.evidence,
      };
    }
    const displayed = this.displayed;
    const displayedScore = scoreKeys(this.long.bins).find((s) => sameKey(s.key, displayed))?.score ?? 0;
    const level: ConfidenceLevel = final.status === 'estimated' && sameKey(final.key, displayed) ? final.level : 'low';
    return {
      status: 'estimated',
      key: displayed,
      level,
      score: displayedScore,
      relativeAmbiguity: final.status === 'estimated' ? final.relativeAmbiguity : false,
      candidates: final.candidates,
      possibleKeyChange,
      evidence: final.evidence,
    };
  }

  reset(): void {
    this.long.clear();
    this.short.clear();
    this.displayed = null;
    this.challenger = null;
    this.since = null;
    this.fitSince = null;
    this.lastTime = null;
  }
}
