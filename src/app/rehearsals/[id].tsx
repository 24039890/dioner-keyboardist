import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, EmptyState, LoadingState, SectionHeading } from '@/components/ui/primitives';
import { formatOffset, keyLabel, targetKey, transposeLine } from '@/features/music-theory';
import { expoRecordingStore } from '@/features/rehearsals/services/expoRecordingStore';
import { deleteRehearsal, formatDuration, isRecordingAvailable } from '@/features/rehearsals/services/recordingService';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing, typography } from '@/theme/tokens';

export default function RehearsalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rehearsals, songs } = useRepositories();
  const [error, setError] = useState<string | null>(null);
  const result = useFocusedQuery(
    useCallback(async () => {
      const rehearsal = await rehearsals.get(id);
      if (!rehearsal) return null;
      const [recordings, song] = await Promise.all([
        rehearsals.listRecordings(id),
        rehearsal.songId ? songs.get(rehearsal.songId) : Promise.resolve(null),
      ]);
      return { rehearsal, recordings, song };
    }, [rehearsals, songs, id]),
  );

  if (result.status === 'loading' && !result.data)
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  if (result.status === 'error') {
    return (
      <Screen>
        <ScreenHeader back title="Rehearsal" />
        <Banner title="This rehearsal could not be loaded" tone="error">
          {result.error.message}
        </Banner>
      </Screen>
    );
  }
  if (!result.data) {
    return (
      <Screen>
        <ScreenHeader back title="Rehearsal" />
        <EmptyState body="It may have been deleted." icon="mic-outline" title="Rehearsal not found" />
      </Screen>
    );
  }
  const { rehearsal, recordings, song } = result.data;
  const chartKey = rehearsal.originalKey ? targetKey(rehearsal.originalKey, rehearsal.transpositionSemitones) : null;

  const confirmDelete = () => {
    Alert.alert(
      'Delete this rehearsal?',
      `This permanently deletes “${rehearsal.title}” and its ${recordings.length} recording file${recordings.length === 1 ? '' : 's'} from this phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRehearsal(rehearsals, expoRecordingStore, rehearsal.id);
              router.back();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'The rehearsal could not be deleted.');
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader back subtitle={new Date(rehearsal.createdAt).toLocaleString()} title={rehearsal.title} />
      {error ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      <Card style={{ gap: spacing.xs }} tinted>
        <Row label="Song" value={rehearsal.songTitle ?? 'None linked'} />
        <Row label="Original key" value={rehearsal.originalKey ? keyLabel(rehearsal.originalKey) : '—'} />
        <Row label="Playing key" value={rehearsal.playedKey ? keyLabel(rehearsal.playedKey) : '—'} />
        <Row label="Transposition" value={rehearsal.originalKey ? `${formatOffset(rehearsal.transpositionSemitones)} semitones` : '—'} />
      </Card>

      <Button
        icon="mic"
        label="Record a take"
        onPress={() => router.push({ pathname: '/rehearsals/record/[id]', params: { id: rehearsal.id } })}
        style={{ marginTop: spacing.md }}
      />

      <SectionHeading detail={`${recordings.length} saved · ${formatDuration(rehearsal.totalDurationMs)}`} title="Recordings" />
      {recordings.length === 0 ? (
        <AppText color={colors.textSecondary} variant="small">
          No recordings yet. Takes are saved privately on this phone.
        </AppText>
      ) : (
        recordings.map((rec) => {
          const available = isRecordingAvailable(expoRecordingStore, rec);
          return (
            <ListRow
              icon={available ? 'play' : 'alert-circle-outline'}
              key={rec.id}
              onPress={() => router.push({ pathname: '/rehearsals/playback/[id]', params: { id: rec.id } })}
              subtitle={[
                formatDuration(rec.durationMs),
                rec.status === 'recovered' ? 'Recovered after interruption — may be incomplete' : null,
                available ? null : rec.remotePath ? 'In cloud backup' : 'File missing',
              ]
                .filter(Boolean)
                .join(' · ')}
              title={rec.name}
            />
          );
        })
      )}

      {song && chartKey && rehearsal.originalKey ? (
        <>
          <SectionHeading detail={`In ${keyLabel(chartKey)}`} title="Chord chart" />
          <Card style={{ gap: spacing.sm }}>
            {song.sections.map((s) => (
              <View key={s.id}>
                <AppText color={colors.textSecondary} variant="eyebrow">
                  {s.label}
                </AppText>
                <AppText color={colors.primaryDark} style={typography.chord}>
                  {transposeLine(s.chords, rehearsal.transpositionSemitones, chartKey).text}
                </AppText>
              </View>
            ))}
            {song.sections.length === 0 ? (
              <AppText color={colors.textSecondary} variant="small">
                The linked song has no chart yet.
              </AppText>
            ) : null}
          </Card>
        </>
      ) : null}

      {rehearsal.notes ? (
        <>
          <SectionHeading title="Rehearsal notes" />
          <Card>
            <AppText variant="small">{rehearsal.notes}</AppText>
          </Card>
        </>
      ) : null}

      <Button label="Delete rehearsal" onPress={confirmDelete} style={{ marginTop: spacing.xl }} variant="ghost" />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText color={colors.textSecondary} variant="small">
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
});
