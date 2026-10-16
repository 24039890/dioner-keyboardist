import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, Icon, type IconName } from '@/components/ui/primitives';
import { useSettings } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

interface Step {
  icon: IconName;
  title: string;
  body: string;
  points: string[];
}

const STEPS: Step[] = [
  {
    icon: 'musical-notes',
    title: 'Welcome to DIONER Keyboardist',
    body: 'Find the key, transpose charts, record rehearsals and keep learning — on your phone, offline.',
    points: ['Live key estimation', 'Songbook and transposition', 'Rehearsal recordings', 'Keyboard lessons and exercises'],
  },
  {
    icon: 'mic',
    title: 'Listening for the key',
    body: 'Live Keys listens through your microphone and estimates the overall key from several seconds of music. A single note is never treated as the key.',
    points: [
      'Audio is analysed on this phone and never uploaded.',
      'You will be asked for microphone access only when you first start listening.',
      'You can always set the key manually.',
    ],
  },
  {
    icon: 'options',
    title: 'Microphone vs. MIDI keyboard',
    body: 'The microphone hears the singer and the band. A MIDI keyboard reports the notes you play — that describes your playing, not the singer’s melody.',
    points: ['Microphone: singer or full performance', 'MIDI: your keyboard part only', 'MIDI support depends on your build and device'],
  },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { update } = useSettings();
  const step = STEPS[index] as Step;
  const last = index === STEPS.length - 1;

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await update('onboardingComplete', true);
      router.replace('/live-keys');
    } catch {
      setError('Your choice could not be saved. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {last ? (
            <Button icon="person-outline" label="Continue as guest" loading={saving} onPress={finish} />
          ) : (
            <Button icon="arrow-forward" label="Next" onPress={() => setIndex(index + 1)} />
          )}
          {index > 0 ? <Button label="Back" onPress={() => setIndex(index - 1)} variant="ghost" /> : null}
          {last ? (
            <AppText color={colors.textSecondary} style={{ textAlign: 'center' }} variant="caption">
              No account needed. Everything you create stays on this device.
            </AppText>
          ) : null}
        </>
      }
    >
      <View accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`} style={styles.dots}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      <View style={styles.hero}>
        <Icon name={step.icon} size={44} />
      </View>
      <AppText style={styles.center} variant="title">
        {step.title}
      </AppText>
      <AppText color={colors.textSecondary} style={[styles.center, { marginTop: spacing.xs }]} variant="body">
        {step.body}
      </AppText>
      <Card style={{ marginTop: spacing.lg, gap: spacing.sm }} tinted>
        {step.points.map((p) => (
          <View key={p} style={styles.point}>
            <Icon name="checkmark-circle" size={20} />
            <AppText style={{ flex: 1 }} variant="small">
              {p}
            </AppText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pale },
  dotActive: { width: 24, backgroundColor: colors.primary },
  hero: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: 32,
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.pale,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  center: { textAlign: 'center' },
  point: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
});
