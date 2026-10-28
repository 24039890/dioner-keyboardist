import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/primitives';
import { type Key, diatonicChords, keyLabel, relativeKey, sameKey, spokenKeyLabel } from '@/features/music-theory';
import { colors, radius, shadow, spacing, typography } from '@/theme/tokens';

import { DEFAULT_THRESHOLDS, type KeyReading } from '../engine/keyEstimator';
import type { ListeningStatus } from '../hooks/useLiveAnalysis';

const LEVEL_TEXT = { high: 'Sure', medium: 'Fairly sure', low: 'Not sure yet' } as const;

/**
 * The song key, large. While listening it shows progress until there is enough
 * music to judge; when two keys are close it offers them as one-tap choices.
 */
export function KeyPanel({
  reading,
  status,
  manualKey,
  onPickKey,
  onHoldKey,
}: {
  reading: KeyReading | null;
  status: ListeningStatus;
  manualKey: Key | null;
  onPickKey: (key: Key) => void;
  onHoldKey: (key: Key) => void;
}) {
  const live = status === 'listening' || status === 'paused';
  const detected = reading?.status === 'estimated' ? reading.key : null;
  const shown = manualKey ?? detected;

  let headline = '—';
  let caption = 'Tap Start and play or sing';
  let dots = 0;
  if (manualKey) {
    headline = keyLabel(manualKey);
    caption = detected && !sameKey(detected, manualKey) ? `Held · music now suggests ${keyLabel(detected)}` : 'Held';
    dots = 3;
  } else if (detected) {
    headline = keyLabel(detected);
    caption = live ? LEVEL_TEXT[reading?.level ?? 'low'] : 'Last result';
    dots = reading?.level === 'high' ? 3 : reading?.level === 'medium' ? 2 : 1;
  } else if (live && reading?.status === 'ambiguous') {
    headline = 'Close call';
    caption = 'Tap the key that sounds like home';
  } else if (live) {
    headline = 'Listening…';
    caption = 'Keep playing — a few seconds of music';
  }

  const progress =
    live && !shown && (!reading || reading.status === 'insufficient')
      ? Math.min(1, (reading?.evidence ?? 0) / DEFAULT_THRESHOLDS.minEvidence)
      : null;

  // Close-call choices: top candidates plus the relative key when relevant.
  const choices: Key[] = [];
  if (!manualKey && reading?.status === 'ambiguous') {
    for (const c of reading.candidates.slice(0, 2)) if (!choices.some((k) => sameKey(k, c.key))) choices.push(c.key);
    const first = reading.candidates[0];
    if (reading.relativeAmbiguity && first && !choices.some((k) => sameKey(k, relativeKey(first.key))))
      choices.push(relativeKey(first.key));
  }

  return (
    <View style={styles.panel}>
      <AppText color={colors.primaryDark} variant="eyebrow">
        Song key
      </AppText>
      <View
        accessibilityLabel={`Song key: ${shown ? spokenKeyLabel(shown) : headline}. ${caption}.`}
        accessibilityLiveRegion="polite"
        accessible
      >
        <AppText adjustsFontSizeToFit numberOfLines={1} style={styles.key} variant="display">
          {headline}
        </AppText>
      </View>

      <View style={styles.captionRow}>
        {dots > 0 ? (
          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i < dots && styles.dotOn]} />
            ))}
          </View>
        ) : null}
        <AppText color={colors.textSecondary} variant="small">
          {caption}
        </AppText>
      </View>

      {progress !== null ? (
        <View
          accessibilityLabel="Listening progress"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
      ) : null}

      {choices.length ? (
        <View style={styles.choices}>
          {choices.map((k) => (
            <Pressable
              accessibilityLabel={`Use ${spokenKeyLabel(k)}`}
              accessibilityRole="button"
              key={`${k.tonic}${k.mode}`}
              onPress={() => onPickKey(k)}
              style={styles.choice}
            >
              <AppText color={colors.primaryDark} variant="bodyStrong">
                {keyLabel(k)}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {shown ? (
        <AppText color={colors.primaryDark} style={styles.chords} variant="subheading">
          {diatonicChords(shown)
            .filter((_, i) => i === 0 || i === 3 || i === 4 || i === 5)
            .join('   ·   ')}
        </AppText>
      ) : null}

      {detected && !manualKey && live ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onHoldKey(detected)} style={styles.hold}>
          <AppText color={colors.primary} variant="bodyStrong">
            Hold this key
          </AppText>
        </Pressable>
      ) : null}

      {reading?.possibleKeyChange && !manualKey && live ? (
        <AppText color={colors.primaryDark} style={styles.change} variant="caption">
          {`Key may be changing → ${keyLabel(reading.possibleKeyChange)}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: spacing.xs,
    ...shadow.card,
  },
  key: { textAlign: 'center', fontSize: typography.display.fontSize },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pale },
  dotOn: { backgroundColor: colors.primary },
  track: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.pale, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: '100%', backgroundColor: colors.primary },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.xs },
  choice: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  chords: { marginTop: spacing.xs, letterSpacing: 0.5 },
  hold: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  change: { marginTop: 2 },
});
