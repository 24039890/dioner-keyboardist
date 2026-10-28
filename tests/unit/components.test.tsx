/**
 * Component tests (React Native Testing Library, rendered in Jest — not on a device).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { KeyPanel } from '@/features/live-keys/components/KeyPanel';
import { TransposeCard } from '@/features/live-keys/components/TransposeCard';
import type { KeyReading } from '@/features/live-keys/engine/keyEstimator';
import { TranspositionWorkspace, lineToNumbers } from '@/features/songs/components/TranspositionWorkspace';

const reading = (over: Partial<KeyReading>): KeyReading => ({
  status: 'estimated',
  key: { tonic: 0, mode: 'major' },
  level: 'high',
  score: 0.9,
  relativeAmbiguity: false,
  candidates: [{ key: { tonic: 0, mode: 'major' }, score: 0.9 }],
  possibleKeyChange: null,
  evidence: 12,
  ...over,
});

const noop = () => undefined;

describe('KeyPanel', () => {
  test('idle state invites the user to start', async () => {
    await render(<KeyPanel manualKey={null} onHoldKey={noop} onPickKey={noop} reading={null} status="idle" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Tap Start and play or sing')).toBeTruthy();
  });

  test('insufficient evidence shows progress and never a key', async () => {
    await render(
      <KeyPanel
        manualKey={null}
        onHoldKey={noop}
        onPickKey={noop}
        reading={reading({ status: 'insufficient', key: null, level: null, evidence: 1.25 })}
        status="listening"
      />,
    );
    expect(screen.getByText('Listening…')).toBeTruthy();
    expect(screen.getByLabelText('Listening progress').props.accessibilityValue.now).toBe(50);
    expect(screen.queryByText('C Major')).toBeNull();
  });

  test('a close call offers one-tap choices including the relative key', async () => {
    const picked: string[] = [];
    await render(
      <KeyPanel
        manualKey={null}
        onHoldKey={noop}
        onPickKey={(k) => picked.push(`${k.tonic}:${k.mode}`)}
        reading={reading({
          status: 'ambiguous',
          key: null,
          level: null,
          relativeAmbiguity: true,
          candidates: [
            { key: { tonic: 0, mode: 'major' }, score: 0.7 },
            { key: { tonic: 7, mode: 'major' }, score: 0.69 },
          ],
        })}
        status="listening"
      />,
    );
    expect(screen.getByText('Close call')).toBeTruthy();
    expect(screen.getByText('G Major')).toBeTruthy();
    await fireEvent.press(screen.getByText('A Minor'));
    expect(picked).toEqual(['9:minor']);
  });

  test('estimated key shows confidence, its main chords, hold and a possible key change', async () => {
    const held: string[] = [];
    await render(
      <KeyPanel
        manualKey={null}
        onHoldKey={(k) => held.push(`${k.tonic}`)}
        onPickKey={noop}
        reading={reading({ possibleKeyChange: { tonic: 3, mode: 'major' } })}
        status="listening"
      />,
    );
    expect(screen.getByText('C Major')).toBeTruthy();
    expect(screen.getByText('Sure')).toBeTruthy();
    expect(screen.getByText(/C · F · G · Am/)).toBeTruthy();
    expect(screen.getByText(/Key may be changing → E♭ Major/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Hold this key'));
    expect(held).toEqual(['0']);
  });

  test('after stopping, the last result stays visible', async () => {
    await render(<KeyPanel manualKey={null} onHoldKey={noop} onPickKey={noop} reading={reading({})} status="idle" />);
    expect(screen.getByText('C Major')).toBeTruthy();
    expect(screen.getByText('Last result')).toBeTruthy();
  });

  test('a held key overrides and mentions what the music suggests', async () => {
    await render(
      <KeyPanel manualKey={{ tonic: 2, mode: 'major' }} onHoldKey={noop} onPickKey={noop} reading={reading({})} status="listening" />,
    );
    expect(screen.getByText('D Major')).toBeTruthy();
    expect(screen.getByText(/music now suggests C Major/)).toBeTruthy();
  });
});

describe('TransposeCard', () => {
  test('asks for the keyboardist key when not set', async () => {
    let asked = 0;
    await render(<TransposeCard onChangePlayKey={() => asked++} playKey={null} songKey={null} />);
    await fireEvent.press(screen.getByText('Set my key'));
    expect(asked).toBe(1);
  });

  test('shows the transpose value and chord map for the detected song key', async () => {
    await render(<TransposeCard onChangePlayKey={noop} playKey={{ tonic: 0, mode: 'major' }} songKey={{ tonic: 2, mode: 'major' }} />);
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText('Set Transpose to +2')).toBeTruthy();
    expect(screen.getByText('Bm')).toBeTruthy();
  });

  test('waits for a song key and handles same key', async () => {
    await render(<TransposeCard onChangePlayKey={noop} playKey={{ tonic: 0, mode: 'major' }} songKey={null} />);
    expect(screen.getByText(/once the song key is found/)).toBeTruthy();
    await render(<TransposeCard onChangePlayKey={noop} playKey={{ tonic: 0, mode: 'major' }} songKey={{ tonic: 9, mode: 'minor' }} />);
    expect(screen.getByText(/The song is in your key/)).toBeTruthy();
  });
});

function Harness() {
  const [offset, setOffset] = useState(0);
  return (
    <TranspositionWorkspace
      offset={offset}
      onOffsetChange={setOffset}
      originalKey={{ tonic: 0, mode: 'major' }}
      sections={[{ id: 'a', label: 'Verse', chords: 'C | G | Am | F' }]}
    />
  );
}

describe('TranspositionWorkspace', () => {
  test('stepping the offset updates the displayed progression; reset restores it', async () => {
    await render(<Harness />);
    expect(screen.getByText('C | G | Am | F')).toBeTruthy();
    const up = screen.getByLabelText('Up one semitone');
    await fireEvent.press(up);
    await fireEvent.press(up);
    expect(screen.getByText('D | A | Bm | G')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
    // Original line is still shown above the preview.
    expect(screen.getByText('C | G | Am | F')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Down one semitone'));
    await fireEvent.press(screen.getByLabelText('Down one semitone'));
    await fireEvent.press(screen.getByLabelText('Down one semitone'));
    expect(screen.getByText('B | F♯ | G♯m | E')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reset'));
    // "Original" now labels both the key column and the offset; the chart shows only once.
    expect(screen.getAllByText('Original')).toHaveLength(2);
    expect(screen.getAllByText('C | G | Am | F')).toHaveLength(1);
  });

  test('number-system toggle shows degrees relative to the key', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByText('Number system'));
    expect(screen.getByText('1 | 5 | 6m | 4')).toBeTruthy();
    expect(lineToNumbers('C/E | Bb | Xyz', { tonic: 0, mode: 'major' })).toBe('1/3 | ♭7 | Xyz');
  });
});
