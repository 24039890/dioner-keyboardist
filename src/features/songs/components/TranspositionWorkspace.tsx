import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { KeyPickerSheet } from '@/components/music/KeyPickerSheet';
import { AppText, Banner, Card, Eyebrow, Segmented } from '@/components/ui/primitives';
import type { SongSection } from '@/db/repositories/songs';
import {
  type Key,
  chordSymbolToNumber,
  explainTransposition,
  formatOffset,
  keyLabel,
  keyShortLabel,
  offsetBetweenKeys,
  stepOffset,
  targetKey,
  transposeLine,
} from '@/features/music-theory';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export type Notation = 'chords' | 'numbers';

/** Chart line in number notation relative to `key` (symbols and unknown tokens kept). */
export function lineToNumbers(line: string, key: Key): string {
  return line
    .split(/(\s+|\|)/)
    .map((part) => {
      if (!part.trim() || part === '|') return part;
      const r = chordSymbolToNumber(part, key);
      return r.ok ? r.number : part;
    })
    .join('');
}

export interface TransposedChart {
  offset: number;
  target: Key;
  sections: { id: string; label: string; original: string; transposed: string; errors: string[] }[];
  errors: string[];
}

export function transposeChart(sections: SongSection[], original: Key, offset: number): TransposedChart {
  const target = targetKey(original, offset);
  const rows = sections.map((s) => {
    const r = transposeLine(s.chords, offset, target);
    return { id: s.id, label: s.label, original: s.chords, transposed: r.text, errors: r.errors };
  });
  return { offset, target, sections: rows, errors: rows.flatMap((r) => r.errors) };
}

/**
 * Preview-only transposition. Nothing is saved from here; the parent decides
 * whether to apply the result (with confirmation) or start a rehearsal.
 */
export function TranspositionWorkspace({
  originalKey,
  sections,
  offset,
  onOffsetChange,
}: {
  originalKey: Key;
  sections: SongSection[];
  offset: number;
  onOffsetChange: (n: number) => void;
}) {
  const [notation, setNotation] = useState<Notation>('chords');
  const [pickerOpen, setPickerOpen] = useState(false);
  const chart = useMemo(() => transposeChart(sections, originalKey, offset), [sections, originalKey, offset]);
  const target = chart.target;

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Transposition workspace</Eyebrow>
          <AppText variant="subheading">Choose your playing key</AppText>
        </View>
        <Pressable accessibilityRole="button" disabled={offset === 0} hitSlop={8} onPress={() => onOffsetChange(0)} style={styles.reset}>
          <AppText color={offset === 0 ? colors.textSecondary : colors.primary} variant="bodyStrong">
            Reset
          </AppText>
        </Pressable>
      </View>

      <View style={styles.keyRow}>
        <View style={styles.keyCol}>
          <AppText color={colors.textSecondary} variant="caption">
            Original
          </AppText>
          <AppText variant="title">{keyShortLabel(originalKey)}</AppText>
          <AppText color={colors.textSecondary} variant="caption">
            {originalKey.mode === 'major' ? 'Major' : 'Minor'}
          </AppText>
        </View>
        <View style={styles.offset}>
          <Pressable
            accessibilityLabel="Down one semitone"
            accessibilityRole="button"
            onPress={() => onOffsetChange(stepOffset(offset, -1))}
            style={styles.step}
          >
            <AppText color={colors.primary} variant="heading">
              −
            </AppText>
          </Pressable>
          <View accessibilityLabel={`Offset ${offset} semitones`} accessible style={{ alignItems: 'center', minWidth: 64 }}>
            <AppText color={colors.primaryDark} variant="subheading">
              {offset === 0 ? 'Original' : formatOffset(offset)}
            </AppText>
            <AppText color={colors.textSecondary} variant="caption">
              semitones
            </AppText>
          </View>
          <Pressable
            accessibilityLabel="Up one semitone"
            accessibilityRole="button"
            onPress={() => onOffsetChange(stepOffset(offset, 1))}
            style={styles.step}
          >
            <AppText color={colors.primary} variant="heading">
              +
            </AppText>
          </Pressable>
        </View>
        <Pressable
          accessibilityHint="Opens the key picker"
          accessibilityLabel={`Target key ${keyLabel(target)}`}
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={[styles.keyCol, styles.targetCol]}
        >
          <AppText color={colors.textSecondary} variant="caption">
            Target ▾
          </AppText>
          <AppText color={colors.primary} variant="title">
            {keyShortLabel(target)}
          </AppText>
          <AppText color={colors.textSecondary} variant="caption">
            {target.mode === 'major' ? 'Major' : 'Minor'}
          </AppText>
        </Pressable>
      </View>

      <Segmented
        items={['chords', 'numbers'] as const}
        labels={{ chords: 'Chord names', numbers: 'Number system' }}
        onChange={setNotation}
        value={notation}
      />

      {chart.sections.length === 0 ? (
        <AppText color={colors.textSecondary} variant="small">
          This song has no chord chart yet. Edit the song to add one.
        </AppText>
      ) : (
        chart.sections.map((s) => (
          <View key={s.id} style={{ gap: 6 }}>
            <AppText color={colors.textSecondary} variant="eyebrow">
              {s.label}
            </AppText>
            {notation === 'chords' ? (
              <>
                {offset !== 0 ? (
                  <AppText color={colors.textSecondary} style={styles.mono} variant="small">
                    {s.original}
                  </AppText>
                ) : null}
                <View style={styles.highlight}>
                  <AppText color={colors.primaryDark} style={styles.chords}>
                    {s.transposed}
                  </AppText>
                </View>
              </>
            ) : (
              <View style={styles.highlight}>
                <AppText color={colors.primaryDark} style={styles.chords}>
                  {lineToNumbers(s.original, originalKey)}
                </AppText>
              </View>
            )}
          </View>
        ))
      )}

      {chart.errors.length > 0 ? (
        <Banner title="Some symbols were left unchanged" tone="warning">
          {`These could not be read as chords, so they are shown exactly as written: ${[...new Set(chart.errors.map((e) => e.match(/"([^"]+)"/)?.[1] ?? e))].join(', ')}`}
        </Banner>
      ) : null}

      <AppText color={colors.textSecondary} variant="small">
        {notation === 'numbers'
          ? `Number system: 1 is the tonic of the key; plain numbers use the chord that naturally occurs on that degree, and other qualities are written out (6m, 57, ♭7). Numbers are the same in every key.`
          : explainTransposition(originalKey, offset)}
      </AppText>

      <KeyPickerSheet
        confirmPrefix="Play in"
        initial={target}
        onClose={() => setPickerOpen(false)}
        onSelect={(k) => {
          // Keep the song's mode; pick the nearest offset to the chosen tonic.
          onOffsetChange(offsetBetweenKeys(originalKey, { tonic: k.tonic, mode: originalKey.mode }));
          setPickerOpen(false);
        }}
        subtitle={`The chart stays ${originalKey.mode}; only the tonic changes.`}
        title="Choose target key"
        visible={pickerOpen}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center' },
  reset: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  keyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.xs },
  keyCol: { alignItems: 'center', minWidth: 72, minHeight: 72, justifyContent: 'center' },
  targetCol: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.pale, paddingHorizontal: spacing.xs },
  offset: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.light, borderWidth: 1, borderColor: colors.pale },
  chords: { ...typography.chord, letterSpacing: 0.5 },
  mono: { letterSpacing: 0.5 },
});
