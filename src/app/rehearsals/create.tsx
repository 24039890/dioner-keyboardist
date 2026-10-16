import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { KeyPickerSheet } from '@/components/music/KeyPickerSheet';
import { TextField } from '@/components/ui/forms';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, Chip, SectionHeading } from '@/components/ui/primitives';
import type { Song } from '@/db/repositories/songs';
import { ValidationError } from '@/db/types';
import { type Key, formatOffset, keyLabel, normalizeOffset, stepOffset, targetKey } from '@/features/music-theory';
import { useRepositories } from '@/providers/data';
import { colors, radius, spacing } from '@/theme/tokens';

export default function CreateRehearsalScreen() {
  const params = useLocalSearchParams<{ songId?: string; offset?: string }>();
  const { songs, rehearsals } = useRepositories();
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [songId, setSongId] = useState<string | null>(params.songId ?? null);
  const [title, setTitle] = useState(`Rehearsal ${new Date().toLocaleDateString()}`);
  const [originalKey, setOriginalKey] = useState<Key | null>(null);
  const [offset, setOffset] = useState(normalizeOffset(Number(params.offset ?? 0) || 0));
  const [notes, setNotes] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    songs
      .list()
      .then((list) => {
        setAllSongs(list);
        const linked = list.find((s) => s.id === params.songId);
        if (linked) {
          setOriginalKey(linked.originalKey);
          setTitle(`${linked.title} — ${new Date().toLocaleDateString()}`);
        }
      })
      .catch(() => setError('Songs could not be loaded. You can still create a rehearsal without one.'));
  }, [songs, params.songId]);

  const chooseSong = (s: Song | null) => {
    setSongId(s?.id ?? null);
    if (s) setOriginalKey(s.originalKey);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await rehearsals.create({ title, songId, originalKey, transpositionSemitones: originalKey ? offset : 0, notes });
      router.replace({ pathname: '/rehearsals/[id]', params: { id: r.id } });
    } catch (e) {
      setError(e instanceof ValidationError ? e.issues.join(' ') : e instanceof Error ? e.message : 'The rehearsal could not be saved.');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader back subtitle="Stored on this device" title="New rehearsal" />
      {error ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}
      <TextField label="Title *" maxLength={200} onChangeText={setTitle} value={title} />

      <SectionHeading detail="Optional — links the chart and keys" title="Song" />
      <View style={styles.wrap}>
        <Chip label="No song" onPress={() => chooseSong(null)} selected={songId === null} />
        {allSongs.map((s) => (
          <Chip key={s.id} label={s.title} onPress={() => chooseSong(s)} selected={songId === s.id} />
        ))}
      </View>
      {allSongs.length === 0 ? (
        <AppText color={colors.textSecondary} variant="small">
          No songs yet — you can link one later by creating it in Songs.
        </AppText>
      ) : null}

      <SectionHeading title="Keys" />
      <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.keyButton}>
        <AppText variant="bodyStrong">{originalKey ? `Original: ${keyLabel(originalKey)}` : 'Set original key (optional)'}</AppText>
        <AppText color={colors.primary} variant="bodyStrong">
          {originalKey ? 'Change' : 'Set'}
        </AppText>
      </Pressable>
      {originalKey ? (
        <Card style={styles.offsetCard} tinted>
          <Button label="−1" onPress={() => setOffset(stepOffset(offset, -1))} variant="secondary" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <AppText color={colors.textSecondary} variant="caption">
              Playing in
            </AppText>
            <AppText color={colors.primary} variant="heading">
              {keyLabel(targetKey(originalKey, offset))}
            </AppText>
            <AppText color={colors.textSecondary} variant="caption">
              {offset === 0 ? 'original key' : `${formatOffset(offset)} semitones`}
            </AppText>
          </View>
          <Button label="+1" onPress={() => setOffset(stepOffset(offset, 1))} variant="secondary" />
        </Card>
      ) : null}

      <View style={{ height: spacing.md }} />
      <TextField
        label="Notes"
        maxLength={5000}
        multiline
        onChangeText={setNotes}
        placeholder="What to work on, who was there…"
        value={notes}
      />
      <Button icon="checkmark" label="Create rehearsal" loading={saving} onPress={save} />

      <KeyPickerSheet
        initial={originalKey}
        onClose={() => setPickerOpen(false)}
        onSelect={(k) => {
          setOriginalKey(k);
          setPickerOpen(false);
        }}
        title="Original key"
        visible={pickerOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  keyButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.pale,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  offsetCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
});
