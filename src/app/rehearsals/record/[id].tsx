import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, IconButton } from '@/components/ui/primitives';
import type { Recording } from '@/db/repositories/rehearsals';
import { keyLabel } from '@/features/music-theory';
import { expoRecordingStore } from '@/features/rehearsals/services/expoRecordingStore';
import {
  InsufficientStorageError,
  assertStorageAvailable,
  commitRecording,
  discardRecording,
  formatDuration,
} from '@/features/rehearsals/services/recordingService';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { newId } from '@/utils/id';
import { colors, spacing } from '@/theme/tokens';

type Phase = 'ready' | 'recording' | 'paused' | 'saving' | 'denied';

export default function RecordScreen() {
  const { id: rehearsalId } = useLocalSearchParams<{ id: string }>();
  const { rehearsals } = useRepositories();
  const navigation = useNavigation();
  const info = useFocusedQuery(
    useCallback(async () => {
      const r = await rehearsals.get(rehearsalId);
      return { rehearsal: r, takes: r ? (await rehearsals.listRecordings(rehearsalId)).length : 0 };
    }, [rehearsals, rehearsalId]),
  );

  // Stable ID per take (used for the database row). Files go to app-private document storage;
  // the exact file path is read from the recorder after prepareToRecordAsync().
  const [takeId] = useState(() => newId());
  const options = useMemo(() => ({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' as const, isMeteringEnabled: true }), []);
  const recorder = useAudioRecorder(options);
  const recState = useAudioRecorderState(recorder, 250);

  const [phase, setPhaseState] = useState<Phase>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const pending = useRef<Recording | null>(null);
  const phaseRef = useRef<Phase>('ready');
  // Keep a ref in step with state so AppState/discard callbacks see the latest phase.
  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const start = async () => {
    setMessage(null);
    try {
      assertStorageAvailable(expoRecordingStore);
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setBlocked(!perm.canAskAgain);
        setPhase('denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      const uri = recorder.uri;
      if (!uri) throw new Error('The recorder did not provide a file location.');
      const takeNumber = (info.data?.takes ?? 0) + 1;
      // Placeholder row first: an interrupted take can be recovered on next launch.
      pending.current = await rehearsals.beginRecording({ rehearsalId, name: `Take ${takeNumber}`, fileUri: uri }, takeId);
      recorder.record();
      setPhase('recording');
    } catch (e) {
      setMessage(
        e instanceof InsufficientStorageError
          ? e.message
          : `Recording could not start: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
      if (pending.current) {
        await discardRecording(rehearsals, expoRecordingStore, pending.current).catch(() => undefined);
        pending.current = null;
      }
      setPhase('ready');
    }
  };

  const pause = () => {
    recorder.pause();
    setPhase('paused');
  };

  const resume = () => {
    recorder.record();
    setPhase('recording');
  };

  const stopAndSave = async () => {
    const rec = pending.current;
    if (!rec) return;
    setPhase('saving');
    const durationMs = recState.durationMillis;
    try {
      await recorder.stop();
      const uri = recorder.uri ?? rec.fileUri;
      const saved = await commitRecording(rehearsals, expoRecordingStore, { recordingId: rec.id, fileUri: uri, durationMs });
      pending.current = null;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      router.replace({ pathname: '/rehearsals/playback/[id]', params: { id: saved.id } });
    } catch (e) {
      // Nothing is reported as saved. The take stays recoverable on the next launch.
      setMessage(
        `The recording was not saved: ${e instanceof Error ? e.message : 'unknown error'}. If the audio file exists it will be recovered next time DIONER opens.`,
      );
      setPhase('ready');
    }
  };

  const discard = async () => {
    try {
      if (phaseRef.current === 'recording' || phaseRef.current === 'paused') await recorder.stop();
    } catch {
      // Recorder may already be stopped.
    }
    if (pending.current) await discardRecording(rehearsals, expoRecordingStore, pending.current).catch(() => undefined);
    pending.current = null;
  };

  // Pause when the app is backgrounded (background recording is not enabled).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && phaseRef.current === 'recording') {
        try {
          recorder.pause();
        } catch {
          // ignore
        }
        setPhase('paused');
        setMessage('Recording paused because DIONER went to the background. Resume to continue the same take.');
      }
    });
    return () => sub.remove();
  }, [recorder]);

  // Media services reset (e.g. audio system restart) interrupts the take.
  useEffect(() => {
    if (recState.mediaServicesDidReset && pending.current) {
      setPhase('paused');
      setMessage('The audio system was interrupted. Save what was recorded or discard it.');
    }
  }, [recState.mediaServicesDidReset]);

  // Confirm before leaving with an unsaved take.
  const unsaved = phase === 'recording' || phase === 'paused';
  usePreventRemove(unsaved, ({ data }) => {
    Alert.alert('Discard this take?', 'The recording has not been saved.', [
      { text: 'Keep recording', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discard();
          setPhase('ready');
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const rehearsal = info.data?.rehearsal;
  const level = recState.metering !== undefined ? Math.min(1, Math.max(0, (recState.metering + 60) / 60)) : 0;
  const active = phase === 'recording';

  return (
    <Screen>
      <ScreenHeader back subtitle="Audio stays on this device" title={rehearsal?.title ?? 'Record'} />

      <View style={styles.status}>
        <View style={[styles.dot, active && styles.dotOn]} />
        <AppText color={colors.primaryDark} variant="bodyStrong">
          {phase === 'recording'
            ? 'Recording'
            : phase === 'paused'
              ? 'Paused'
              : phase === 'saving'
                ? 'Saving…'
                : phase === 'denied'
                  ? 'No microphone access'
                  : 'Ready'}
        </AppText>
      </View>
      <AppText accessibilityLabel={`Elapsed ${formatDuration(recState.durationMillis)}`} style={styles.timer} variant="display">
        {formatDuration(recState.durationMillis)}
      </AppText>

      <View
        accessibilityLabel="Recording level"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(level * 100) }}
        style={styles.meter}
      >
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={[styles.bar, { height: 8 + ((i * 7) % 5) * 6 }, active && i / 24 < level && styles.barOn]} />
        ))}
      </View>

      {rehearsal ? (
        <Card style={styles.meta} tinted>
          <Meta label="Song" value={rehearsal.songTitle ?? '—'} />
          <Meta label="Original" value={rehearsal.originalKey ? keyLabel(rehearsal.originalKey) : '—'} />
          <Meta label="Playing" value={rehearsal.playedKey ? keyLabel(rehearsal.playedKey) : '—'} />
        </Card>
      ) : null}

      {phase === 'denied' ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
          <Banner title="Microphone access is off" tone="warning">
            {blocked
              ? 'Turn on microphone access for DIONER in your phone settings to record.'
              : 'Recording needs the microphone. Tap Start to be asked again.'}
          </Banner>
          {blocked ? (
            <Button label="Open phone settings" onPress={() => Linking.openSettings().catch(() => undefined)} variant="secondary" />
          ) : null}
        </View>
      ) : null}
      {message ? (
        <View style={{ marginTop: spacing.md }}>
          <Banner tone="warning">{message}</Banner>
        </View>
      ) : null}

      {phase === 'ready' || phase === 'denied' ? (
        <Button icon="mic" label="Start recording" onPress={start} style={{ marginTop: spacing.xl }} />
      ) : (
        <View style={styles.controls}>
          <View style={styles.control}>
            <IconButton
              disabled={phase === 'saving'}
              icon={active ? 'pause' : 'play'}
              label={active ? 'Pause recording' : 'Resume recording'}
              onPress={active ? pause : resume}
              size={64}
            />
            <AppText color={colors.textSecondary} variant="caption">
              {active ? 'Pause' : 'Resume'}
            </AppText>
          </View>
          <View style={styles.control}>
            <IconButton disabled={phase === 'saving'} filled icon="stop" label="Stop and save recording" onPress={stopAndSave} size={76} />
            <AppText color={colors.textSecondary} variant="caption">
              Stop & save
            </AppText>
          </View>
        </View>
      )}
      {unsaved ? (
        <Button
          label="Discard take"
          onPress={() =>
            Alert.alert('Discard this take?', 'The audio will be deleted.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: async () => {
                  await discard();
                  setPhase('ready');
                  router.back();
                },
              },
            ])
          }
          style={{ marginTop: spacing.lg }}
          variant="ghost"
        />
      ) : null}
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText color={colors.textSecondary} variant="caption">
        {label}
      </AppText>
      <AppText numberOfLines={1} variant="small">
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.light,
    marginTop: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary },
  dotOn: { backgroundColor: colors.primary },
  timer: { textAlign: 'center', marginTop: spacing.md },
  meter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 90, marginVertical: spacing.md },
  bar: { width: 6, borderRadius: 3, backgroundColor: colors.pale },
  barOn: { backgroundColor: colors.primary },
  meta: { flexDirection: 'row', gap: spacing.xs },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 44, marginTop: spacing.xl, alignItems: 'flex-end' },
  control: { alignItems: 'center', gap: 6 },
});
