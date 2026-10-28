import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

import type { AnalysisSnapshot } from '../engine/analyzer';
import type { SignalStatus } from '../engine/signalQuality';

const SIGNAL_HINT: Partial<Record<SignalStatus, string>> = {
  silent: 'No sound',
  weak: 'Too quiet — move closer',
  clipping: 'Too loud — move back',
};

/** One slim row: the note being heard right now and the input level. Only shown while listening. */
export function PitchPanel({ snapshot }: { snapshot: AnalysisSnapshot | null }) {
  const pitch = snapshot?.pitch ?? null;
  const level = snapshot?.signal.level ?? 0;
  const hint = snapshot ? SIGNAL_HINT[snapshot.signal.status] : undefined;
  const cents = pitch && pitch.cents !== 0 ? `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢` : '';

  return (
    <View style={styles.row}>
      <View accessibilityLabel={pitch ? `Note ${pitch.label} ${cents}` : 'No clear note'} accessible style={styles.note}>
        <AppText color={colors.textSecondary} variant="caption">
          Note
        </AppText>
        <AppText variant="heading">{pitch?.label ?? '—'}</AppText>
        {cents ? (
          <AppText color={colors.textSecondary} variant="caption">
            {cents}
          </AppText>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View
          accessibilityLabel="Input level"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(level * 100) }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${Math.max(2, level * 100)}%` }]} />
        </View>
        {hint ? (
          <AppText color={colors.primaryDark} variant="caption">
            {hint}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  note: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 110 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.pale, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary },
});
