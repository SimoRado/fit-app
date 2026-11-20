import { useCallback, useRef, useState } from 'react';
import { markTabPhase } from '../core/perf';

export type LoadStatus = 'loading' | 'ready' | 'error';
export type LoadEvent = 'success' | 'failure' | 'retry';

/**
 * Pure transition for a screen's first-load state.
 * - success → ready (and stays ready on later reads);
 * - failure before the first success → error (the skeleton always has an exit);
 * - failure after content is shown → stays ready (`firstLoadFailure: false`): the content stays
 *   visible and the caller reports the refresh error the way it always has;
 * - retry → loading.
 */
export function loadTransition(current: LoadStatus, event: LoadEvent): { status: LoadStatus; firstLoadFailure: boolean } {
  if (event === 'success') return { status: 'ready', firstLoadFailure: false };
  if (event === 'retry') return { status: 'loading', firstLoadFailure: false };
  return current === 'ready' ? { status: 'ready', firstLoadFailure: false } : { status: 'error', firstLoadFailure: true };
}

/**
 * First-load state for a screen whose data lives in component state.
 *
 * `loading` lasts only until the first successful read: later reloads (revision bumps after a
 * save or a cloud sync, another date or week) keep the current content on screen, never a
 * skeleton. `attempt` changes on `retry`, so effects that list it re-run the read.
 *
 * State is per mounted screen. The authenticated tree is keyed by the account id, so a
 * sign-out, account switch or account deletion discards it together with the screen.
 */
/** `route` (a tab route name) only labels the development-only timing log for the first content. */
export function useLoadState(route?: string) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const current = useRef<LoadStatus>('loading');
  const apply = useCallback((event: LoadEvent) => {
    const next = loadTransition(current.current, event);
    if (route && event === 'success' && current.current !== 'ready') markTabPhase(route, 'first content');
    current.current = next.status;
    setStatus(next.status);
    return next.firstLoadFailure;
  }, [route]);
  const succeed = useCallback(() => { apply('success'); }, [apply]);
  /** Returns true when this was a first-load failure (now shown as the error state). */
  const fail = useCallback(() => apply('failure'), [apply]);
  const retry = useCallback(() => { apply('retry'); setAttempt(value => value + 1); }, [apply]);
  return { status, attempt, succeed, fail, retry };
}
