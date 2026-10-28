import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/ui/forms';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Chip, EmptyState, Icon, LoadingState, SectionHeading } from '@/components/ui/primitives';
import type { VideoHistoryItem } from '@/db/repositories/videos';
import {
  type VideoCategory,
  type VideoResult,
  type VideoSearchResult,
  formatVideoDuration,
  getVideoProvider,
} from '@/features/learning/videoProviders';
import { useRepositories, useSettings } from '@/providers/data';
import { colors, radius, spacing } from '@/theme/tokens';

type Failure = Extract<VideoSearchResult, { ok: false }>;

const FAILURE_TITLE: Record<Failure['reason'], string> = {
  'not-configured': 'Video tutorials are not connected',
  network: 'You appear to be offline',
  'provider-error': 'Video search is unavailable right now',
  'rate-limited': 'Too many searches',
  'invalid-request': 'Search could not run',
};

export default function VideoTutorialsScreen() {
  const provider = getVideoProvider();
  const { videos } = useRepositories();
  const { settings } = useSettings();
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VideoResult[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [status, setStatus] = useState<Map<string, VideoHistoryItem>>(new Map());
  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const difficulty = settings.learningPath;

  const refreshHistory = useCallback(async () => {
    setHistory(await videos.recent(10));
  }, [videos]);

  useEffect(() => {
    let active = true;
    provider.categories().then((r) => {
      if (!active) return;
      if (r.ok) setCategories(r.categories);
      else setFailure(r);
    });
    videos.recent(10).then(
      (h) => active && setHistory(h),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [provider, videos]);

  const run = async (opts: { category: string | null; query: string; pageToken?: string }) => {
    setLoading(true);
    setFailure(null);
    const r = await provider.search({ query: opts.query, category: opts.category ?? undefined, difficulty, pageToken: opts.pageToken });
    setLoading(false);
    if (!r.ok) {
      setFailure(r);
      return;
    }
    const merged = opts.pageToken ? [...results, ...r.results] : r.results;
    setResults(merged);
    setNextPage(r.nextPageToken);
    setStatus(await videos.statusFor(merged.map((v) => v.id)));
  };

  const pickCategory = (id: string) => {
    const next = category === id ? null : id;
    setCategory(next);
    if (next || query.trim()) void run({ category: next, query });
    else setResults([]);
  };

  const open = async (v: VideoResult) => {
    await videos.markOpened(v);
    setStatus(await videos.statusFor(results.map((x) => x.id)));
    await refreshHistory();
    router.push({ pathname: '/learn/watch/[id]', params: { id: v.id, title: v.title, channel: v.channel } });
  };

  const toggleWatched = async (id: string, watched: boolean) => {
    await videos.setWatched(id, watched);
    setStatus(await videos.statusFor(results.map((x) => x.id)));
    await refreshHistory();
  };

  if (!provider.isConfigured()) {
    return (
      <Screen>
        <ScreenHeader back subtitle="Lessons from YouTube" title="Video tutorials" />
        <Banner title={FAILURE_TITLE['not-configured']} tone="info">
          This build is not connected to the DIONER server, so no videos are shown. Lessons and exercises work without it.
        </Banner>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        back
        subtitle={`${difficulty === 'beginner' ? 'Beginner' : 'Experienced'} level · from YouTube`}
        title="Video tutorials"
      />
      <SearchField onChangeText={setQuery} placeholder="Search tutorials (e.g. worship chords)" value={query} />
      <Button
        disabled={!query.trim() && !category}
        icon="search"
        label="Search"
        loading={loading && results.length === 0}
        onPress={() => void run({ category, query })}
        style={{ marginTop: spacing.xs }}
      />
      <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
        {categories.map((c) => (
          <Chip key={c.id} label={c.title} onPress={() => pickCategory(c.id)} selected={category === c.id} />
        ))}
      </ScrollView>

      {failure ? (
        <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
          <Banner title={FAILURE_TITLE[failure.reason]} tone={failure.reason === 'network' ? 'offline' : 'warning'}>
            {failure.message}
          </Banner>
          {failure.reason === 'network' || failure.reason === 'rate-limited' ? (
            <Button label="Try again" onPress={() => void run({ category, query })} variant="secondary" />
          ) : null}
        </View>
      ) : null}

      {loading && results.length === 0 ? (
        <LoadingState label="Searching tutorials…" />
      ) : results.length === 0 && !failure ? (
        <EmptyState
          body="Pick a topic above or search for something you want to learn."
          icon="play-circle-outline"
          title="Find a tutorial"
        />
      ) : (
        results.map((v) => (
          <VideoRow
            key={v.id}
            onOpen={() => void open(v)}
            onToggleWatched={(w) => void toggleWatched(v.id, w)}
            opened={status.has(v.id)}
            video={v}
            watched={status.get(v.id)?.watched ?? false}
          />
        ))
      )}
      {nextPage && results.length > 0 ? (
        <Button
          label="Load more"
          loading={loading}
          onPress={() => void run({ category, query, pageToken: nextPage })}
          style={{ marginTop: spacing.sm }}
          variant="secondary"
        />
      ) : null}

      {history.length ? (
        <>
          <SectionHeading detail="On this phone" title="Recently opened" />
          {history.map((h) => (
            <Pressable
              accessibilityLabel={`${h.title}${h.watched ? ', watched' : ''}`}
              accessibilityRole="button"
              key={h.videoId}
              onPress={() => router.push({ pathname: '/learn/watch/[id]', params: { id: h.videoId, title: h.title, channel: h.channel } })}
              style={styles.historyRow}
            >
              <Icon name={h.watched ? 'checkmark-circle' : 'time-outline'} size={18} />
              <AppText numberOfLines={1} style={{ flex: 1 }} variant="small">
                {h.title}
              </AppText>
            </Pressable>
          ))}
        </>
      ) : null}

      <AppText color={colors.textSecondary} style={{ marginTop: spacing.lg }} variant="caption">
        Videos are from YouTube and play in YouTube’s own player inside DIONER. DIONER does not download or host them.
      </AppText>
    </Screen>
  );
}

function VideoRow({
  video,
  opened,
  watched,
  onOpen,
  onToggleWatched,
}: {
  video: VideoResult;
  opened: boolean;
  watched: boolean;
  onOpen: () => void;
  onToggleWatched: (watched: boolean) => void;
}) {
  const duration = formatVideoDuration(video.durationSeconds);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityHint="Opens the video in YouTube"
        accessibilityLabel={`Play ${video.title}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={styles.rowMain}
      >
        {video.thumbnailUrl ? (
          <Image accessibilityIgnoresInvertColors source={{ uri: video.thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Icon name="play" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText numberOfLines={2} variant="bodyStrong">
            {video.title}
          </AppText>
          <AppText color={colors.textSecondary} numberOfLines={1} variant="caption">
            {[video.channel, duration].filter(Boolean).join(' · ')}
          </AppText>
          {watched ? (
            <AppText color={colors.primaryDark} variant="caption">
              ✓ Watched
            </AppText>
          ) : opened ? (
            <AppText color={colors.textSecondary} variant="caption">
              Opened
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {opened ? (
        <Pressable
          accessibilityLabel={watched ? 'Mark as not watched' : 'Mark as watched'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onToggleWatched(!watched)}
          style={styles.watchBtn}
        >
          <Icon name={watched ? 'checkmark-circle' : 'ellipse-outline'} size={24} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.xs, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  rowMain: { flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  thumb: { width: 120, height: 68, borderRadius: radius.sm, backgroundColor: colors.light },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  watchBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
