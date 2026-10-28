import * as Linking from 'expo-linking';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, IconButton } from '@/components/ui/primitives';
import type { SongKeyResult } from '@/features/songs/songKeySearch';
import { keyLabel, keyShortLabel, relativeKey } from '@/features/music-theory';
import { colors, radius, spacing } from '@/theme/tokens';

/** Pop-up for a song found online: the key it is played in, with an option to save it to the songbook. */
export function SongKeySheet({
  song,
  saving,
  onClose,
  onSave,
}: {
  song: SongKeyResult | null;
  saving: boolean;
  onClose: () => void;
  onSave: (song: SongKeyResult) => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={song !== null}>
      {song ? (
        <>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{song.title}</AppText>
                <AppText color={colors.textSecondary} variant="small">
                  {[song.artist, song.album, song.year].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>

            {song.key ? (
              <View accessibilityLabel={`Played in ${keyLabel(song.key)}`} accessible style={styles.keyBox}>
                <AppText color={colors.textSecondary} variant="caption">
                  Played in
                </AppText>
                <AppText color={colors.primary} style={styles.bigKey}>
                  {keyShortLabel(song.key)}
                </AppText>
                <AppText variant="bodyStrong">{keyLabel(song.key)}</AppText>
                <AppText color={colors.textSecondary} variant="caption">
                  {`Same notes as ${keyLabel(relativeKey(song.key))}${song.tempo ? ` · ${song.tempo} BPM` : ''}`}
                </AppText>
              </View>
            ) : (
              <View style={styles.keyBox}>
                <AppText variant="bodyStrong">Key not listed</AppText>
                <AppText color={colors.textSecondary} style={{ textAlign: 'center' }} variant="caption">
                  The song catalogue has no key for this recording. Use Live Keys to hear it instead.
                </AppText>
              </View>
            )}

            {song.key ? <Button icon="bookmark-outline" label="Save to my songs" loading={saving} onPress={() => onSave(song)} /> : null}
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => Linking.openURL(song.sourceUrl).catch(() => undefined)}
              style={styles.source}
            >
              <AppText color={colors.textSecondary} variant="caption">
                Key from GetSongBPM.com
              </AppText>
            </Pressable>
          </SafeAreaView>
        </>
      ) : null}
    </Modal>
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
  keyBox: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.pale,
  },
  bigKey: { fontSize: 48, lineHeight: 56, fontWeight: '800' },
  source: { alignSelf: 'center', minHeight: 32, justifyContent: 'center' },
});
