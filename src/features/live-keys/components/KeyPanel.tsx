import { StyleSheet, View } from 'react-native';

import { AppText, Eyebrow } from '@/components/ui/primitives';
import { type Key, keyLabel, relativeKey, spokenKeyLabel } from '@/features/music-theory';
import { colors, radius, shadow, spacing, typography } from '@/theme/tokens';

import type { KeyReading } from '../engine/keyEstimator';
import type { ListeningStatus } from '../hooks/useLiveAnalysis';

const LEVEL_TEXT = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence — tentative' } as const;

/** Large central display of the estimated *song key* (not the current note). */
export function KeyPanel({ reading, status, manualKey }: { reading: KeyReading | null; status: ListeningStatus; manualKey: Key | null }) {
  const detected = reading?.status === 'estimated' ? reading.key : null;
  const shown = manualKey ?? detected;

  let headline = '—';
  let badge = 'Not listening';
  let explanation = 'Start listening to estimate the key from recent musical evidence.';
  let filledDots = 0;

  if (manualKey) {
    headline = keyLabel(manualKey);
    badge = 'Set manually';
    explanation =
      detected && (detected.tonic !== manualKey.tonic || detected.mode !== manualKey.mode)
        ? `The music currently suggests ${keyLabel(detected)}. Your manual key is kept until you clear it.`
        : 'You chose this key. Clear it to return to the live estimate.';
    filledDots = 3;
  } else if (status === 'listening' || status === 'paused') {
    if (!reading || reading.status === 'insufficient') {
      headline = 'Listening…';
      badge = 'Not enough evidence yet';
      explanation = 'Keep playing or singing. A key needs several seconds of music with different notes — one note is never enough.';
    } else if (reading.status === 'ambiguous') {
      headline = 'Undetermined';
      badge = 'Ambiguous';
      const [a, b] = reading.candidates;
      explanation =
        reading.relativeAmbiguity && a
          ? `The notes fit both ${keyLabel(a.key)} and ${keyLabel(relativeKey(a.key))}, which share the same notes. Listen for which chord feels like home.`
          : a && b
            ? `The music fits several keys almost equally (closest: ${keyLabel(a.key)} or ${keyLabel(b.key)}).`
            : 'The music does not clearly point to one key.';
    } else if (detected) {
      headline = keyLabel(detected);
      badge = LEVEL_TEXT[reading.level ?? 'low'];
      filledDots = reading.level === 'high' ? 3 : reading.level === 'medium' ? 2 : 1;
      explanation = reading.relativeAmbiguity
        ? `Estimated from the last ~${Math.round(reading.evidence)} s. ${keyLabel(relativeKey(detected))} uses the same notes and is also possible.`
        : `Estimated from harmony and stable pitches over the last ~${Math.round(reading.evidence)} s.`;
    }
  }

  return (
    <View
      accessibilityLabel={`Estimated song key: ${shown ? spokenKeyLabel(shown) : headline}. ${badge}.`}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.panel}
    >
      <Eyebrow>Estimated song key</Eyebrow>
      <AppText adjustsFontSizeToFit numberOfLines={1} style={styles.key} variant="display">
        {headline}
      </AppText>
      <View style={styles.badge}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i < filledDots && styles.dotOn]} />
          ))}
        </View>
        <AppText color={colors.primaryDark} variant="caption">
          {badge}
        </AppText>
      </View>
      <AppText color={colors.textSecondary} style={styles.explanation} variant="small">
        {explanation}
      </AppText>
      {reading?.possibleKeyChange && !manualKey ? (
        <View style={styles.change}>
          <AppText color={colors.primaryDark} variant="caption">
            Possible key change → {keyLabel(reading.possibleKeyChange)} (not yet confirmed)
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  key: { marginTop: spacing.xs, textAlign: 'center', fontSize: typography.display.fontSize },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.light,
    marginTop: spacing.xs,
  },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pale },
  dotOn: { backgroundColor: colors.primary },
  explanation: { textAlign: 'center', marginTop: spacing.sm },
  change: {
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});
