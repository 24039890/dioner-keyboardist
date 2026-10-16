/**
 * Key evidence from MIDI keyboard input.
 *
 * MIDI events describe what the keyboardist plays, not what a singer sings.
 * Held notes are accumulated as pitch-class evidence weighted by velocity and
 * held time, then passed to the same KeyTracker used for the microphone.
 */
import { midiToNoteLabel } from '../../music-theory/pitch';
import { type KeyReading, type KeyTrackerOptions, KeyTracker } from './keyEstimator';

export interface MidiNoteEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  velocity: number;
  /** Seconds, monotonic. */
  time: number;
}

export interface MidiSnapshot {
  time: number;
  heldNotes: string[];
  lastNote: { label: string; velocity: number } | null;
  key: KeyReading;
}

export class MidiKeyAnalyzer {
  private readonly held = new Map<number, number>(); // note → velocity
  private readonly tracker: KeyTracker;
  private lastNote: { label: string; velocity: number } | null = null;

  constructor(options: Partial<KeyTrackerOptions> = {}) {
    this.tracker = new KeyTracker(options);
  }

  handle(event: MidiNoteEvent): void {
    if (event.note < 0 || event.note > 127) return;
    // Note-on with velocity 0 is a note-off by MIDI convention.
    if (event.type === 'noteOn' && event.velocity > 0) {
      this.held.set(event.note, event.velocity);
      this.lastNote = { label: midiToNoteLabel(event.note), velocity: event.velocity };
    } else {
      this.held.delete(event.note);
    }
  }

  /** Call periodically (e.g. every 150 ms) to integrate held notes over time. */
  tick(time: number): MidiSnapshot {
    let vector: Float64Array | null = null;
    let weight = 0;
    if (this.held.size > 0) {
      vector = new Float64Array(12);
      let total = 0;
      for (const [note, velocity] of this.held) {
        const w = 0.5 + velocity / 254;
        vector[note % 12] = (vector[note % 12] as number) + w;
        total += w;
      }
      for (let i = 0; i < 12; i++) vector[i] = (vector[i] as number) / total;
      weight = 1;
    }
    const key = this.tracker.update(vector, weight, time);
    return {
      time,
      heldNotes: [...this.held.keys()].sort((a, b) => a - b).map((n) => midiToNoteLabel(n)),
      lastNote: this.lastNote,
      key,
    };
  }

  reset(): void {
    this.held.clear();
    this.tracker.reset();
    this.lastNote = null;
  }
}
