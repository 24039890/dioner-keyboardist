/**
 * Streaming MIDI 1.0 byte parser → note events.
 *
 * Handles running status, system real-time bytes interleaved anywhere
 * (0xF8–0xFF, ignored), SysEx (0xF0 … 0xF7, skipped), system common messages,
 * and note-on with velocity 0 as note-off. Only note messages are emitted;
 * other channel messages are consumed and ignored.
 */
import type { MidiNoteEvent } from '../../features/live-keys/engine/midiEvidence';

export interface ParsedNote extends MidiNoteEvent {
  channel: number;
}

/** Data bytes expected after each channel-message status (high nibble). */
const CHANNEL_DATA_LENGTH: Record<number, number> = {
  0x80: 2, // note off
  0x90: 2, // note on
  0xa0: 2, // poly aftertouch
  0xb0: 2, // control change
  0xc0: 1, // program change
  0xd0: 1, // channel pressure
  0xe0: 2, // pitch bend
};

const SYSTEM_COMMON_LENGTH: Record<number, number> = {
  0xf1: 1, // MTC quarter frame
  0xf2: 2, // song position
  0xf3: 1, // song select
  0xf6: 0, // tune request
};

export class MidiParser {
  private runningStatus: number | null = null;
  private data: number[] = [];
  private expected = 0;
  private inSysex = false;
  private systemCommon: number | null = null;

  /** Feeds raw bytes (0–255). Returns the note events completed by these bytes. */
  feed(bytes: readonly number[], time: number): ParsedNote[] {
    const out: ParsedNote[] = [];
    for (const raw of bytes) {
      const b = raw & 0xff;
      if (b >= 0xf8) continue; // real-time: does not affect running status
      if (b === 0xf0) {
        this.inSysex = true;
        this.runningStatus = null;
        continue;
      }
      if (b === 0xf7) {
        this.inSysex = false;
        continue;
      }
      if (b & 0x80) {
        this.inSysex = false;
        this.data = [];
        if (b >= 0xf0) {
          // System common cancels running status.
          this.runningStatus = null;
          this.systemCommon = b;
          this.expected = SYSTEM_COMMON_LENGTH[b] ?? 0;
          if (this.expected === 0) this.systemCommon = null;
          continue;
        }
        this.systemCommon = null;
        this.runningStatus = b;
        this.expected = CHANNEL_DATA_LENGTH[b & 0xf0] ?? 0;
        continue;
      }
      // Data byte.
      if (this.inSysex) continue;
      if (this.systemCommon !== null) {
        this.data.push(b);
        if (this.data.length >= this.expected) {
          this.systemCommon = null;
          this.data = [];
        }
        continue;
      }
      if (this.runningStatus === null) continue; // stray data byte
      this.data.push(b);
      if (this.data.length < this.expected) continue;
      const status = this.runningStatus;
      const [d1 = 0, d2 = 0] = this.data;
      this.data = [];
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      if (kind === 0x90 && d2 > 0) out.push({ type: 'noteOn', note: d1, velocity: d2, channel, time });
      else if (kind === 0x90 || kind === 0x80) out.push({ type: 'noteOff', note: d1, velocity: d2, channel, time });
    }
    return out;
  }

  reset(): void {
    this.runningStatus = null;
    this.data = [];
    this.expected = 0;
    this.inSysex = false;
    this.systemCommon = null;
  }
}
