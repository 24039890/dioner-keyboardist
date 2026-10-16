import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PianoKeys } from '@/components/music/PianoKeys';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, EmptyState, Icon, ProgressBar } from '@/components/ui/primitives';
import type { LessonProgress } from '@/db/repositories/progress';
import { getLesson } from '@/features/learning/curriculum';
import { type AnswerResult, checkAnswer, generateQuestions } from '@/features/learning/exercises';
import { useRepositories } from '@/providers/data';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = getLesson(id);
  const { progress } = useRepositories();
  // A new seed per visit gives fresh questions; answers are validated by the theory engine.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const questions = useMemo(() => (lesson ? generateQuestions(lesson.exercise.kinds, lesson.exercise.count, seed) : []), [lesson, seed]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState<LessonProgress | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!lesson || questions.length === 0) {
    return (
      <Screen>
        <ScreenHeader back title="Exercise" />
        <EmptyState body="This exercise is not available." icon="school-outline" title="Exercise not found" />
      </Screen>
    );
  }
  const q = questions[index];
  if (!q) return null;
  const last = index === questions.length - 1;

  const toggle = (option: string) => {
    if (result) return;
    if (q.selection === 'single') setSelected([option]);
    else setSelected((s) => (s.includes(option) ? s.filter((x) => x !== option) : [...s, option]));
  };

  const submit = () => {
    const r = checkAnswer(q, selected);
    setResult(r);
    if (r.correct) setScore((s) => s + 1);
  };

  const next = async () => {
    if (!last) {
      setIndex(index + 1);
      setSelected([]);
      setResult(null);
      return;
    }
    try {
      setFinished(await progress.recordAttempt(lesson.id, score, questions.length));
    } catch {
      setSaveError('Your score could not be saved on this device. You can try again.');
      setFinished({
        lessonId: lesson.id,
        attempts: 0,
        bestScore: score,
        lastScore: score,
        questionCount: questions.length,
        completedAt: null,
        updatedAt: '',
      });
    }
  };

  const restart = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
    setIndex(0);
    setSelected([]);
    setResult(null);
    setScore(0);
    setFinished(null);
    setSaveError(null);
  };

  if (finished) {
    const passed = score / questions.length >= 0.7;
    return (
      <Screen>
        <ScreenHeader back subtitle={lesson.title} title="Exercise complete" />
        <Card style={{ alignItems: 'center', gap: spacing.xs }} tinted>
          <Icon name={passed ? 'trophy-outline' : 'refresh'} size={40} />
          <AppText variant="display">{`${score}/${questions.length}`}</AppText>
          <AppText color={colors.textSecondary} style={{ textAlign: 'center' }} variant="small">
            {passed ? 'Lesson complete — great work.' : 'Score 70% or more to complete the lesson. Try a new set of questions.'}
          </AppText>
          {finished.attempts > 0 ? (
            <AppText
              color={colors.textSecondary}
              variant="caption"
            >{`Best ${finished.bestScore}/${finished.questionCount} · ${finished.attempts} attempt${finished.attempts === 1 ? '' : 's'}`}</AppText>
          ) : null}
        </Card>
        {saveError ? (
          <View style={{ marginTop: spacing.sm }}>
            <Banner tone="error">{saveError}</Banner>
          </View>
        ) : null}
        <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
          <Button icon="refresh" label="New questions" onPress={restart} />
          <Button label="Back to lessons" onPress={() => router.dismissTo('/learn')} variant="secondary" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader back subtitle={lesson.title} title={`Question ${index + 1} of ${questions.length}`} />
      <ProgressBar label="Exercise progress" value={(index + (result ? 1 : 0)) / questions.length} />

      <Card style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <AppText color={colors.primary} variant="eyebrow">
          {q.selection === 'multi' ? 'Select all that apply' : 'Choose one'}
        </AppText>
        <AppText variant="heading">{q.prompt}</AppText>
        {q.highlight && (q.kind === 'note-recognition' || q.kind === 'chord-identification') ? <PianoKeys highlight={q.highlight} /> : null}
        <View style={styles.grid}>
          {q.options.map((o) => {
            const isSel = selected.includes(o);
            const isCorrect = !!result && q.correct.includes(o);
            const isWrong = !!result && isSel && !q.correct.includes(o);
            return (
              <Pressable
                accessibilityLabel={`${o}${isCorrect ? ', correct answer' : isWrong ? ', incorrect' : ''}`}
                accessibilityRole={q.selection === 'multi' ? 'checkbox' : 'radio'}
                accessibilityState={
                  q.selection === 'multi' ? { checked: isSel, disabled: !!result } : { selected: isSel, disabled: !!result }
                }
                disabled={!!result}
                key={o}
                onPress={() => toggle(o)}
                style={[styles.option, isSel && styles.optionSelected, isCorrect && styles.optionCorrect, isWrong && styles.optionWrong]}
              >
                <AppText style={{ flex: 1 }} variant="bodyStrong">
                  {o}
                </AppText>
                {isCorrect ? <Icon name="checkmark-circle" size={20} /> : isWrong ? <Icon name="close-circle-outline" size={20} /> : null}
              </Pressable>
            );
          })}
        </View>

        {!result ? (
          <Button disabled={selected.length === 0} label="Submit answer" onPress={submit} />
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.feedback}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon name={result.correct ? 'checkmark-circle' : 'information-circle'} size={22} />
              <AppText color={colors.primaryDark} variant="subheading">
                {result.correct ? 'Correct' : `Not quite — answer: ${q.correct.join(', ')}`}
              </AppText>
            </View>
            <AppText color={colors.textSecondary} variant="small">
              {q.explanation}
            </AppText>
            <Button label={last ? 'See results' : 'Next question'} onPress={next} />
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xs },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.white,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.light },
  optionCorrect: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.pale },
  optionWrong: { borderWidth: 2, borderColor: colors.text, borderStyle: 'dashed', backgroundColor: colors.white },
  feedback: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.light },
});
