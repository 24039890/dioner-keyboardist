import { act, renderHook } from '@testing-library/react-native';

import { useMidiAnalysis } from '@/features/live-keys/hooks/useMidiAnalysis';
import type { MidiInputService } from '@/services/midi/midiInput';
import type { MidiNoteEvent } from '@/features/live-keys/engine/midiEvidence';

jest.mock('../../modules/dioner-midi', () => ({ DionerMidi: null }));

function fakeService() {
  let handlers: Parameters<MidiInputService['subscribe']>[0] | null = null;
  const svc: MidiInputService & { note: (e: MidiNoteEvent) => void; unplug: (id: number) => void; closed: number } = {
    closed: 0,
    availability: () => ({ available: true }),
    listDevices: () => [{ id: 3, name: 'Stage Piano', transport: 'usb' }],
    open: async (id) => ({ id, name: 'Stage Piano', transport: 'usb' }),
    close: () => {
      svc.closed++;
    },
    subscribe: (h) => {
      handlers = h;
      return () => {
        handlers = null;
      };
    },
    note: (e) => handlers?.onNote(e),
    unplug: (id) => handlers?.onDisconnected?.(id),
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
