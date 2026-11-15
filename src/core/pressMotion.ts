export const PRESS_IN_DURATION_MS = 70;
export const PRESS_OUT_DURATION_MS = 110;
export const TAB_SELECTION_DURATION_MS = 170;

export function pressTarget(requestedScale: number, disabled: boolean, reducedMotion: boolean) {
  if (disabled || reducedMotion) return 1;
  return Math.max(0.97, Math.min(0.98, Number.isFinite(requestedScale) ? requestedScale : 0.98));
}
