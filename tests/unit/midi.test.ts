/**
 * MIDI byte parsing and the native-module adapter. The native module itself
 * (Kotlin, android.media.midi) is replaced by a fake: these tests do not
 * prove that real hardware works.
 */
import { MidiKeyAnalyzer } from '@/features/live-keys/engine/midiEvidence';
import { MidiParser } from '@/services/midi/midiParser';
import {
  BluetoothPermissionError,
  MIDI_UNSUPPORTED_DEVICE_REASON,
  type NativeMidiLike,
  createNativeMidiInput,
  unavailableMidiInput,
} from '@/services/midi/midiInput';

jest.mock('../../modules/dioner-midi', () => ({ DionerMidi: null }));

const brief = (xs: { type: string; note: number; velocity: number; channel: number }[]) =>
  xs.map((x) => `${x.type}:${x.note}:${x.velocity}:${x.channel}`);

describe('MidiParser', () => {
  test('note on and note off with full status bytes', () => {
    const p = new MidiParser();
    expect(brief(p.feed([0x90, 60, 100, 0x80, 60, 0], 0))).toEqual(['noteOn:60:100:0', 'noteOff:60:0:0']);
  });

  test('velocity 0 note-on is a note-off', () => {
    expect(brief(new MidiParser().feed([0x93, 64, 0], 0))).toEqual(['noteOff:64:0:3']);
  });

  test('running status', () => {
    const p = new MidiParser();
    expect(brief(p.feed([0x90, 60, 90, 64, 80, 67, 70, 60, 0], 0))).toEqual([
      'noteOn:60:90:0',
      'noteOn:64:80:0',
      'noteOn:67:70:0',
      'noteOff:60:0:0',
    ]);
  });

  test('messages split across buffers', () => {
    const p = new MidiParser();
    expect(p.feed([0x90], 0)).toEqual([]);
    expect(p.feed([60], 0)).toEqual([]);
    expect(brief(p.feed([100], 0))).toEqual(['noteOn:60:100:0']);
  });

  test('real-time bytes interleaved inside a message are ignored', () => {
    const p = new MidiParser();
    expect(brief(p.feed([0x90, 0xf8, 60, 0xfe, 100, 0xf8], 0))).toEqual(['noteOn:60:100:0']);
  });

  test('SysEx is skipped and cancels running status', () => {
    const p = new MidiParser();
    p.feed([0x90, 60, 100], 0);
    expect(p.feed([0xf0, 0x7e, 0x09, 0x01, 0xf7], 0)).toEqual([]);
    expect(p.feed([62, 100], 0)).toEqual([]); // no running status after SysEx
    expect(brief(p.feed([0x90, 62, 100], 0))).toEqual(['noteOn:62:100:0']);
  });

  test('other channel messages and system common are consumed', () => {
    const p = new MidiParser();
    const out = p.feed([0xb0, 64, 127, 0xc0, 5, 0xe0, 0, 64, 0xf2, 1, 2, 0x90, 60, 99], 0);
    expect(brief(out)).toEqual(['noteOn:60:99:0']);
  });

  test('stray data bytes before any status are ignored', () => {
    expect(new MidiParser().feed([60, 100, 0x90, 61, 1], 0).length).toBe(1);
  });
});

function fakeNative(supported = true) {
  const listeners: Record<string, ((e: never) => void)[]> = {};
  const native = {
    isSupported: () => supported,
    getDevices: () => [{ id: 7, name: 'Test Keys', transport: 'usb' as const }],
    openDevice: jest.fn(async (id: number) => {
      if (id !== 7) throw new Error('The MIDI device is no longer connected.');
      return { id: 7, name: 'Test Keys', transport: 'usb' as const };
    }),
    closeDevice: jest.fn(),
    startBluetoothScan: jest.fn(async () => null),
    stopBluetoothScan: jest.fn(),
    openBluetoothDevice: jest.fn(async (address: string) => ({ id: 11, name: `BLE ${address}`, transport: 'bluetooth' as const })),
    addListener: (event: string, fn: (e: never) => void) => {
      (listeners[event] ??= []).push(fn);
      return { remove: () => (listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn)) };
    },
    emit: (event: string, payload: unknown) => (listeners[event] ?? []).forEach((f) => f(payload as never)),
    count: (event: string) => (listeners[event] ?? []).length,
  };
  return native;
}

