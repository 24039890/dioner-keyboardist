import {
  type AudioStreamBuffer,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type AnalysisSnapshot, LiveAnalyzer } from '../engine/analyzer';

export type ListeningStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'denied' | 'error';

export interface LiveAnalysisState {
  status: ListeningStatus;
  snapshot: AnalysisSnapshot | null;
  /** Why listening paused or failed (backgrounded, interrupted, error text). */
  message: string | null;
  /** Permission was permanently denied; the user must enable it in system settings. */
  permissionBlocked: boolean;
}

/** Requested capture rate. The hardware may deliver another rate; the analyzer resamples. */
const CAPTURE_RATE = 16000;

/**
 * Microphone capture → LiveAnalyzer. Audio stays on the device: buffers are
 * analysed in memory and discarded; nothing is recorded or uploaded.
 */
export function useLiveAnalysis() {
  const analyzerRef = useRef<LiveAnalyzer>(new LiveAnalyzer());
  const statusRef = useRef<ListeningStatus>('idle');
  const [state, setState] = useState<LiveAnalysisState>({ status: 'idle', snapshot: null, message: null, permissionBlocked: false });

  const setStatus = useCallback((status: ListeningStatus, patch: Partial<LiveAnalysisState> = {}) => {
    statusRef.current = status;
    setState((s) => ({ ...s, status, ...patch }));
  }, []);

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (statusRef.current !== 'listening') return;
    try {
      const snaps = analyzerRef.current.pushBuffer(buffer, 'float32');
      const latest = snaps[snaps.length - 1];
      if (latest) setState((s) => (s.status === 'listening' ? { ...s, snapshot: latest } : s));
    } catch (e) {
      statusRef.current = 'error';
      setState((s) => ({ ...s, status: 'error', message: e instanceof Error ? e.message : 'Audio analysis failed.' }));
    }
  }, []);

  const { stream, isStreaming } = useAudioStream({ sampleRate: CAPTURE_RATE, channels: 1, encoding: 'float32', onBuffer });

  const stopStream = useCallback(() => {
    try {
      if (stream.isStreaming) stream.stop();
    } catch {
      // Already stopped or released.
    }
  }, [stream]);

  const begin = useCallback(async () => {
    setStatus('starting', { message: null });
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setStatus('denied', { permissionBlocked: !perm.canAskAgain, message: null });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      statusRef.current = 'listening';
      await stream.start();
      setStatus('listening', { permissionBlocked: false });
    } catch (e) {
      stopStream();
      setStatus('error', { message: e instanceof Error ? e.message : 'The microphone could not be started.' });
    }
  }, [setStatus, stopStream, stream]);

  const start = useCallback(async () => {
    analyzerRef.current.reset();
    setState((s) => ({ ...s, snapshot: null }));
    await begin();
  }, [begin]);

  /** Releases the microphone but keeps the accumulated evidence. */
  const pause = useCallback(
    (message: string | null = null) => {
      stopStream();
      setStatus('paused', { message });
    },
    [setStatus, stopStream],
  );

  const resume = useCallback(async () => {
    await begin();
  }, [begin]);

  const stop = useCallback(() => {
    stopStream();
    analyzerRef.current.reset();
    // Keep the last snapshot so the result stays on screen after stopping.
    setStatus('idle', { message: null });
  }, [setStatus, stopStream]);

  // Release the microphone when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && statusRef.current === 'listening') {
        pause('Paused because DIONER went to the background. The microphone is released.');
      }
    });
    return () => sub.remove();
  }, [pause]);

  // Detect the OS stopping capture (phone call, another app taking the mic).
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !isStreaming && statusRef.current === 'listening') {
      setStatus('paused', { message: 'Listening was interrupted by the system (for example a call or another app using the microphone).' });
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, setStatus]);

  // Cleanup on unmount: stop capture; the stream object itself is released by useAudioStream.
  useEffect(() => () => stopStream(), [stopStream]);

  return { ...state, start, pause: () => pause(null), resume, stop };
}
