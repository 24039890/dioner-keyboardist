import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Alert, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/ui/forms';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, EmptyState, Icon, IconButton, LoadingState } from '@/components/ui/primitives';
import { ValidationError } from '@/db/types';
import { formatOffset, keyLabel } from '@/features/music-theory';
import { expoRecordingStore } from '@/features/rehearsals/services/expoRecordingStore';
import { deleteRecording, formatDuration, isRecordingAvailable } from '@/features/rehearsals/services/recordingService';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, radius, spacing } from '@/theme/tokens';

export default function PlaybackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rehearsals } = useRepositories();
  const result = useFocusedQuery(
    useCallback(async () => {
      const recording = await rehearsals.getRecording(id);
      const rehearsal = recording ? await rehearsals.get(recording.rehearsalId) : null;
      return { recording, rehearsal };
    }, [rehearsals, id]),
  );

  const recording = result.data?.recording ?? null;
  const available = recording ? isRecordingAvailable(expoRecordingStore, recording) : false;
  const player = useAudioPlayer(available && recording ? { uri: recording.fileUri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(1);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  }, []);

  // Rewind when playback reaches the end so Play starts again from the beginning.
  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0).catch(() => undefined);
  }, [status.didJustFinish, player]);

  if (result.status === 'loading' && !result.data)
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  if (result.status === 'error') {
    return (
      <Screen>
        <ScreenHeader back title="Recording" />
        <Banner title="This recording could not be loaded" tone="error">
          {result.error.message}
        </Banner>
      </Screen>
    );
  }
  if (!recording) {
    return (
      <Screen>
        <ScreenHeader back title="Recording" />
        <EmptyState body="It may have been deleted." icon="musical-note-outline" title="Recording not found" />
      </Screen>
    );
  }
  const rehearsal = result.data?.rehearsal ?? null;
  const durationS = status.duration > 0 ? status.duration : recording.durationMs / 1000;
  const progress = durationS > 0 ? Math.min(1, status.currentTime / durationS) : 0;

  const seekBy = (delta: number) => {
    player.seekTo(Math.max(0, Math.min(durationS, status.currentTime + delta))).catch(() => undefined);
  };

  const saveName = async () => {
    try {
      await rehearsals.renameRecording(recording.id, name);
      setRenaming(false);
      setError(null);
      result.reload();
    } catch (e) {
      setError(e instanceof ValidationError ? e.issues.join(' ') : 'The name could not be saved.');
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this recording?', `“${recording.name}” will be permanently deleted from this phone. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            player.pause();
            await deleteRecording(rehearsals, expoRecordingStore, recording.id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'The recording could not be deleted.');
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader back subtitle={`Saved ${new Date(recording.createdAt).toLocaleString()}`} title={recording.name} />
      {recording.status === 'recovered' ? (
        <Banner tone="warning">This take was recovered after an interruption. It may be incomplete or unplayable.</Banner>
      ) : null}
      {!available ? (
        <Banner title="Audio file missing" tone="error">
          The recording’s file is no longer on this device (it may have been removed by the system or another app). You can delete this
          entry.
        </Banner>
      ) : status.error ? (
        <Banner title="Playback failed" tone="error">
          {status.error}
        </Banner>
      ) : null}
      {error ? (
        <View style={{ marginTop: spacing.sm }}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      <View style={styles.art}>
        <Icon name="pulse" size={44} />
      </View>
      <View style={styles.time}>
        <AppText variant="title">{formatDuration(status.currentTime * 1000)}</AppText>
        <AppText color={colors.textSecondary} variant="small">
          {' '}
          / {formatDuration(durationS * 1000)}
        </AppText>
      </View>

      <Pressable
        accessibilityHint="Tap a position to seek"
        accessibilityLabel="Playback position"
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: Math.round(durationS), now: Math.round(status.currentTime) }}
        disabled={!available || !status.isLoaded}
        onAccessibilityAction={(e) => seekBy(e.nativeEvent.actionName === 'increment' ? 10 : -10)}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(Math.max(1, e.nativeEvent.layout.width))}
        onPress={(e) => player.seekTo((e.nativeEvent.locationX / trackWidth) * durationS).catch(() => undefined)}
        style={styles.seekTouch}
      >
        <View style={styles.seek}>
          <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>

      <View style={styles.controls}>
        <IconButton disabled={!available || !status.isLoaded} icon="play-back" label="Back 10 seconds" onPress={() => seekBy(-10)} />
        <IconButton
          disabled={!available || !status.isLoaded}
          filled
          icon={status.playing ? 'pause' : 'play'}
          label={status.playing ? 'Pause playback' : 'Play recording'}
          onPress={() => (status.playing ? player.pause() : player.play())}
          size={68}
        />
        <IconButton disabled={!available || !status.isLoaded} icon="play-forward" label="Forward 10 seconds" onPress={() => seekBy(10)} />
      </View>
      {available && !status.isLoaded && !status.error ? (
        <AppText color={colors.textSecondary} style={{ textAlign: 'center' }} variant="caption">
          Loading audio…
        </AppText>
      ) : null}

      {rehearsal ? (
        <Card style={{ gap: spacing.xs, marginTop: spacing.lg }} tinted>
          <AppText variant="subheading">Session details</AppText>
          <Detail label="Rehearsal" value={rehearsal.title} />
          <Detail label="Song" value={rehearsal.songTitle ?? '—'} />
          <Detail
            label="Key change"
            value={
              rehearsal.originalKey && rehearsal.playedKey ? `${keyLabel(rehearsal.originalKey)} → ${keyLabel(rehearsal.playedKey)}` : '—'
            }
          />
          <Detail
            label="Transposition"
            value={rehearsal.originalKey ? `${formatOffset(rehearsal.transpositionSemitones)} semitones` : '—'}
          />
          <Detail label="File size" value={recording.sizeBytes ? `${(recording.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '—'} />
        </Card>
      ) : null}

      {renaming ? (
        <Card style={{ marginTop: spacing.md }}>
          <TextField autoFocus label="Recording name" maxLength={120} onChangeText={setName} value={name} />
          <View style={styles.row}>
            <Button label="Cancel" onPress={() => setRenaming(false)} style={{ flex: 1 }} variant="secondary" />
            <Button label="Save name" onPress={saveName} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Button
            label="Rename"
            onPress={() => {
              setName(recording.name);
              setRenaming(true);
            }}
            style={{ flex: 1 }}
            variant="secondary"
          />
          <Button label="Delete" onPress={confirmDelete} style={{ flex: 1 }} variant="ghost" />
        </View>
      )}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
      <AppText color={colors.textSecondary} variant="small">
        {label}
      </AppText>
      <AppText numberOfLines={1} style={{ flexShrink: 1 }} variant="bodyStrong">
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  art: {
    alignSelf: 'center',
    width: 128,
    height: 128,
    borderRadius: 32,
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.pale,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  time: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  seekTouch: { paddingVertical: 18 },
  seek: { height: 6, borderRadius: radius.pill, backgroundColor: colors.pale, overflow: 'hidden' },
  seekFill: { height: '100%', backgroundColor: colors.primary },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.xs },
});
