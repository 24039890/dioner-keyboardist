import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, EmptyState, IconButton, LoadingState, SectionHeading } from '@/components/ui/primitives';
import { TranspositionWorkspace, transposeChart } from '@/features/songs/components/TranspositionWorkspace';
import { formatOffset, keyLabel } from '@/features/music-theory';
import { formatDuration } from '@/features/rehearsals/services/recordingService';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { songs, rehearsals } = useRepositories();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useFocusedQuery(
    useCallback(async () => {
      const song = await songs.get(id);
      const history = song ? await rehearsals.list({ songId: id }) : [];
      return { song, history };
    }, [songs, rehearsals, id]),
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
        <ScreenHeader back title="Song" />
        <Banner title="This song could not be loaded" tone="error">
          {result.error.message}
        </Banner>
      </Screen>
    );
  }
  const song = result.data?.song;
  if (!song) {
    return (
      <Screen>
        <ScreenHeader back title="Song" />
        <EmptyState body="It may have been deleted." icon="musical-notes-outline" title="Song not found" />
      </Screen>
    );
  }
  const history = result.data?.history ?? [];

  const toggleSaved = async () => {
    try {
      await songs.setSaved(song.id, !song.isSaved);
      result.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the song.');
    }
  };

  const applyTransposition = () => {
    const chart = transposeChart(song.sections, song.originalKey, offset);
    Alert.alert(
      `Rewrite chart in ${keyLabel(chart.target)}?`,
      `The saved chart and original key will change from ${keyLabel(song.originalKey)} to ${keyLabel(chart.target)}. To only rehearse in another key, use “Rehearse in this key” instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rewrite chart',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await songs.update(song.id, {
                ...song,
                originalKey: chart.target,
                sections: chart.sections.map((s) => ({ label: s.label, chords: s.transposed })),
              });
              setOffset(0);
              result.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'The chart could not be saved. Nothing was changed.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this song?',
      `“${song.title}” will be removed from your songbook. Rehearsals keep their recordings but lose the link to this song.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await songs.remove(song.id);
              router.back();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'The song could not be deleted.');
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader
        action={
          <IconButton
            icon={song.isSaved ? 'bookmark' : 'bookmark-outline'}
            label={song.isSaved ? 'Remove from saved' : 'Save song'}
            onPress={toggleSaved}
          />
        }
        back
        subtitle={song.artist ?? 'User-created chart'}
        title={song.title}
      />
      {error ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      <Card style={styles.summary} tinted>
        <View style={{ flex: 1 }}>
          <AppText color={colors.textSecondary} variant="caption">
            Original key
          </AppText>
          <AppText variant="subheading">{keyLabel(song.originalKey)}</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText color={colors.textSecondary} variant="caption">
            Song number
          </AppText>
          <AppText variant="subheading">{song.songNumber ?? '—'}</AppText>
        </View>
        <Button label="Edit" onPress={() => router.push({ pathname: '/songs/edit/[id]', params: { id: song.id } })} variant="secondary" />
      </Card>

      <TranspositionWorkspace offset={offset} onOffsetChange={setOffset} originalKey={song.originalKey} sections={song.sections} />

      <View style={styles.actions}>
        <Button
          icon="mic-outline"
          label={offset === 0 ? 'Rehearse this song' : `Rehearse in ${formatOffset(offset)}`}
          onPress={() => router.push({ pathname: '/rehearsals/create', params: { songId: song.id, offset: String(offset) } })}
        />
        {offset !== 0 && song.sections.length > 0 ? (
          <Button label="Rewrite saved chart in this key…" loading={busy} onPress={applyTransposition} variant="ghost" />
        ) : null}
      </View>

      {song.tags.length ? (
        <AppText color={colors.textSecondary} style={{ marginTop: spacing.md }} variant="small">
          Tags: {song.tags.join(', ')}
        </AppText>
      ) : null}

      {song.notes ? (
        <>
          <SectionHeading title="Musician notes" />
          <Card>
            <AppText variant="small">{song.notes}</AppText>
          </Card>
        </>
      ) : null}

      {song.lyrics ? (
        <>
          <SectionHeading title="Lyrics" />
          <Card>
            <AppText variant="small">{song.lyrics}</AppText>
          </Card>
        </>
      ) : null}

      <SectionHeading title="Source" />
      <AppText color={colors.textSecondary} variant="small">
        {song.sourceAttribution ?? 'No source recorded (user-created).'}
      </AppText>

      <SectionHeading detail={`${history.length} on this device`} title="Rehearsal history" />
      {history.length === 0 ? (
        <AppText color={colors.textSecondary} variant="small">
          No rehearsals for this song yet.
        </AppText>
      ) : (
        history.map((r) => (
          <ListRow
            icon="mic-outline"
            key={r.id}
            onPress={() => router.push({ pathname: '/rehearsals/[id]', params: { id: r.id } })}
            subtitle={`${new Date(r.createdAt).toLocaleDateString()} · ${r.recordingCount} recording${r.recordingCount === 1 ? '' : 's'} · ${formatDuration(r.totalDurationMs)}`}
            title={r.title}
          />
        ))
      )}

      <Button label="Delete song" onPress={confirmDelete} style={{ marginTop: spacing.xl }} variant="ghost" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  actions: { gap: spacing.xs, marginTop: spacing.sm },
});
