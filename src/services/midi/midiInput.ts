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
import { requestBluetoothPermissions } from './bluetoothPermissions';
import type { MidiNoteEvent } from '../../features/live-keys/engine/midiEvidence';
import { MidiParser } from './midiParser';

export interface MidiDevice {
  id: number;
  name: string;
  transport: 'usb' | 'bluetooth' | 'virtual' | 'unknown';
}

export interface BluetoothMidiDevice {
  address: string;
  name: string;
  rssi: number;
}

export class BluetoothPermissionError extends Error {
  constructor() {
    super('Bluetooth permission is needed to find Bluetooth MIDI keyboards. Allow it in the prompt or in phone settings.');
    this.name = 'BluetoothPermissionError';
  }
}

export type MidiAvailability = { available: true } | { available: false; reason: string };

export interface MidiInputService {
  availability(): MidiAvailability;
  listDevices(): MidiDevice[];
  open(deviceId: number): Promise<MidiDevice>;
  close(): void;
  /** True when this build and phone can use Bluetooth LE MIDI. */
  bluetoothSupported(): boolean;
  /** Requests Bluetooth permissions, then scans ~15 s. Results arrive through subscribe(). */
  scanBluetooth(): Promise<void>;
  stopBluetoothScan(): void;
  openBluetooth(address: string): Promise<MidiDevice>;
  /** Subscribes to note events, device changes and disconnections. Returns an unsubscribe function. */
  subscribe(handlers: {
    onNote: (event: MidiNoteEvent) => void;
    onDevicesChanged?: (devices: MidiDevice[]) => void;
    onDisconnected?: (deviceId: number) => void;
    onBluetoothFound?: (devices: BluetoothMidiDevice[]) => void;
    onBluetoothScanStopped?: (error: string | null) => void;
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
    bluetoothSupported: () => false,
    scanBluetooth: async () => {
      throw new Error(reason);
    },
    stopBluetoothScan: () => undefined,
    openBluetooth: async () => {
      throw new Error(reason);
    },
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
  addListener(event: 'onBluetoothDevicesFound', listener: (e: { devices: BluetoothMidiDevice[] }) => void): { remove(): void };
  addListener(event: 'onBluetoothScanStopped', listener: (e: { error: string | null }) => void): { remove(): void };
  isBluetoothReady?(): boolean;
  startBluetoothScan?(): Promise<unknown>;
  stopBluetoothScan?(): void;
  openBluetoothDevice?(address: string): Promise<{ id: number; name: string; transport: MidiDevice['transport'] }>;
}

const toDevice = (d: { id: number; name: string; transport: MidiDevice['transport'] }): MidiDevice => ({
  id: d.id,
  name: d.name,
  transport: d.transport,
});

export function createNativeMidiInput(
  native: NativeMidiLike,
  requestPermissions: () => Promise<boolean> = requestBluetoothPermissions,
): MidiInputService {
  const parsers = new Map<number, MidiParser>();
  return {
    availability: () => (native.isSupported() ? { available: true } : { available: false, reason: MIDI_UNSUPPORTED_DEVICE_REASON }),
    listDevices: () => (native.isSupported() ? native.getDevices().map(toDevice) : []),
    open: async (deviceId) => toDevice(await native.openDevice(deviceId)),
    bluetoothSupported: () => native.isSupported() && typeof native.startBluetoothScan === 'function',
    scanBluetooth: async () => {
      if (!native.startBluetoothScan) throw new Error('Bluetooth MIDI is not available in this build.');
      if (!(await requestPermissions())) throw new BluetoothPermissionError();
      await native.startBluetoothScan();
    },
    stopBluetoothScan: () => native.stopBluetoothScan?.(),
    openBluetooth: async (address) => {
      if (!native.openBluetoothDevice) throw new Error('Bluetooth MIDI is not available in this build.');
      return toDevice(await native.openBluetoothDevice(address));
    },
    close: () => {
      native.closeDevice();
      parsers.clear();
    },
    subscribe: ({ onNote, onDevicesChanged, onDisconnected, onBluetoothFound, onBluetoothScanStopped }) => {
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
        native.addListener('onBluetoothDevicesFound', (e) => onBluetoothFound?.(e.devices)),
        native.addListener('onBluetoothScanStopped', (e) => onBluetoothScanStopped?.(e.error)),
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
