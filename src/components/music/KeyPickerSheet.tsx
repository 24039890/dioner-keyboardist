import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, IconButton, Segmented } from '@/components/ui/primitives';
import { type Key, type Mode, keyLabel, keyShortLabel, spokenKeyLabel } from '@/features/music-theory';
import { colors, radius, spacing } from '@/theme/tokens';

const MODES = ['major', 'minor'] as const;

interface KeyPickerProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  initial: Key | null;
  onClose: () => void;
  onSelect: (key: Key) => void;
  confirmPrefix?: string;
}

/** Bottom sheet for choosing a key (12 tonics × major/minor). */
export function KeyPickerSheet(props: KeyPickerProps) {
  // Remount the body each time the sheet opens so it starts from `initial`.
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} transparent visible={props.visible}>
      {props.visible ? <KeyPickerBody key={props.initial ? `${props.initial.tonic}:${props.initial.mode}` : 'none'} {...props} /> : null}
    </Modal>
  );
}

function KeyPickerBody({ title, subtitle, initial, onClose, onSelect, confirmPrefix = 'Use' }: KeyPickerProps) {
  const [tonic, setTonic] = useState(initial?.tonic ?? 0);
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'major');

  const key: Key = { tonic, mode };
  return (
    <>
      <Pressable accessibilityLabel="Close key picker" onPress={onClose} style={styles.backdrop} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{title}</AppText>
            {subtitle ? (
              <AppText color={colors.textSecondary} variant="small">
                {subtitle}
              </AppText>
            ) : null}
          </View>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <Segmented items={MODES} labels={{ major: 'Major', minor: 'Minor' }} onChange={setMode} value={mode} />
        <View style={styles.grid}>
          {Array.from({ length: 12 }, (_, pc) => {
            const k: Key = { tonic: pc, mode };
            const selected = pc === tonic;
            return (
              <Pressable
                accessibilityLabel={spokenKeyLabel(k)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={pc}
                onPress={() => setTonic(pc)}
                style={[styles.cell, selected && styles.cellSelected]}
              >
                <AppText color={selected ? colors.white : colors.text} variant="bodyStrong">
                  {keyShortLabel(k)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <Button label={`${confirmPrefix} ${keyLabel(key)}`} onPress={() => onSelect(key)} />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.pale, marginTop: 10, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'space-between' },
  cell: {
    width: '23%',
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.pale,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  cellSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
