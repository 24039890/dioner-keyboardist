import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/ui/forms';
import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Chip, EmptyState, IconButton, LoadingState, SectionHeading } from '@/components/ui/primitives';
import type { SongFilter } from '@/db/repositories/songs';
import { keyLabel } from '@/features/music-theory';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

type FilterChip = 'all' | 'saved' | 'major' | 'minor';

export default function SongsScreen() {
  const { songs } = useRepositories();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<FilterChip>('all');

  const result = useFocusedQuery(
    useCallback(() => {
      const filter: SongFilter = {
        query,
        savedOnly: chip === 'saved',
        mode: chip === 'major' || chip === 'minor' ? chip : undefined,
      };
      return songs.list(filter);
    }, [songs, query, chip]),
  );
  const list = result.data ?? [];
  const filtering = query.trim().length > 0 || chip !== 'all';

  return (
    <Screen withTabBar>
      <ScreenHeader
        action={<IconButton filled icon="add" label="Create song" onPress={() => router.push('/songs/create')} />}
        subtitle="Your charts and progressions"
        title="Songs"
      />
      <SearchField onChangeText={setQuery} placeholder="Search title, artist, number, tag or chord" value={query} />
      <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
        {(
          [
            ['all', 'All songs'],
            ['saved', 'Saved'],
            ['major', 'Major keys'],
            ['minor', 'Minor keys'],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} label={label} onPress={() => setChip(id)} selected={chip === id} />
        ))}
      </ScrollView>

      <SectionHeading
        detail={result.status === 'ready' ? `${list.length} song${list.length === 1 ? '' : 's'} on this device` : undefined}
        title="Your songbook"
      />

      {result.status === 'error' ? (
        <View style={{ gap: spacing.xs }}>
          <Banner title="Songs could not be loaded" tone="error">
            {result.error.message}
          </Banner>
          <Button label="Try again" onPress={result.reload} variant="secondary" />
        </View>
      ) : result.status === 'loading' && !result.data ? (
        <LoadingState label="Loading songs…" />
      ) : list.length === 0 ? (
        filtering ? (
          <EmptyState body="No songs on this device match your search or filter." icon="search-outline" title="No matching songs" />
        ) : (
          <EmptyState
            action={{ label: 'Create your first song', onPress: () => router.push('/songs/create'), icon: 'add' }}
            body="Add a chart with its key and chords. You can transpose it to any key and attach rehearsals."
            icon="musical-notes-outline"
            title="Your songbook is empty"
          />
        )
      ) : (
        <View style={styles.list}>
          {list.map((s) => (
            <ListRow
              detail={s.firstLine}
              key={s.id}
              leading={
                <View style={styles.badge}>
                  <AppText color={colors.primary} variant="heading">
                    {s.title.charAt(0).toUpperCase()}
                  </AppText>
                </View>
              }
              onPress={() => router.push({ pathname: '/songs/[id]', params: { id: s.id } })}
              subtitle={[s.artist, s.songNumber ? `No. ${s.songNumber}` : null, keyLabel(s.originalKey)].filter(Boolean).join(' · ')}
              title={s.isSaved ? `${s.title}  ★` : s.title}
            />
          ))}
        </View>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Banner tone="info">
          Songs are stored on this phone and work offline. Only add lyrics or charts you have permission to use, and note the source.
        </Banner>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.xs, paddingVertical: spacing.sm },
  list: { borderTopWidth: 1, borderTopColor: colors.border },
  badge: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.light, alignItems: 'center', justifyContent: 'center' },
});
