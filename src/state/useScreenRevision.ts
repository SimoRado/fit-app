import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useApp } from './app';

/**
 * Data revision for a screen that stays mounted in the tab navigator.
 *
 * `changed()` bumps the global revision after every save. Previously every mounted tab reloaded
 * all of its SQLite data on each bump, even when hidden, which competed with the user's next action.
 * This returns the global revision only while the screen is focused, and catches up once when the
 * screen is focused again, so hidden tabs stay idle and visible data is never stale.
 */
export function useScreenRevision() {
  const { revision } = useApp();
  const [seen, setSeen] = useState(revision);
  useFocusEffect(useCallback(() => { setSeen(revision); }, [revision]));
  return seen;
}
