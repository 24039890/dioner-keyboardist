import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/ui/forms';
import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, EmptyState, IconButton, LoadingState } from '@/components/ui/primitives';
import { keyShortLabel } from '@/features/music-theory';
import { formatDuration } from '@/features/rehearsals/services/recordingService';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

export default function RehearsalsScreen() {
  const { rehearsals } = useRepositories();
  const [query, setQuery] = useState('');
  const result = useFocusedQuery(useCallback(() => rehearsals.list({ query }), [rehearsals, query]));
  const list = result.data ?? [];
  const filtering = query.trim().length > 0;

  return (
    <Screen withTabBar>
      <ScreenHeader
        action={<IconButton filled icon="add" label="New rehearsal" onPress={() => router.push('/rehearsals/create')} />}
        title="Rehearsals"
      />

      {list.length > 0 || filtering ? (
        <View style={{ marginBottom: spacing.sm }}>
          <SearchField onChangeText={setQuery} placeholder="Search rehearsals" value={query} />
        </View>
      ) : null}

      {result.status === 'error' ? (
        <View style={{ gap: spacing.xs }}>
          <Banner title="Rehearsals could not be loaded" tone="error">
            {result.error.message}
          </Banner>
          <Button label="Try again" onPress={result.reload} variant="secondary" />
        </View>
      ) : result.status === 'loading' && !result.data ? (
        <LoadingState />
      ) : list.length === 0 ? (
        filtering ? (
          <EmptyState body="Try another word." icon="search-outline" title="No matching rehearsals" />
        ) : (
          <EmptyState
            action={{ label: 'New rehearsal', onPress: () => router.push('/rehearsals/create'), icon: 'mic' }}
            body="Record your band or yourself and keep the takes with the song and key."
            icon="mic-outline"
            title="No rehearsals yet"
          />
        )
      ) : (
        <View style={styles.list}>
          {list.map((r) => (
            <ListRow
              icon="play"
              key={r.id}
              onPress={() => router.push({ pathname: '/rehearsals/[id]', params: { id: r.id } })}
              subtitle={[
                r.songTitle,
                r.originalKey && r.playedKey ? `${keyShortLabel(r.originalKey)} → ${keyShortLabel(r.playedKey)}` : null,
                new Date(r.createdAt).toLocaleDateString(),
              ]
                .filter(Boolean)
                .join(' · ')}
              title={r.title}
              trailing={
                r.recordingCount > 0 ? (
                  <AppText color={colors.primaryDark} variant="caption">
                    {formatDuration(r.totalDurationMs)}
                  </AppText>
                ) : undefined
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: colors.border },
});
