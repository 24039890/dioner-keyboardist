import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { PianoKeys } from '@/components/music/PianoKeys';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, EmptyState, Eyebrow, Icon } from '@/components/ui/primitives';
import { getLesson } from '@/features/learning/curriculum';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = getLesson(id);
  const { progress } = useRepositories();
  const p = useFocusedQuery(useCallback(() => progress.get(id), [progress, id]));

  if (!lesson) {
    return (
      <Screen>
        <ScreenHeader back title="Lesson" />
        <EmptyState body="This lesson is not part of the current curriculum." icon="book-outline" title="Lesson not found" />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          icon="school-outline"
          label={p.data?.completedAt ? 'Practise again' : 'Start exercises'}
          onPress={() => router.push({ pathname: '/learn/exercise/[id]', params: { id: lesson.id } })}
        />
      }
    >
      <ScreenHeader back subtitle={`${lesson.category} · ${lesson.minutes} min · ${lesson.difficulty}`} title={lesson.title} />
      {p.data?.completedAt ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Banner tone="success">{`Completed · best score ${p.data.bestScore ?? 0}/${p.data.questionCount ?? 0}`}</Banner>
        </View>
      ) : null}

      <Card style={{ gap: 6 }} tinted>
        <Eyebrow>Learning objective</Eyebrow>
        <AppText variant="heading">{lesson.objective}</AppText>
      </Card>

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        {lesson.content.map((block, i) => {
          switch (block.type) {
            case 'text':
              return (
                <AppText key={i} variant="body">
                  {block.text}
                </AppText>
              );
            case 'bullets':
              return (
                <View key={i} style={{ gap: 6 }}>
                  {block.items.map((item) => (
                    <View key={item} style={{ flexDirection: 'row', gap: spacing.xs }}>
                      <Icon name="ellipse" size={8} />
                      <AppText style={{ flex: 1 }} variant="small">
                        {item}
                      </AppText>
                    </View>
                  ))}
                </View>
              );
            case 'keyboard':
              return (
                <View key={i} style={{ gap: 6 }}>
                  <PianoKeys highlight={block.highlight} />
                  <AppText color={colors.textSecondary} variant="caption">
                    {block.caption}
                  </AppText>
                </View>
              );
            case 'tip':
              return (
                <Banner key={i} title="Practice tip" tone="info">
                  {block.text}
                </Banner>
              );
          }
        })}
      </View>
      {lesson.attribution ? (
        <AppText color={colors.textSecondary} style={{ marginTop: spacing.md }} variant="caption">
          {lesson.attribution}
        </AppText>
      ) : null}
    </Screen>
  );
}
