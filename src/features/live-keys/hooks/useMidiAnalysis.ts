import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type BluetoothMidiDevice, type MidiDevice, type MidiInputService, getMidiInput } from '../../../services/midi/midiInput';
import { MidiKeyAnalyzer, type MidiSnapshot } from '../engine/midiEvidence';

export type MidiStatus = 'idle' | 'connecting' | 'listening' | 'error';

const TICK_MS = 150;

/** MIDI keyboard → MidiKeyAnalyzer. Describes the keyboard part, not the singer. */
export function useMidiAnalysis(enabled: boolean, service: MidiInputService = getMidiInput()) {
  const availability = service.availability();
  const [devices, setDevices] = useState<MidiDevice[]>(() => (availability.available ? service.listDevices() : []));
  const [device, setDevice] = useState<MidiDevice | null>(null);
  const [status, setStatus] = useState<MidiStatus>('idle');
  const [snapshot, setSnapshot] = useState<MidiSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const analyzer = useRef(new MidiKeyAnalyzer());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const deviceRef = useRef<MidiDevice | null>(null);
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothMidiDevice[]>([]);
  const [scanning, setScanning] = useState(false);

  const stopTicking = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const disconnect = useCallback(
    (nextMessage: string | null = null) => {
      stopTicking();
      service.close();
      analyzer.current.reset();
      deviceRef.current = null;
      setDevice(null);
      setSnapshot(null);
      setStatus(nextMessage ? 'error' : 'idle');
      setMessage(nextMessage);
    },
    [service, stopTicking],
  );

  // Note events, device list changes and disconnections.
  useEffect(() => {
    if (!enabled || !availability.available) return;
    const unsubscribe = service.subscribe({
      onNote: (e) => analyzer.current.handle(e),
      onDevicesChanged: setDevices,
      onBluetoothFound: setBluetoothDevices,
      onBluetoothScanStopped: (error) => {
        setScanning(false);
        if (error) setMessage(error);
      },
      onDisconnected: (id) => {
        if (deviceRef.current?.id === id) disconnect('The MIDI keyboard was disconnected. Reconnect it and choose it again.');
      },
    });
    return unsubscribe;
  }, [enabled, availability.available, service, disconnect]);

  const openWith = useCallback(
    async (opener: () => Promise<MidiDevice>) => {
      setStatus('connecting');
      setMessage(null);
      try {
        const opened = await opener();
        analyzer.current.reset();
        deviceRef.current = opened;
        setDevice(opened);
        started.current = Date.now();
        stopTicking();
        timer.current = setInterval(() => {
          setSnapshot(analyzer.current.tick((Date.now() - started.current) / 1000));
        }, TICK_MS);
        setStatus('listening');
      } catch (e) {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'The MIDI device could not be opened.');
      }
    },
    [stopTicking],
  );

  const connect = useCallback((id: number) => openWith(() => service.open(id)), [openWith, service]);
  const connectBluetooth = useCallback(
    (address: string) => {
      setScanning(false);
      return openWith(() => service.openBluetooth(address));
    },
    [openWith, service],
  );

  const scanBluetooth = useCallback(async () => {
    setMessage(null);
    setBluetoothDevices([]);
    setScanning(true);
    try {
      await service.scanBluetooth();
    } catch (e) {
      setScanning(false);
      setMessage(e instanceof Error ? e.message : 'Bluetooth scan could not start.');
    }
  }, [service]);

  const refresh = useCallback(() => {
    if (availability.available) setDevices(service.listDevices());
  }, [availability.available, service]);

  // Release the device when the app is backgrounded or MIDI mode is left.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && deviceRef.current) disconnect('MIDI was disconnected because DIONER went to the background.');
    });
    return () => sub.remove();
  }, [disconnect]);

  useEffect(() => {
    if (!enabled && deviceRef.current) disconnect();
  }, [enabled, disconnect]);

  useEffect(
    () => () => {
      stopTicking();
      service.stopBluetoothScan();
      if (deviceRef.current) service.close();
    },
    [service, stopTicking],
  );

  return {
    availability,
    devices,
    device,
    status,
    snapshot,
    message,
    connect,
    disconnect: () => disconnect(),
    refresh,
    bluetoothSupported: availability.available && service.bluetoothSupported(),
    bluetoothDevices,
    scanning,
    scanBluetooth,
    connectBluetooth,
  };
}
