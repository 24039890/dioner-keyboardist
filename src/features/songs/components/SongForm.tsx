import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { KeyPickerSheet } from '@/components/music/KeyPickerSheet';
import { TextField } from '@/components/ui/forms';
import { AppText, Banner, Button, Card, IconButton, SectionHeading } from '@/components/ui/primitives';
import type { SongInput } from '@/db/repositories/songs';
import { ValidationError } from '@/db/types';
import { type Key, keyLabel, numbersToChords, transposeLine } from '@/features/music-theory';
import { colors, radius, spacing } from '@/theme/tokens';

interface SectionDraft {
  key: string;
  label: string;
  chords: string;
}

let draftCounter = 0;
const draft = (label = '', chords = ''): SectionDraft => ({ key: `s${++draftCounter}`, label, chords });

/** Tokens in a chord line that are not recognised chords (shown as a hint, never blocking). */
function unreadable(line: string, key: Key): string[] {
  return transposeLine(line, 0, key)
    .tokens.filter((t) => t.kind === 'error')
    .map((t) => t.text);
}

export function SongForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: SongInput;
  submitLabel: string;
  onSubmit: (input: SongInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [artist, setArtist] = useState(initial?.artist ?? '');
  const [songNumber, setSongNumber] = useState(initial?.songNumber ?? '');
  const [key, setKey] = useState<Key>(initial?.originalKey ?? { tonic: 0, mode: 'major' });
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lyrics, setLyrics] = useState(initial?.lyrics ?? '');
  const [source, setSource] = useState(initial?.sourceAttribution ?? '');
  const [sections, setSections] = useState<SectionDraft[]>(
    initial?.sections.length ? initial.sections.map((s) => draft(s.label, s.chords)) : [draft('Verse', '')],
  );
  const [numbers, setNumbers] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  const updateSection = (k: string, patch: Partial<SectionDraft>) =>
    setSections((xs) => xs.map((s) => (s.key === k ? { ...s, ...patch } : s)));

  const insertNumbers = () => {
    const r = numbersToChords(numbers, key);
    if (r.tokens.length === 0) {
      setNumberError('Enter scale-degree numbers such as 1-5-6-4.');
      return;
    }
    if (r.errors.length) {
      setNumberError(r.errors[0] ?? 'Some numbers could not be converted.');
      return;
    }
    setNumberError(null);
    setSections((xs) => [...xs, draft(`Section ${xs.length + 1}`, r.chords.join(' | '))]);
    setNumbers('');
  };

  const submit = async () => {
    setSaving(true);
    setIssues([]);
    try {
      await onSubmit({
        title,
        artist,
        songNumber,
        originalKey: key,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes,
        lyrics,
        sourceAttribution: source,
        isSaved: initial?.isSaved ?? false,
        sections: sections.map((s) => ({ label: s.label, chords: s.chords })),
      });
    } catch (e) {
      setIssues(e instanceof ValidationError ? e.issues : [e instanceof Error ? e.message : 'The song could not be saved.']);
      setSaving(false);
    }
  };

  return (
    <View>
      {issues.length ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner title="Please fix the following" tone="error">
            {issues.join('\n')}
          </Banner>
        </View>
      ) : null}

      <TextField autoFocus={!initial} label="Title *" maxLength={200} onChangeText={setTitle} value={title} />
      <TextField label="Artist or performer" maxLength={200} onChangeText={setArtist} value={artist} />
      <TextField
        hint="Your hymnal or set-list number. Not a scale degree."
        label="Song number"
        maxLength={20}
        onChangeText={setSongNumber}
        value={songNumber}
      />

      <AppText variant="caption">Original key *</AppText>
      <Pressable
        accessibilityLabel={`Original key ${keyLabel(key)}. Change`}
        accessibilityRole="button"
        onPress={() => setPickerOpen(true)}
        style={styles.keyButton}
      >
        <AppText variant="bodyStrong">{keyLabel(key)}</AppText>
        <AppText color={colors.primary} variant="bodyStrong">
          Change
        </AppText>
      </Pressable>

      <SectionHeading detail="Separate chords with spaces or bars, e.g. C | G/B | Am7 | Fmaj7" title="Chord chart" />
      {sections.map((s, i) => {
        const bad = unreadable(s.chords, key);
        return (
          <Card key={s.key} style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={`Section ${i + 1} name`}
                  maxLength={40}
                  onChangeText={(t) => updateSection(s.key, { label: t })}
                  placeholder="Verse, Chorus, Bridge…"
                  value={s.label}
                />
              </View>
              <IconButton
                icon="trash-outline"
                label={`Remove section ${i + 1}`}
                onPress={() => setSections((xs) => xs.filter((x) => x.key !== s.key))}
              />
            </View>
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              error={bad.length ? `Not recognised as chords (kept as written): ${bad.join(', ')}` : null}
              label="Chords"
              maxLength={500}
              onChangeText={(t) => updateSection(s.key, { chords: t })}
              placeholder="C | G | Am | F"
              value={s.chords}
            />
          </Card>
        );
      })}
      <Button
        icon="add"
        label="Add section"
        onPress={() => setSections((xs) => [...xs, draft(`Section ${xs.length + 1}`)])}
        variant="secondary"
      />

      <Card style={{ marginTop: spacing.md }} tinted>
        <AppText variant="subheading">Add from numbers</AppText>
        <AppText color={colors.textSecondary} style={{ marginBottom: spacing.xs }} variant="small">
          Type scale degrees in {keyLabel(key)} (1 = tonic). Example: 1-5-6-4. Use 4m, 57, ♭7 or 1/3 for other qualities and bass notes.
        </AppText>
        <TextField
          autoCapitalize="none"
          error={numberError}
          label="Numbers"
          onChangeText={setNumbers}
          placeholder="1-5-6-4"
          value={numbers}
        />
        <Button disabled={!numbers.trim()} label="Convert and add section" onPress={insertNumbers} variant="secondary" />
      </Card>

      <SectionHeading title="Details" />
      <TextField hint="Comma separated, e.g. worship, opener" label="Tags" onChangeText={setTags} value={tags} />
      <TextField label="Musician notes" maxLength={5000} multiline onChangeText={setNotes} value={notes} />
      <TextField
        hint="Only add lyrics you wrote or have permission to use."
        label="Lyrics (optional)"
        maxLength={20000}
        multiline
        onChangeText={setLyrics}
        value={lyrics}
      />
      <TextField
        hint="Where the chart or lyrics came from, e.g. “Arranged by me” or a licensed songbook."
        label="Source attribution"
        maxLength={500}
        onChangeText={setSource}
        value={source}
      />

      <Button icon="checkmark" label={submitLabel} loading={saving} onPress={submit} style={{ marginTop: spacing.sm }} />

      <KeyPickerSheet
        initial={key}
        onClose={() => setPickerOpen(false)}
        onSelect={(k) => {
          setKey(k);
          setPickerOpen(false);
        }}
        subtitle="The key the chart is written in."
        title="Original key"
        visible={pickerOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 6,
  },
  section: { marginBottom: spacing.sm, paddingBottom: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
