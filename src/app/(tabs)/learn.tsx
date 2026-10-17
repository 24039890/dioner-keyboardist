import { useCallback } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Card, Eyebrow, Icon, LoadingState, ProgressBar, SectionHeading } from '@/components/ui/primitives';
import { type LearningPath, lessonsForPath } from '@/features/learning/curriculum';
import { getVideoProvider } from '@/features/learning/videoProviders';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories, useSettings } from '@/providers/data';
import { colors, radius, spacing } from '@/theme/tokens';

const PATHS: { id: LearningPath; label: string; detail: string }[] = [
  { id: 'beginner', label: 'Beginner', detail: 'Build strong foundations' },
  { id: 'experienced', label: 'Experienced', detail: 'Develop harmonic fluency' },
];

export default function LearnScreen() {
  const { progress } = useRepositories();
  const { settings, update } = useSettings();
  const path = settings.learningPath;
  const lessons = lessonsForPath(path);
  const result = useFocusedQuery(useCallback(() => progress.all(), [progress]));
  const byId = new Map((result.data ?? []).map((p) => [p.lessonId, p]));
  const done = lessons.filter((l) => byId.get(l.id)?.completedAt).length;
  const videos = getVideoProvider();

  return (
    <Screen withTabBar>
      <ScreenHeader subtitle="Build skill you can use on stage" title="Learn Keyboard" />

      <Card style={styles.progress} tinted>
        <View style={{ flex: 1, gap: 4 }}>
          <Eyebrow>{path === 'beginner' ? 'Beginner' : 'Experienced'} path</Eyebrow>
          <AppText variant="heading">{`${done} of ${lessons.length} lessons complete`}</AppText>
          <ProgressBar label="Path progress" value={lessons.length ? done / lessons.length : 0} />
        </View>
      </Card>

      <View style={styles.paths}>
        {PATHS.map((p) => {
          const selected = p.id === path;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={p.id}
              onPress={() => update('learningPath', p.id).catch(() => undefined)}
              style={[styles.path, selected && styles.pathSelected]}
            >
              <AppText color={selected ? colors.primaryDark : colors.text} variant="bodyStrong">
                {p.label}
              </AppText>
              <AppText color={colors.textSecondary} variant="caption">
                {p.detail}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText color={colors.textSecondary} variant="caption">
        Switch paths any time — this is a preference, not a skill rating.
      </AppText>

      <SectionHeading title="Lessons" />
      {result.status === 'loading' && !result.data ? (
        <LoadingState />
      ) : (
        lessons.map((l) => {
          const p = byId.get(l.id);
          const complete = !!p?.completedAt;
          return (
            <Pressable
              accessibilityLabel={`${l.title}. ${l.minutes} minutes, ${l.difficulty}. ${complete ? 'Completed' : 'Not completed'}`}
              accessibilityRole="button"
              key={l.id}
              onPress={() => router.push({ pathname: '/learn/[id]', params: { id: l.id } })}
              style={({ pressed }) => [styles.lesson, pressed && { backgroundColor: colors.light }]}
            >
              <View style={[styles.num, complete && styles.numDone]}>
                {complete ? (
                  <Icon color={colors.white} name="checkmark" size={18} />
                ) : (
                  <AppText color={colors.primaryDark} variant="caption">
                    {l.order}
                  </AppText>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{l.title}</AppText>
                <AppText color={colors.textSecondary} variant="caption">
                  {l.description}
                </AppText>
                <AppText color={colors.textSecondary} style={{ marginTop: 2 }} variant="caption">
                  {`${l.minutes} min · ${l.difficulty}${p?.bestScore != null && p.questionCount ? ` · best ${p.bestScore}/${p.questionCount}` : ''}`}
                </AppText>
              </View>
              <Icon name="chevron-forward" size={18} />
            </Pressable>
          );
        })
      )}
      {result.status === 'error' ? <Banner tone="error">Progress could not be loaded. Lessons still work.</Banner> : null}

      <SectionHeading title="Video tutorials" />
      {videos.isConfigured() ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/learn/videos')}
          style={({ pressed }) => [styles.lesson, pressed && { backgroundColor: colors.light }]}
        >
          <View style={styles.num}>
            <Icon name="logo-youtube" size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Browse video tutorials</AppText>
            <AppText color={colors.textSecondary} variant="caption">
              Scales, chords, number system, worship accompaniment and more — from YouTube.
            </AppText>
          </View>
          <Icon name="chevron-forward" size={18} />
        </Pressable>
      ) : (
        <Banner title="No video provider connected" tone="info">
          Video tutorials need the DIONER server. It is not connected in this build, so no videos are shown.
        </Banner>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center' },
  paths: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.xs },
  path: {
    flex: 1,
    minHeight: 72,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.white,
    gap: 4,
  },
  pathSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.light },
  lesson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 84,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  num: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.light, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: colors.primary },
});
