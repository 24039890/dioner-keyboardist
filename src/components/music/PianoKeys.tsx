import { StyleSheet, View } from 'react-native';

import { formatNoteName, spellPitchClass } from '@/features/music-theory';
import { colors } from '@/theme/tokens';

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** Black keys with their position (in white-key widths) from the left edge. */
const BLACK: { pc: number; at: number }[] = [
  { pc: 1, at: 1 },
  { pc: 3, at: 2 },
  { pc: 6, at: 4 },
  { pc: 8, at: 5 },
  { pc: 10, at: 6 },
];

/** One-octave keyboard (C–B) with highlighted pitch classes. */
export function PianoKeys({ highlight = [], height = 120 }: { highlight?: number[]; height?: number }) {
  const set = new Set(highlight.map((p) => ((p % 12) + 12) % 12));
  const names = [...set].map((pc) => formatNoteName(spellPitchClass(pc, false))).join(', ');
  return (
    <View
      accessibilityLabel={set.size ? `Keyboard with ${names} highlighted` : 'Keyboard, one octave'}
      accessible
      style={[styles.board, { height }]}
    >
      {WHITE.map((pc) => (
        <View key={pc} style={[styles.white, set.has(pc) && styles.whiteOn]}>
          {set.has(pc) ? <View style={styles.dot} /> : null}
        </View>
      ))}
      {BLACK.map(({ pc, at }) => (
        <View key={pc} style={[styles.black, { left: `${(at / 7) * 100 - 5.5}%`, height: height * 0.6 }, set.has(pc) && styles.blackOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.pale,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.white,
  },
  white: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: colors.pale,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  whiteOn: { backgroundColor: colors.pale },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  black: {
    position: 'absolute',
    top: 0,
    width: '11%',
    backgroundColor: colors.text,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  blackOn: { backgroundColor: colors.primary },
});
