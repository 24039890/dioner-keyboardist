import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/ui/forms';
import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Chip, EmptyState, IconButton, LoadingState, SectionHeading } from '@/components/ui/primitives';
import { keyShortLabel } from '@/features/music-theory';
import { formatDuration } from '@/features/rehearsals/services/recordingService';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

type Range = 'all' | 'week' | 'month';

function sinceFor(range: Range): string | undefined {
  if (range === 'all') return undefined;
  const d = new Date();
  d.setDate(d.getDate() - (range === 'week' ? 7 : 30));
  return d.toISOString();
}

export default function RehearsalsScreen() {
  const { rehearsals } = useRepositories();
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('all');
  const result = useFocusedQuery(
    useCallback(
      async () => ({ list: await rehearsals.list({ query, since: sinceFor(range) }), totals: await rehearsals.count() }),
      [rehearsals, query, range],
    ),
  );
  const list = result.data?.list ?? [];
  const totals = result.data?.totals;
  const filtering = query.trim().length > 0 || range !== 'all';

  return (
    <Screen withTabBar>
      <ScreenHeader
        action={<IconButton filled icon="add" label="New rehearsal" onPress={() => router.push('/rehearsals/create')} />}
        subtitle="Recorded and stored on this device"
        title="Rehearsals"
      />
      {totals ? (
        <Banner tone="offline">{`Works offline · ${totals.recordings} recording${totals.recordings === 1 ? '' : 's'} stored privately on this phone`}</Banner>
      ) : null}
      <View style={{ height: spacing.sm }} />
      <SearchField onChangeText={setQuery} placeholder="Search rehearsals, songs or notes" value={query} />
      <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
        <Chip label="All" onPress={() => setRange('all')} selected={range === 'all'} />
        <Chip label="Last 7 days" onPress={() => setRange('week')} selected={range === 'week'} />
        <Chip label="Last 30 days" onPress={() => setRange('month')} selected={range === 'month'} />
      </ScrollView>

      <SectionHeading detail={result.status === 'ready' ? `${list.length} shown` : undefined} title="History" />
      {result.status === 'error' ? (
        <View style={{ gap: spacing.xs }}>
          <Banner title="Rehearsals could not be loaded" tone="error">
            {result.error.message}
          </Banner>
          <Button label="Try again" onPress={result.reload} variant="secondary" />
        </View>
      ) : result.status === 'loading' && !result.data ? (
        <LoadingState label="Loading rehearsals…" />
      ) : list.length === 0 ? (
        filtering ? (
          <EmptyState body="Nothing matches your search or date filter." icon="search-outline" title="No matching rehearsals" />
        ) : (
          <EmptyState
            action={{ label: 'New rehearsal', onPress: () => router.push('/rehearsals/create'), icon: 'mic' }}
            body="Create a rehearsal, link a song and the key you play it in, then record takes."
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
                <AppText color={colors.primaryDark} variant="caption">
                  {formatDuration(r.totalDurationMs)}
                </AppText>
              }
            />
          ))}
        </View>
      )}
      <Button icon="mic" label="New rehearsal" onPress={() => router.push('/rehearsals/create')} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.xs, paddingVertical: spacing.sm },
  list: { borderTopWidth: 1, borderTopColor: colors.border },
});
