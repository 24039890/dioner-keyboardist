import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { PianoKeys } from '@/components/music/PianoKeys';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Card, EmptyState, Eyebrow, Icon } from '@/components/ui/primitives';
import { getLesson } from '@/features/learning/curriculum';
import { colors, spacing } from '@/theme/tokens';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = getLesson(id);

  if (!lesson) {
    return (
      <Screen>
        <ScreenHeader back title="Lesson" />
        <EmptyState body="This lesson is not part of the current curriculum." icon="book-outline" title="Lesson not found" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader back subtitle={`${lesson.category} · ${lesson.minutes} min · ${lesson.difficulty}`} title={lesson.title} />

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
