import { type PermissionResponse, getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, SectionHeading, Segmented } from '@/components/ui/primitives';
import { useSettings } from '@/providers/data';
import { getMidiInput } from '@/services/midi/midiInput';
import { colors, spacing } from '@/theme/tokens';

export default function InputSettingsScreen() {
  const { settings, update } = useSettings();
  const [perm, setPerm] = useState<PermissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const midi = getMidiInput().availability();

  useFocusEffect(
    useCallback(() => {
      getRecordingPermissionsAsync()
        .then(setPerm)
        .catch(() => setError('Microphone permission status could not be read.'));
    }, []),
  );

  const request = async () => {
    try {
      setPerm(await requestRecordingPermissionsAsync());
    } catch {
      setError('The permission request failed.');
    }
  };

  return (
    <Screen>
      <ScreenHeader back subtitle="How DIONER hears the music" title="Input" />
      <SectionHeading title="Default source for Live Keys" />
      <Segmented
        items={['microphone', 'midi'] as const}
        labels={{ microphone: 'Microphone', midi: 'MIDI keyboard' }}
        onChange={(v) => update('inputMode', v).catch(() => undefined)}
        value={settings.inputMode}
      />

      <SectionHeading title="Microphone" />
      <Card style={{ gap: spacing.xs }}>
        <AppText variant="small">
          Hears a singer or a full performance. Audio is analysed in memory on the phone and is not stored or uploaded by Live Keys.
        </AppText>
        <AppText variant="bodyStrong">
          {perm === null
            ? 'Checking permission…'
            : perm.granted
              ? 'Permission: allowed'
              : perm.canAskAgain
                ? 'Permission: not yet allowed'
                : 'Permission: blocked in system settings'}
        </AppText>
        {perm && !perm.granted ? (
          perm.canAskAgain ? (
            <Button label="Allow microphone" onPress={request} variant="secondary" />
          ) : (
            <Button label="Open phone settings" onPress={() => Linking.openSettings().catch(() => undefined)} variant="secondary" />
          )
        ) : null}
      </Card>
      {error ? (
        <View style={{ marginTop: spacing.xs }}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      <SectionHeading title="MIDI keyboard" />
      <Card style={{ gap: spacing.xs }}>
        <AppText variant="small">
          A MIDI keyboard sends the notes you play (note on/off, velocity). DIONER uses them to estimate the key of your playing — it does
          not represent the singer’s melody.
        </AppText>
        {midi.available ? (
          <AppText variant="bodyStrong">
            {`MIDI input is available · ${getMidiInput().listDevices().length} device(s) connected now`}
          </AppText>
        ) : (
          <Banner title="MIDI input unavailable" tone="warning">
            {midi.reason}
          </Banner>
        )}
        <AppText color={colors.textSecondary} variant="caption">
          Supported: USB MIDI keyboards (via a USB-OTG cable) and virtual MIDI apps on Android. Bluetooth MIDI is not supported yet.
        </AppText>
      </Card>
    </Screen>
  );
}
