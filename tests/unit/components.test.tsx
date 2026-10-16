/**
 * Component tests (React Native Testing Library, rendered in Jest — not on a device).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { KeyPanel } from '@/features/live-keys/components/KeyPanel';
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

describe('KeyPanel', () => {
  test('idle state shows no key', async () => {
    await render(<KeyPanel manualKey={null} reading={null} status="idle" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Not listening')).toBeTruthy();
  });

  test('insufficient evidence never shows a key', async () => {
    await render(<KeyPanel manualKey={null} reading={reading({ status: 'insufficient', key: null, level: null })} status="listening" />);
    expect(screen.getByText('Listening…')).toBeTruthy();
    expect(screen.getByText('Not enough evidence yet')).toBeTruthy();
    expect(screen.queryByText('C Major')).toBeNull();
  });

  test('ambiguous relative keys are explained', async () => {
    await render(
      <KeyPanel
        manualKey={null}
        reading={reading({ status: 'ambiguous', key: null, level: null, relativeAmbiguity: true })}
        status="listening"
      />,
    );
    expect(screen.getByText('Undetermined')).toBeTruthy();
    expect(screen.getByText(/C Major and A Minor/)).toBeTruthy();
  });

  test('estimated key with confidence and a possible key change', async () => {
    await render(<KeyPanel manualKey={null} reading={reading({ possibleKeyChange: { tonic: 3, mode: 'major' } })} status="listening" />);
    expect(screen.getByText('C Major')).toBeTruthy();
    expect(screen.getByText('High confidence')).toBeTruthy();
    expect(screen.getByText(/Possible key change → E♭ Major/)).toBeTruthy();
  });

  test('manual key overrides and mentions the detected key', async () => {
    await render(<KeyPanel manualKey={{ tonic: 2, mode: 'major' }} reading={reading({})} status="listening" />);
    expect(screen.getByText('D Major')).toBeTruthy();
    expect(screen.getByText('Set manually')).toBeTruthy();
    expect(screen.getByText(/currently suggests C Major/)).toBeTruthy();
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
