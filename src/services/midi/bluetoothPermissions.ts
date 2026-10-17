import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Runtime permissions for Bluetooth LE MIDI.
 * Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT (scan is declared neverForLocation).
 * Android 11 and older: BLE scanning requires ACCESS_FINE_LOCATION.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const permissions =
    api >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}
