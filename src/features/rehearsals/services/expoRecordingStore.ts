import { File, Paths } from 'expo-file-system';

import type { RecordingFileStore } from './recordingService';

/** expo-file-system implementation. Recordings live in app-private document storage. */
export const expoRecordingStore: RecordingFileStore = {
  exists(uri) {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  },
  size(uri) {
    try {
      const f = new File(uri);
      return f.exists ? f.size : null;
    } catch {
      return null;
    }
  },
  remove(uri) {
    const f = new File(uri);
    if (f.exists) f.delete();
  },
  availableBytes() {
    try {
      return Paths.availableDiskSpace;
    } catch {
      return null;
    }
  },
};
