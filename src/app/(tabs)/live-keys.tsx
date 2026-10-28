import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { KeyPickerSheet } from '@/components/music/KeyPickerSheet';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, IconButton, Segmented } from '@/components/ui/primitives';
import { SLOGAN } from '@/config/brand';
import { KeyPanel } from '@/features/live-keys/components/KeyPanel';
import { MidiPanel } from '@/features/live-keys/components/MidiPanel';
import { PitchPanel } from '@/features/live-keys/components/PitchPanel';
import { TransposeCard } from '@/features/live-keys/components/TransposeCard';
import { useLiveAnalysis } from '@/features/live-keys/hooks/useLiveAnalysis';
import { useMidiAnalysis } from '@/features/live-keys/hooks/useMidiAnalysis';
import { type Key, decodeKey, encodeKey } from '@/features/music-theory';
import { useSettings } from '@/providers/data';
import { colors, spacing } from '@/theme/tokens';

const SOURCES = ['microphone', 'midi'] as const;
type Picker = 'song' | 'mine' | null;

export default function LiveKeysScreen() {
  const { settings, update } = useSettings();
  const source = settings.inputMode;
  const live = useLiveAnalysis();
  const midiLive = useMidiAnalysis(source === 'midi');
  const midi = midiLive.availability;
  const [manualKey, setManualKey] = useState<Key | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const playKey = decodeKey(settings.playKey);

  const changeSource = (next: (typeof SOURCES)[number]) => {
    if (next === source) return;
    if (live.status === 'listening' || live.status === 'paused') live.stop();
    update('inputMode', next).catch(() => undefined);
  };

  const reading = source === 'midi' ? (midiLive.snapshot?.key ?? null) : (live.snapshot?.key ?? null);
  const status = source === 'midi' ? (midiLive.status === 'listening' ? 'listening' : 'idle') : live.status;
  const songKey = manualKey ?? (reading?.status === 'estimated' ? reading.key : null);
  const listening = live.status === 'listening';
  const paused = live.status === 'paused';

  const start = () => {
    setManualKey(null);
    void live.start();
  };

  return (
    <Screen withTabBar>
      <ScreenHeader
        action={<IconButton icon="settings-outline" label="Open settings" onPress={() => router.push('/settings')} />}
        subtitle={SLOGAN}
        title="DIONER"
      />

      <Segmented items={SOURCES} labels={{ microphone: 'Microphone', midi: 'MIDI keyboard' }} onChange={changeSource} value={source} />
      <View style={{ height: spacing.md }} />

      {source === 'midi' && !midi.available ? (
        <Banner title="MIDI needs the installed DIONER app" tone="info">
          {midi.reason}
        </Banner>
      ) : (
        <KeyPanel manualKey={manualKey} onHoldKey={setManualKey} onPickKey={setManualKey} reading={reading} status={status} />
      )}

      {source === 'midi' && midi.available ? (
        <>
          <MidiPanel
            bluetoothDevices={midiLive.bluetoothDevices}
            bluetoothSupported={midiLive.bluetoothSupported}
            device={midiLive.device}
            devices={midiLive.devices}
            onConnect={(id) => void midiLive.connect(id)}
            onConnectBluetooth={(address) => void midiLive.connectBluetooth(address)}
            onDisconnect={midiLive.disconnect}
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
      ) : null}

      {source === 'microphone' ? (
        <>
          {listening ? <PitchPanel snapshot={live.snapshot} /> : null}

          {live.status === 'denied' ? (
            <View style={styles.block}>
              <Banner title="Microphone access is off" tone="warning">
                {live.permissionBlocked
                  ? 'Allow the microphone for DIONER in your phone settings.'
                  : 'DIONER needs the microphone to hear the music.'}
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
            {listening || paused ? (
              <>
                <IconButton
                  icon={listening ? 'pause' : 'play'}
                  label={listening ? 'Pause listening' : 'Resume listening'}
                  onPress={() => (listening ? live.pause() : void live.resume())}
                  size={56}
                />
                <Button icon="stop" label="Stop" onPress={live.stop} style={styles.grow} />
              </>
            ) : (
              <Button
                icon="mic"
                label={live.snapshot ? 'Listen again' : 'Start listening'}
                loading={live.status === 'starting'}
                onPress={start}
                style={styles.grow}
              />
            )}
          </View>
        </>
      ) : null}

      <View style={styles.links}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPicker('song')} style={styles.link}>
          <AppText color={colors.primary} variant="bodyStrong">
            {manualKey ? 'Change song key' : 'Set song key myself'}
          </AppText>
        </Pressable>
        {manualKey ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setManualKey(null)} style={styles.link}>
            <AppText color={colors.textSecondary} variant="bodyStrong">
              Release
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <TransposeCard onChangePlayKey={() => setPicker('mine')} playKey={playKey} songKey={songKey} />

      <KeyPickerSheet
        confirmPrefix={picker === 'mine' ? 'I play in' : 'Use'}
        initial={picker === 'mine' ? playKey : (manualKey ?? songKey)}
        onClose={() => setPicker(null)}
        onSelect={(k) => {
          if (picker === 'mine') update('playKey', encodeKey(k)).catch(() => undefined);
          else setManualKey(k);
          setPicker(null);
        }}
        subtitle={picker === 'mine' ? 'The key you are most comfortable playing in.' : undefined}
        title={picker === 'mine' ? 'My keyboard key' : 'Song key'}
        visible={picker !== null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.sm, gap: spacing.xs },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  grow: { flex: 1 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.xs },
  link: { minHeight: 44, justifyContent: 'center' },
});
