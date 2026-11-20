import type { Sex } from './nutritionTargets';
import type { Appearance, StyleMode } from '../ui/theme';

/** Personalization choices shown as selected before the app-wide recolour has been applied. */
export type Pending = { sex?: Sex; styleMode?: StyleMode; appearance?: Appearance };

/** Removes pending choices the applied state already matches; returns `pending` itself when nothing changed. */
export function settlePending(pending: Pending, applied: { sex: Sex | null; styleMode: StyleMode; appearance: Appearance }): Pending {
  const next: Pending = { ...pending };
  let changed = false;
  if (next.sex !== undefined && next.sex === applied.sex) { delete next.sex; changed = true; }
  if (next.styleMode !== undefined && next.styleMode === applied.styleMode) { delete next.styleMode; changed = true; }
  // The sheet offers Light ('shore') and Dark ('abyss'); 'deep' is a legacy dark appearance.
  if (next.appearance !== undefined && (next.appearance === 'shore') === (applied.appearance === 'shore')) { delete next.appearance; changed = true; }
  return changed ? next : pending;
}
