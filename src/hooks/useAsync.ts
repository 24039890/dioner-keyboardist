import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: Error };

/**
 * Loads data whenever the screen gains focus (so lists refresh after editing
 * on another screen) and whenever `load` changes. Pass a memoised callback
 * (useCallback). Ignores results that arrive after the screen blurs.
 */
export function useFocusedQuery<T>(load: () => Promise<T>): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: null, error: null });
  const generation = useRef(0);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setState((s) => ({ status: 'loading', data: s.data, error: null }));
    load().then(
      (data) => {
        if (gen === generation.current) setState({ status: 'ready', data, error: null });
      },
      (e: unknown) => {
        if (gen === generation.current)
          setState((s) => ({ status: 'error', data: s.data, error: e instanceof Error ? e : new Error(String(e)) }));
      },
    );
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        generation.current++;
      };
    }, [reload]),
  );

  return { ...state, reload };
}
