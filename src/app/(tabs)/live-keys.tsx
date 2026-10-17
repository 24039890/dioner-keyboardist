import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { KeyPickerSheet } from '@/components/music/KeyPickerSheet';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, IconButton, Segmented } from '@/components/ui/primitives';
import { KeyPanel } from '@/features/live-keys/components/KeyPanel';
import { MidiPanel } from '@/features/live-keys/components/MidiPanel';
import { PitchPanel } from '@/features/live-keys/components/PitchPanel';
import { useLiveAnalysis } from '@/features/live-keys/hooks/useLiveAnalysis';
import { useMidiAnalysis } from '@/features/live-keys/hooks/useMidiAnalysis';
import type { Key } from '@/features/music-theory';
import { useSettings } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

const SOURCES = ['microphone', 'midi'] as const;

export default function LiveKeysScreen() {
  const { settings, update } = useSettings();
  const source = settings.inputMode;
  const live = useLiveAnalysis();
  const midiLive = useMidiAnalysis(source === 'midi');
  const midi = midiLive.availability;
  const [manualKey, setManualKey] = useState<Key | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const changeSource = (next: (typeof SOURCES)[number]) => {
    if (next === source) return;
    if (live.status === 'listening' || live.status === 'paused') live.stop();
    update('inputMode', next).catch(() => undefined);
  };

  const reading = source === 'midi' ? (midiLive.snapshot?.key ?? null) : (live.snapshot?.key ?? null);
  const active = live.status === 'listening' || live.status === 'paused';

  return (
    <Screen withTabBar>
      <ScreenHeader
        action={<IconButton icon="settings-outline" label="Open settings" onPress={() => router.push('/settings')} />}
        subtitle="Live musical analysis"
        title="DIONER"
      />

      <Segmented items={SOURCES} labels={{ microphone: 'Microphone', midi: 'MIDI keyboard' }} onChange={changeSource} value={source} />
      <AppText color={colors.textSecondary} style={styles.helper} variant="small">
        {source === 'microphone'
          ? 'Listens to a singer or a full performance through this phone. Audio is analysed on the device and never uploaded.'
          : 'Reads the notes you play on a MIDI keyboard. This describes your keyboard part, not the singer’s melody.'}
      </AppText>

      {source === 'midi' && !midi.available ? (
        <View style={{ gap: spacing.sm }}>
          <Banner title="MIDI input is not available in this build" tone="warning">
            {midi.reason}
          </Banner>
          <Button
            icon="information-circle-outline"
            label="Input details"
            onPress={() => router.push('/settings/input')}
            variant="secondary"
          />
        </View>
      ) : source === 'midi' ? (
        <>
          <KeyPanel manualKey={manualKey} reading={reading} status={midiLive.status === 'listening' ? 'listening' : 'idle'} />
          <MidiPanel
            device={midiLive.device}
            devices={midiLive.devices}
            onConnect={(id) => void midiLive.connect(id)}
            onDisconnect={midiLive.disconnect}
            bluetoothDevices={midiLive.bluetoothDevices}
            bluetoothSupported={midiLive.bluetoothSupported}
            onConnectBluetooth={(address) => void midiLive.connectBluetooth(address)}
            onRefresh={midiLive.refresh}
            onScanBluetooth={() => void midiLive.scanBluetooth()}
            scanning={midiLive.scanning}
            snapshot={midiLive.snapshot}
            status={midiLive.status}
          />
          {midiLive.message ? (
            <View style={styles.block}>
              <Banner tone="warning">{midiLive.message}</Banner>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <KeyPanel manualKey={manualKey} reading={reading} status={live.status} />
          <PitchPanel snapshot={live.snapshot} source="Microphone" status={live.status} />

          {live.status === 'denied' ? (
            <View style={styles.block}>
              <Banner title="Microphone access is off" tone="warning">
                {live.permissionBlocked
                  ? 'DIONER can’t ask again. Turn on microphone access for DIONER in your phone’s settings, then come back.'
                  : 'Live Keys needs the microphone to hear the music. Nothing is recorded or uploaded.'}
              </Banner>
              {live.permissionBlocked ? (
                <Button
                  icon="open-outline"
                  label="Open phone settings"
                  onPress={() => Linking.openSettings().catch(() => undefined)}
                  variant="secondary"
                />
              ) : null}
            </View>
          ) : null}
          {live.message ? (
            <View style={styles.block}>
              <Banner tone={live.status === 'error' ? 'error' : 'info'}>{live.message}</Banner>
            </View>
          ) : null}

          <View style={styles.controls}>
            {!active ? (
              <Button
                icon="mic"
                label={live.status === 'denied' ? 'Try again' : 'Start listening'}
                loading={live.status === 'starting'}
                onPress={() => void live.start()}
                style={styles.grow}
              />
            ) : live.status === 'listening' ? (
              <>
                <Button icon="pause" label="Pause" onPress={live.pause} style={styles.grow} />
                <Button icon="stop" label="Stop" onPress={live.stop} variant="secondary" />
              </>
            ) : (
              <>
                <Button icon="play" label="Resume" onPress={() => void live.resume()} style={styles.grow} />
                <Button icon="stop" label="Stop" onPress={live.stop} variant="secondary" />
              </>
            )}
          </View>
        </>
      )}

      <View style={styles.manualRow}>
        <Button
          icon="key-outline"
          label={manualKey ? 'Change manual key' : 'Set key manually'}
          onPress={() => setPickerOpen(true)}
          style={styles.grow}
          variant="ghost"
        />
        {manualKey ? <Button label="Clear" onPress={() => setManualKey(null)} variant="secondary" /> : null}
      </View>

      <KeyPickerSheet
        initial={manualKey ?? (reading?.status === 'estimated' ? reading.key : null)}
        onClose={() => setPickerOpen(false)}
        onSelect={(k) => {
          setManualKey(k);
          setPickerOpen(false);
        }}
        subtitle="Overrides the live estimate until you clear it."
        title="Set key manually"
        visible={pickerOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  helper: { marginTop: spacing.xs, marginBottom: spacing.md },
  block: { marginTop: spacing.sm, gap: spacing.xs },
  controls: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  grow: { flex: 1 },
  manualRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
});
