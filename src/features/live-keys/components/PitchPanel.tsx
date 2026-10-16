import { StyleSheet, View } from 'react-native';

import { AppText, Eyebrow, Icon, type IconName } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

import type { AnalysisSnapshot, PitchTrend } from '../engine/analyzer';
import type { SignalStatus } from '../engine/signalQuality';
import type { ListeningStatus } from '../hooks/useLiveAnalysis';

const TREND: Record<PitchTrend, { icon: IconName; label: string }> = {
  rising: { icon: 'trending-up', label: 'Rising' },
  falling: { icon: 'trending-down', label: 'Falling' },
  steady: { icon: 'remove', label: 'Steady' },
  none: { icon: 'remove', label: 'None' },
};

const SIGNAL_TEXT: Record<SignalStatus, string> = {
  silent: 'No sound detected',
  weak: 'Signal is weak — move closer',
  clipping: 'Too loud — input is clipping',
  ok: 'Good input level',
};

const STATUS_TEXT: Record<ListeningStatus, string> = {
  idle: 'Inactive',
  starting: 'Starting…',
  listening: 'Listening',
  paused: 'Paused',
  denied: 'No microphone access',
  error: 'Stopped',
};

/**
 * Current-pitch panel. Visually separate from the song key: a detected A4
 * is a note, not evidence that the song is in A.
 */
export function PitchPanel({ snapshot, status, source }: { snapshot: AnalysisSnapshot | null; status: ListeningStatus; source: string }) {
  const live = status === 'listening';
  const pitch = live ? (snapshot?.pitch ?? null) : null;
  const level = live ? (snapshot?.signal.level ?? 0) : 0;
  const signal = snapshot?.signal.status;
  const trendKey: PitchTrend = live ? (snapshot?.trend ?? 'none') : 'none';
  const trend = TREND[trendKey];
  const centsText = pitch ? (pitch.cents === 0 ? 'in tune' : `${pitch.cents > 0 ? '+' : ''}${pitch.cents} cents`) : '';

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Current pitch</Eyebrow>
          <View
            accessibilityLabel={pitch ? `Current pitch ${pitch.label}, ${centsText}` : 'No reliable pitch'}
            accessible
            style={styles.pitchRow}
          >
            <AppText style={styles.pitch} variant="title">
              {pitch?.label ?? '—'}
            </AppText>
            {pitch ? (
              <AppText color={colors.textSecondary} variant="caption">
                {centsText}
              </AppText>
            ) : null}
          </View>
        </View>
        <View accessibilityLabel={`Status: ${STATUS_TEXT[status]}. Source: ${source}`} accessible style={styles.status}>
          <View style={[styles.statusDot, live && styles.statusDotOn]} />
          <AppText color={live ? colors.primaryDark : colors.textSecondary} variant="caption">
            {STATUS_TEXT[status]}
          </AppText>
        </View>
      </View>

      <View style={styles.historyRow}>
        <AppText color={colors.textSecondary} variant="caption">
          Recent
        </AppText>
        {(snapshot?.recentNotes.length ? snapshot.recentNotes : ['·', '·', '·', '·']).map((n, i) => (
          <View key={`${n}-${i}`} style={styles.note}>
            <AppText color={colors.primaryDark} variant="caption">
              {n}
            </AppText>
          </View>
        ))}
        <View style={{ flex: 1 }} />
        {trendKey !== 'none' ? (
          <View accessibilityLabel={`Pitch trend: ${trend.label}`} accessible style={styles.trend}>
            <Icon name={trend.icon} size={16} />
            <AppText color={colors.textSecondary} variant="caption">
              {trend.label}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.levelRow}>
        <AppText color={colors.textSecondary} variant="caption">
          Input
        </AppText>
        <View
          accessibilityLabel="Input level"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(level * 100) }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${Math.max(2, level * 100)}%` }]} />
        </View>
      </View>
      {live && signal ? (
        <View style={styles.signal}>
          <Icon name={signal === 'ok' ? 'checkmark-circle-outline' : 'warning-outline'} size={16} />
          <AppText color={colors.primaryDark} variant="caption">
            {SIGNAL_TEXT[signal]} · {source}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  pitchRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  pitch: { marginTop: 2 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.light,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSecondary },
  statusDotOn: { backgroundColor: colors.primary },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  note: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.pale, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
