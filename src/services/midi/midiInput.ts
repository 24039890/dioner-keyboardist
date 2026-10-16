/**
 * MIDI input boundary.
 *
 * On Android development/production builds the local Expo module
 * `modules/dioner-midi` (android.media.midi) provides real USB/virtual MIDI
 * input. In Expo Go, on web, or on devices without the android.software.midi
 * feature, `availability()` explains why MIDI is unavailable. MIDI events are
 * never simulated.
 */
import { Platform } from 'react-native';

import { DionerMidi } from '../../../modules/dioner-midi';
import type { MidiNoteEvent } from '../../features/live-keys/engine/midiEvidence';
import { MidiParser } from './midiParser';

export interface MidiDevice {
  id: number;
  name: string;
  transport: 'usb' | 'bluetooth' | 'virtual' | 'unknown';
}

export type MidiAvailability = { available: true } | { available: false; reason: string };

export interface MidiInputService {
  availability(): MidiAvailability;
  listDevices(): MidiDevice[];
  open(deviceId: number): Promise<MidiDevice>;
  close(): void;
  /** Subscribes to note events, device changes and disconnections. Returns an unsubscribe function. */
  subscribe(handlers: {
    onNote: (event: MidiNoteEvent) => void;
    onDevicesChanged?: (devices: MidiDevice[]) => void;
    onDisconnected?: (deviceId: number) => void;
  }): () => void;
}

export const MIDI_NOT_IN_BUILD_REASON =
  'MIDI input needs the DIONER development or release build for Android. It is not available in Expo Go or on the web.';
export const MIDI_UNSUPPORTED_DEVICE_REASON = 'This phone does not report MIDI support (android.software.midi).';

export function unavailableMidiInput(reason: string): MidiInputService {
  return {
    availability: () => ({ available: false, reason }),
    listDevices: () => [],
    open: async () => {
      throw new Error(reason);
    },
    close: () => undefined,
    subscribe: () => () => undefined,
  };
}

/** Structural type of the native module (kept narrow so tests can provide a fake). */
export interface NativeMidiLike {
  isSupported(): boolean;
  getDevices(): { id: number; name: string; transport: MidiDevice['transport'] }[];
  openDevice(deviceId: number): Promise<{ id: number; name: string; transport: MidiDevice['transport'] }>;
  closeDevice(): void;
  addListener(event: 'onMidiData', listener: (e: { deviceId: number; bytes: number[]; timestamp: number }) => void): { remove(): void };
  addListener(
    event: 'onDevicesChanged',
    listener: (e: { devices: { id: number; name: string; transport: MidiDevice['transport'] }[] }) => void,
  ): {
    remove(): void;
  };
  addListener(event: 'onDeviceError', listener: (e: { deviceId: number; reason: string }) => void): { remove(): void };
}

const toDevice = (d: { id: number; name: string; transport: MidiDevice['transport'] }): MidiDevice => ({
  id: d.id,
  name: d.name,
  transport: d.transport,
});

export function createNativeMidiInput(native: NativeMidiLike): MidiInputService {
  const parsers = new Map<number, MidiParser>();
  return {
    availability: () => (native.isSupported() ? { available: true } : { available: false, reason: MIDI_UNSUPPORTED_DEVICE_REASON }),
    listDevices: () => (native.isSupported() ? native.getDevices().map(toDevice) : []),
    open: async (deviceId) => toDevice(await native.openDevice(deviceId)),
    close: () => {
      native.closeDevice();
      parsers.clear();
    },
    subscribe: ({ onNote, onDevicesChanged, onDisconnected }) => {
      const subs = [
        native.addListener('onMidiData', (e) => {
          let parser = parsers.get(e.deviceId);
          if (!parser) {
            parser = new MidiParser();
            parsers.set(e.deviceId, parser);
          }
          for (const note of parser.feed(e.bytes, e.timestamp)) onNote(note);
        }),
        native.addListener('onDevicesChanged', (e) => onDevicesChanged?.(e.devices.map(toDevice))),
        native.addListener('onDeviceError', (e) => {
          parsers.delete(e.deviceId);
          onDisconnected?.(e.deviceId);
        }),
      ];
      return () => subs.forEach((s) => s.remove());
    },
  };
}

let cached: MidiInputService | null = null;

export function getMidiInput(): MidiInputService {
  if (cached) return cached;
  cached = Platform.OS === 'android' && DionerMidi ? createNativeMidiInput(DionerMidi) : unavailableMidiInput(MIDI_NOT_IN_BUILD_REASON);
  return cached;
}