describe('native MIDI adapter', () => {
  test('reports unsupported devices honestly', () => {
    const svc = createNativeMidiInput(fakeNative(false) as unknown as NativeMidiLike);
    expect(svc.availability()).toEqual({ available: false, reason: MIDI_UNSUPPORTED_DEVICE_REASON });
    expect(svc.listDevices()).toEqual([]);
  });

  test('lists, opens and closes devices', async () => {
    const native = fakeNative();
    const svc = createNativeMidiInput(native as unknown as NativeMidiLike);
    expect(svc.availability()).toEqual({ available: true });
    expect(svc.listDevices()).toEqual([{ id: 7, name: 'Test Keys', transport: 'usb' }]);
    await expect(svc.open(7)).resolves.toEqual({ id: 7, name: 'Test Keys', transport: 'usb' });
    await expect(svc.open(9)).rejects.toThrow('no longer connected');
    svc.close();
    expect(native.closeDevice).toHaveBeenCalled();
  });

  test('raw bytes become note events per device; disconnection and device changes are forwarded', () => {
    const native = fakeNative();
    const svc = createNativeMidiInput(native as unknown as NativeMidiLike);
    const notes: string[] = [];
    const devicesSeen: number[] = [];
    const disconnected: number[] = [];
    const unsub = svc.subscribe({
      onNote: (e) => notes.push(`${e.type}:${e.note}`),
      onDevicesChanged: (d) => devicesSeen.push(d.length),
      onDisconnected: (id) => disconnected.push(id),
    });
    native.emit('onMidiData', { deviceId: 7, bytes: [0x90, 60], timestamp: 1 });
    native.emit('onMidiData', { deviceId: 7, bytes: [100, 64, 90], timestamp: 1.1 }); // split + running status
    native.emit('onDevicesChanged', { devices: [] });
    native.emit('onDeviceError', { deviceId: 7, reason: 'disconnected' });
    expect(notes).toEqual(['noteOn:60', 'noteOn:64']);
    expect(devicesSeen).toEqual([0]);
    expect(disconnected).toEqual([7]);
    unsub();
    expect(native.count('onMidiData')).toBe(0);
  });

  test('end to end: bytes → parser → key analyzer', () => {
    const native = fakeNative();
    const svc = createNativeMidiInput(native as unknown as NativeMidiLike);
    const analyzer = new MidiKeyAnalyzer();
    svc.subscribe({ onNote: (e) => analyzer.handle(e) });
    // I–IV–V–I in D major, played three times.
    const chords = [
      [50, 54, 57, 62],
      [55, 59, 62, 67],
      [57, 61, 64, 69],
      [50, 54, 57, 62],
    ];
    let t = 0;
    let reading = analyzer.tick(t);
    for (let rep = 0; rep < 3; rep++) {
      for (const c of chords) {
        native.emit('onMidiData', { deviceId: 7, bytes: c.flatMap((n) => [0x90, n, 90]), timestamp: t });
        for (let k = 0; k < 13; k++) reading = analyzer.tick((t += 0.15));
        native.emit('onMidiData', { deviceId: 7, bytes: c.flatMap((n) => [0x80, n, 0]), timestamp: t });
      }
    }
    expect(reading.key.key).toEqual({ tonic: 2, mode: 'major' });
  });

  test('the unavailable service never produces events', async () => {
    const svc = unavailableMidiInput('reason');
    expect(svc.availability()).toEqual({ available: false, reason: 'reason' });
    await expect(svc.open(1)).rejects.toThrow('reason');
    expect(svc.subscribe({ onNote: () => undefined })).toBeInstanceOf(Function);
  });
});

describe('Bluetooth MIDI adapter', () => {
  test('permissions are requested before scanning; denial stops the scan', async () => {
    const native = fakeNative();
    const denied = createNativeMidiInput(native as unknown as NativeMidiLike, async () => false);
    expect(denied.bluetoothSupported()).toBe(true);
    await expect(denied.scanBluetooth()).rejects.toBeInstanceOf(BluetoothPermissionError);
    expect(native.startBluetoothScan).not.toHaveBeenCalled();
    const granted = createNativeMidiInput(native as unknown as NativeMidiLike, async () => true);
    await granted.scanBluetooth();
    expect(native.startBluetoothScan).toHaveBeenCalledTimes(1);
  });

  test('scan results and stop events are forwarded; opening returns the device', async () => {
    const native = fakeNative();
    const svc = createNativeMidiInput(native as unknown as NativeMidiLike, async () => true);
    const found: string[] = [];
    const stopped: (string | null)[] = [];
    svc.subscribe({
      onNote: () => undefined,
      onBluetoothFound: (d) => found.push(...d.map((x) => x.name)),
      onBluetoothScanStopped: (e) => stopped.push(e),
    });
    native.emit('onBluetoothDevicesFound', { devices: [{ address: 'AA', name: 'Piano BLE', rssi: -40 }] });
    native.emit('onBluetoothScanStopped', { error: null });
    expect(found).toEqual(['Piano BLE']);
    expect(stopped).toEqual([null]);
    await expect(svc.openBluetooth('AA')).resolves.toEqual({ id: 11, name: 'BLE AA', transport: 'bluetooth' });
    svc.stopBluetoothScan();
    expect(native.stopBluetoothScan).toHaveBeenCalled();
  });

  test('builds without the Bluetooth API report it as unsupported', async () => {
    const native = { ...fakeNative(), startBluetoothScan: undefined, openBluetoothDevice: undefined };
    const svc = createNativeMidiInput(native as unknown as NativeMidiLike, async () => true);
    expect(svc.bluetoothSupported()).toBe(false);
    await expect(svc.scanBluetooth()).rejects.toThrow(/not available/);
  });
});
