import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui/primitives';
import { type Key, keyLabel } from '@/features/music-theory';
import { colors, radius, spacing } from '@/theme/tokens';

import { formatSemitones, planTranspose } from '../transposePlan';

/**
 * "Play in your key": the keyboardist sets the key they are comfortable in;
 * when DIONER finds the song key, this shows the keyboard transpose value and
 * how their chords map onto the song's chords.
 */
export function TransposeCard({
  playKey,
  songKey,
  onChangePlayKey,
}: {
  playKey: Key | null;
  songKey: Key | null;
  onChangePlayKey: () => void;
}) {
  if (!playKey) {
    return (
      <View style={styles.card}>
        <AppText variant="subheading">Play in your own key</AppText>
        <AppText color={colors.textSecondary} variant="small">
          Tell DIONER the key you like to play in. It will show how far to transpose to match the song.
        </AppText>
        <Button icon="key-outline" label="Set my key" onPress={onChangePlayKey} variant="secondary" />
      </View>
    );
  }

  const plan = songKey ? planTranspose(playKey, songKey) : null;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <AppText color={colors.textSecondary} variant="caption">
            I play in
          </AppText>
          <AppText variant="subheading">{keyLabel(playKey)}</AppText>
        </View>
        <Pressable
          accessibilityLabel="Change the key I play in"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onChangePlayKey}
          style={styles.change}
        >
          <AppText color={colors.primary} variant="bodyStrong">
            Change
          </AppText>
        </Pressable>
      </View>

      {!plan ? (
        <AppText color={colors.textSecondary} variant="small">
          Start listening — once the song key is found, your transpose setting appears here.
        </AppText>
      ) : plan.semitones === 0 ? (
        <View style={styles.result}>
          <AppText color={colors.primaryDark} variant="title">
            0
          </AppText>
          <AppText color={colors.primaryDark} style={{ flex: 1 }} variant="small">
            {`The song is in your key. Play as normal${plan.relativeNote ? ` (${keyLabel(plan.songKey)} shares your notes)` : ''}.`}
          </AppText>
        </View>
      ) : (
        <>
          <View accessibilityLabel={`Set your keyboard transpose to ${plan.semitones}`} accessible style={styles.result}>
            <AppText color={colors.primaryDark} style={styles.big} variant="display">
              {formatSemitones(plan.semitones)}
            </AppText>
            <View style={{ flex: 1 }}>
              <AppText color={colors.primaryDark} variant="bodyStrong">
                Set Transpose to {formatSemitones(plan.semitones)}
              </AppText>
              <AppText color={colors.textSecondary} variant="caption">
                {`Keep playing in ${keyLabel(playKey)} — it will sound in ${keyLabel(plan.target)}.${plan.alternative !== null ? ` (Or ${formatSemitones(plan.alternative)}.)` : ''}`}
              </AppText>
            </View>
          </View>
          <View style={styles.chords}>
            {plan.chords.map((c) => (
              <View key={c.degree} style={styles.chord}>
                <AppText color={colors.textSecondary} variant="caption">
                  {c.from}
                </AppText>
                <AppText color={colors.primaryDark} variant="bodyStrong">
                  {c.to}
                </AppText>
              </View>
            ))}
          </View>
          {plan.relativeNote ? (
            <AppText color={colors.textSecondary} variant="caption">
              {plan.relativeNote}
            </AppText>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.light,
  },
  big: { fontSize: 40, lineHeight: 46 },
  chords: { flexDirection: 'row', gap: spacing.xs },
  chord: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.pale },
});
