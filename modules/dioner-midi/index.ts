import { type NativeModule, requireOptionalNativeModule } from 'expo';

export interface NativeMidiDevice {
  id: number;
  name: string;
  transport: 'usb' | 'bluetooth' | 'virtual' | 'unknown';
  outputPorts: number;
}

export interface NativeBluetoothDevice {
  address: string;
  name: string;
  rssi: number;
}

export type DionerMidiEvents = {
  onMidiData(event: { deviceId: number; bytes: number[]; timestamp: number }): void;
  onDevicesChanged(event: { devices: NativeMidiDevice[] }): void;
  onDeviceError(event: { deviceId: number; reason: 'disconnected' }): void;
  onBluetoothDevicesFound(event: { devices: NativeBluetoothDevice[] }): void;
  onBluetoothScanStopped(event: { error: string | null }): void;
};

declare class DionerMidiModule extends NativeModule<DionerMidiEvents> {
  isSupported(): boolean;
  getDevices(): NativeMidiDevice[];
  openDevice(deviceId: number): Promise<NativeMidiDevice>;
  closeDevice(): void;
  isBluetoothReady(): boolean;
  startBluetoothScan(): Promise<null>;
  stopBluetoothScan(): void;
  openBluetoothDevice(address: string): Promise<NativeMidiDevice>;
}

/**
 * The native module, or null when it is not part of the running binary
 * (Expo Go, web, or a build made before the module was added).
 */
export const DionerMidi = requireOptionalNativeModule<DionerMidiModule>('DionerMidi');
