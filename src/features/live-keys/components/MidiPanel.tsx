import { StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/ui/layout';
import { AppText, Banner, Button, Eyebrow, IconButton } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

import type { MidiSnapshot } from '../engine/midiEvidence';
import type { MidiStatus } from '../hooks/useMidiAnalysis';
import type { MidiDevice } from '../../../services/midi/midiInput';

const TRANSPORT: Record<MidiDevice['transport'], string> = {
  usb: 'USB',
  bluetooth: 'Bluetooth',
  virtual: 'Virtual (app)',
  unknown: 'MIDI',
};

/** Device picker (when not connected) or live keyboard notes (when connected). */
export function MidiPanel({
  devices,
  device,
  status,
  snapshot,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  devices: MidiDevice[];
  device: MidiDevice | null;
  status: MidiStatus;
  snapshot: MidiSnapshot | null;
  onConnect: (id: number) => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  if (!device) {
    return (
      <View style={styles.panel}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Eyebrow>MIDI keyboards</Eyebrow>
            <AppText color={colors.textSecondary} variant="caption">
              Connect a keyboard with a USB-OTG cable, then choose it here.
            </AppText>
          </View>
          <IconButton icon="refresh" label="Refresh MIDI devices" onPress={onRefresh} />
        </View>
        {devices.length === 0 ? (
          <Banner tone="info">No MIDI keyboard found. Check the cable and that the keyboard is switched on.</Banner>
        ) : (
          devices.map((d) => (
            <ListRow
              icon="hardware-chip-outline"
              key={d.id}
              onPress={status === 'connecting' ? undefined : () => onConnect(d.id)}
              subtitle={`${TRANSPORT[d.transport]} · tap to connect`}
              title={d.name}
            />
          ))
        )}
      </View>
    );
  }

  const last = snapshot?.lastNote;
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Keyboard notes</Eyebrow>
          <AppText accessibilityLabel={last ? `Last note ${last.label}, velocity ${last.velocity}` : 'No notes yet'} variant="title">
            {last?.label ?? '—'}
          </AppText>
          {last ? (
            <AppText color={colors.textSecondary} variant="caption">
              {`Velocity ${last.velocity}`}
            </AppText>
          ) : null}
        </View>
        <View style={styles.status}>
          <View style={[styles.dot, status === 'listening' && styles.dotOn]} />
          <AppText color={colors.primaryDark} variant="caption">
            {device.name}
          </AppText>
        </View>
      </View>
      <View style={styles.held}>
        <AppText color={colors.textSecondary} variant="caption">
          Held
        </AppText>
        {(snapshot?.heldNotes.length ? snapshot.heldNotes : ['·']).map((n, i) => (
          <View key={`${n}-${i}`} style={styles.note}>
            <AppText color={colors.primaryDark} variant="caption">
              {n}
            </AppText>
          </View>
        ))}
      </View>
      <AppText color={colors.textSecondary} variant="caption">
        Key estimate is based on what you play on the keyboard, not on the singer’s melody.
      </AppText>
      <Button icon="close" label="Disconnect keyboard" onPress={onDisconnect} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.light,
    maxWidth: '50%',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSecondary },
  dotOn: { backgroundColor: colors.primary },
  held: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  note: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
});
