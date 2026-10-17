import { useCallback } from 'react';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ListRow, Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Card, Icon, SectionHeading, Segmented } from '@/components/ui/primitives';
import { useCloud } from '@/features/auth/CloudProvider';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories, useSettings } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const { songs, rehearsals } = useRepositories();
  const cloud = useCloud();
  const email = cloud.session?.user.email;
  const cloudStatus =
    cloud.env.status !== 'configured'
      ? 'Optional backup — not set up in this build'
      : email
        ? `${email} · ${cloud.link?.kind === 'linked-same' ? 'syncing' : 'backup not on'}`
        : 'Optional — sign in to back up';
  const stats = useFocusedQuery(
    useCallback(async () => ({ songs: await songs.count(), ...(await rehearsals.count()) }), [songs, rehearsals]),
  );

  return (
    <Screen>
      <ScreenHeader back subtitle="Personalise your experience" title="Settings" />

      <Card style={styles.account} tinted>
        <View style={styles.avatar}>
          <Icon name="person-outline" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{email ? `Signed in as ${email}` : 'Using DIONER as a guest'}</AppText>
          <AppText color={colors.textSecondary} variant="caption">
            Songs, recordings and progress stay on this device.
          </AppText>
        </View>
      </Card>
      <ListRow icon="cloud-outline" onPress={() => router.push('/settings/account')} subtitle={cloudStatus} title="Account & cloud sync" />

      <SectionHeading title="Audio & input" />
      <ListRow
        icon="mic-outline"
        onPress={() => router.push('/settings/input')}
        subtitle={settings.inputMode === 'microphone' ? 'Microphone' : 'MIDI keyboard'}
        title="Input source and permissions"
      />

      <SectionHeading title="Learning" />
      <Segmented
        items={['beginner', 'experienced'] as const}
        labels={{ beginner: 'Beginner path', experienced: 'Experienced path' }}
        onChange={(v) => update('learningPath', v).catch(() => undefined)}
        value={settings.learningPath}
      />

      <SectionHeading title="Data & privacy" />
      <ListRow
        icon="phone-portrait-outline"
        subtitle={
          stats.data ? `${stats.data.songs} songs · ${stats.data.rehearsals} rehearsals · ${stats.data.recordings} recordings` : 'Counting…'
        }
        title="Stored on this device"
      />
      <ListRow
        icon="lock-closed-outline"
        subtitle="Live Keys analyses audio on the phone; nothing is uploaded. Recordings are kept in private app storage."
        title="Privacy"
      />

      <AppText color={colors.textSecondary} style={styles.version} variant="caption">
        {`DIONER Keyboardist · version ${Constants.expoConfig?.version ?? 'unknown'}`}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  version: { textAlign: 'center', marginTop: spacing.xl },
});
