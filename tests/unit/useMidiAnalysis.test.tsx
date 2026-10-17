import { act, renderHook } from '@testing-library/react-native';

import { useMidiAnalysis } from '@/features/live-keys/hooks/useMidiAnalysis';
import type { MidiInputService } from '@/services/midi/midiInput';
import type { MidiNoteEvent } from '@/features/live-keys/engine/midiEvidence';

jest.mock('../../modules/dioner-midi', () => ({ DionerMidi: null }));

function fakeService() {
  let handlers: Parameters<MidiInputService['subscribe']>[0] | null = null;
  const svc: MidiInputService & {
    note: (e: MidiNoteEvent) => void;
    unplug: (id: number) => void;
    found: (d: { address: string; name: string; rssi: number }[]) => void;
    scanStopped: (error: string | null) => void;
    closed: number;
    scanError: Error | null;
  } = {
    scanError: null,
    closed: 0,
    availability: () => ({ available: true }),
    listDevices: () => [{ id: 3, name: 'Stage Piano', transport: 'usb' }],
    open: async (id) => ({ id, name: 'Stage Piano', transport: 'usb' }),
    close: () => {
      svc.closed++;
    },
    bluetoothSupported: () => true,
    scanBluetooth: async () => {
      if (svc.scanError) throw svc.scanError;
    },
    stopBluetoothScan: () => undefined,
    openBluetooth: async (address) => ({ id: 9, name: `BLE ${address}`, transport: 'bluetooth' }),
    subscribe: (h) => {
      handlers = h;
      return () => {
        handlers = null;
      };
    },
    note: (e) => handlers?.onNote(e),
    unplug: (id) => handlers?.onDisconnected?.(id),
    found: (d) => handlers?.onBluetoothFound?.(d),
    scanStopped: (error) => handlers?.onBluetoothScanStopped?.(error),
  };
  return svc;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('connect, receive notes, estimate a key, and handle unplugging', async () => {
  const svc = fakeService();
  const { result } = await renderHook(() => useMidiAnalysis(true, svc));
  expect(result.current.devices).toHaveLength(1);
  await act(async () => {
    await result.current.connect(3);
  });
  expect(result.current.status).toBe('listening');
  expect(result.current.device?.name).toBe('Stage Piano');

  // Hold a G major triad and its scale tones over ~6 seconds.
  const notes = [55, 59, 62, 67, 60, 64, 66];
  await act(async () => {
    for (const n of notes) svc.note({ type: 'noteOn', note: n, velocity: 90, time: 0 });
    jest.advanceTimersByTime(6000);
  });
  expect(result.current.snapshot?.heldNotes.length).toBe(7);
  expect(result.current.snapshot?.lastNote?.label).toBe('F♯4');
  expect(result.current.snapshot?.key.status).not.toBe('insufficient');

  await act(async () => {
    svc.unplug(3);
  });
  expect(result.current.status).toBe('error');
  expect(result.current.device).toBeNull();
  expect(result.current.message).toMatch(/disconnected/);
  expect(svc.closed).toBeGreaterThan(0);
});

test('leaving MIDI mode releases the device', async () => {
  const svc = fakeService();
  const { result, rerender } = await renderHook(({ on }: { on: boolean }) => useMidiAnalysis(on, svc), { initialProps: { on: true } });
  await act(async () => {
    await result.current.connect(3);
  });
  await rerender({ on: false });
  expect(result.current.status).toBe('idle');
  expect(svc.closed).toBeGreaterThan(0);
});

test('Bluetooth: scan, list found keyboards, connect', async () => {
  const svc = fakeService();
  const { result } = await renderHook(() => useMidiAnalysis(true, svc));
  expect(result.current.bluetoothSupported).toBe(true);
  await act(async () => {
    await result.current.scanBluetooth();
  });
  expect(result.current.scanning).toBe(true);
  await act(async () => {
    svc.found([{ address: 'AA:BB', name: 'Piano BLE', rssi: -50 }]);
  });
  expect(result.current.bluetoothDevices.map((d) => d.name)).toEqual(['Piano BLE']);
  await act(async () => {
    await result.current.connectBluetooth('AA:BB');
  });
  expect(result.current.status).toBe('listening');
  expect(result.current.device).toEqual({ id: 9, name: 'BLE AA:BB', transport: 'bluetooth' });
  expect(result.current.scanning).toBe(false);
});

test('Bluetooth: permission denial and scan failure are reported', async () => {
  const svc = fakeService();
  svc.scanError = new Error('Bluetooth permission is needed');
  const { result } = await renderHook(() => useMidiAnalysis(true, svc));
  await act(async () => {
    await result.current.scanBluetooth();
  });
  expect(result.current.scanning).toBe(false);
  expect(result.current.message).toMatch(/permission/);
  svc.scanError = null;
  await act(async () => {
    await result.current.scanBluetooth();
  });
  await act(async () => {
    svc.scanStopped('Bluetooth scan failed (code 2).');
  });
  expect(result.current.scanning).toBe(false);
  expect(result.current.message).toMatch(/scan failed/);
});
