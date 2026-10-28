import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/ui/forms';
import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Chip, EmptyState, IconButton, LoadingState, SectionHeading } from '@/components/ui/primitives';
import { keyShortLabel } from '@/features/music-theory';
import { SongKeySheet } from '@/features/songs/components/SongKeySheet';
import { type SongKeyResult, type SongKeySearchResult, getSongKeySearch } from '@/features/songs/songKeySearch';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

export default function SongsScreen() {
  const { songs } = useRepositories();
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const result = useFocusedQuery(useCallback(() => songs.list({ query, savedOnly }), [songs, query, savedOnly]));
  const list = result.data ?? [];
  const filtering = query.trim().length > 0 || savedOnly;
  const online = useOnlineSongSearch(query);
  const hasSongs = list.length > 0 || filtering || online.enabled;
  const [picked, setPicked] = useState<SongKeyResult | null>(null);
  const [saving, setSaving] = useState(false);

  const saveFound = async (found: SongKeyResult) => {
    if (!found.key) return;
    setSaving(true);
    try {
      const song = await songs.create({
        title: found.title,
        artist: found.artist,
        originalKey: found.key,
        sourceAttribution: 'Key from GetSongBPM.com',
        sections: [],
      });
      setPicked(null);
      router.push({ pathname: '/songs/[id]', params: { id: song.id } });
    } catch (e) {
      Alert.alert('Could not save the song', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen withTabBar>
      <ScreenHeader action={<IconButton filled icon="add" label="Add song" onPress={() => router.push('/songs/create')} />} title="Songs" />

      {hasSongs ? (
        <View style={styles.tools}>
          <View style={{ flex: 1 }}>
            <SearchField
              onChangeText={setQuery}
              placeholder={online.enabled ? 'Search any song' : 'Search songs or chords'}
              value={query}
            />
          </View>
          <Chip label="★ Saved" onPress={() => setSavedOnly((v) => !v)} selected={savedOnly} />
        </View>
      ) : null}

      {online.enabled && query.trim().length >= 2 ? <OnlineResults onPick={setPicked} state={online.state} /> : null}

      {online.enabled && query.trim().length >= 2 && !savedOnly ? <SectionHeading title="My songs" /> : null}

      {result.status === 'error' ? (
        <View style={{ gap: spacing.xs }}>
          <Banner title="Songs could not be loaded" tone="error">
            {result.error.message}
          </Banner>
          <Button label="Try again" onPress={result.reload} variant="secondary" />
        </View>
      ) : result.status === 'loading' && !result.data ? (
        <LoadingState />
      ) : list.length === 0 ? (
        filtering ? (
          online.enabled && !savedOnly ? (
            <AppText color={colors.textSecondary} variant="small">
              None of your saved songs match.
            </AppText>
          ) : (
            <EmptyState body="Try another word or chord." icon="search-outline" title="No matching songs" />
          )
        ) : (
          <EmptyState
            action={{ label: 'Add a song', onPress: () => router.push('/songs/create'), icon: 'add' }}
            body="Save a song's key and chords, then play it in any key."
            icon="musical-notes-outline"
            title="No songs yet"
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
                  <AppText color={colors.primary} variant="subheading">
                    {keyShortLabel(s.originalKey)}
                  </AppText>
                </View>
              }
              onPress={() => router.push({ pathname: '/songs/[id]', params: { id: s.id } })}
              subtitle={[s.artist, s.songNumber ? `No. ${s.songNumber}` : null].filter(Boolean).join(' · ') || null}
              title={s.isSaved ? `${s.title} ★` : s.title}
            />
          ))}
        </View>
      )}

      <SongKeySheet onClose={() => setPicked(null)} onSave={(s) => void saveFound(s)} saving={saving} song={picked} />
    </Screen>
  );
}

type OnlineState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; result: SongKeySearchResult };

/** Debounced online song-key search; disabled when the app has no backend URL. */
function useOnlineSongSearch(query: string): { enabled: boolean; state: OnlineState } {
  const search = getSongKeySearch();
  const q = query.trim();
  const [answer, setAnswer] = useState<{ query: string; result: SongKeySearchResult } | null>(null);
  useEffect(() => {
    if (!search || q.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      void search.search(q).then((result) => {
        if (current) setAnswer({ query: q, result });
      });
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q, search]);
  const state: OnlineState =
    !search || q.length < 2 ? { status: 'idle' } : answer?.query === q ? { status: 'done', result: answer.result } : { status: 'loading' };
  return { enabled: search !== null, state };
}

function OnlineResults({ state, onPick }: { state: OnlineState; onPick: (song: SongKeyResult) => void }) {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <LoadingState label="Finding songs…" />;
  const { result } = state;
  if (!result.ok) {
    return (
      <View style={{ marginBottom: spacing.sm }}>
        <Banner tone={result.reason === 'not-configured' ? 'info' : 'warning'}>{result.message}</Banner>
      </View>
    );
  }
  return (
    <View style={{ marginBottom: spacing.md }}>
      {result.results.length === 0 ? (
        <AppText color={colors.textSecondary} variant="small">
          No songs found. Check the spelling or try fewer words.
        </AppText>
      ) : (
        <View style={styles.list}>
          {result.results.map((s) => (
            <ListRow
              key={s.id}
              leading={
                <View style={styles.badge}>
                  <AppText color={colors.primary} variant="subheading">
                    {s.key ? keyShortLabel(s.key) : '?'}
                  </AppText>
                </View>
              }
              onPress={() => onPick(s)}
              subtitle={[s.artist, s.year].filter(Boolean).join(' · ') || null}
              title={s.title}
            />
          ))}
        </View>
      )}
      <AppText color={colors.textSecondary} style={{ marginTop: spacing.xs }} variant="caption">
        {result.attribution}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  list: { borderTopWidth: 1, borderTopColor: colors.border },
  badge: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.light, alignItems: 'center', justifyContent: 'center' },
});
