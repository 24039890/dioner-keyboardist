import { type NativeModule, requireOptionalNativeModule } from 'expo';

export interface NativeMidiDevice {
  id: number;
  name: string;
  transport: 'usb' | 'bluetooth' | 'virtual' | 'unknown';
  outputPorts: number;
}

export type DionerMidiEvents = {
  onMidiData(event: { deviceId: number; bytes: number[]; timestamp: number }): void;
  onDevicesChanged(event: { devices: NativeMidiDevice[] }): void;
  onDeviceError(event: { deviceId: number; reason: 'disconnected' }): void;
};

declare class DionerMidiModule extends NativeModule<DionerMidiEvents> {
  isSupported(): boolean;
  getDevices(): NativeMidiDevice[];
  openDevice(deviceId: number): Promise<NativeMidiDevice>;
  closeDevice(): void;
}

/**
 * The native module, or null when it is not part of the running binary
 * (Expo Go, web, or a build made before the module was added).
 */
export const DionerMidi = requireOptionalNativeModule<DionerMidiModule>('DionerMidi');
