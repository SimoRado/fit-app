export const PRESS_IN_DURATION_MS = 80;
export const PRESS_OUT_DURATION_MS = 140;
export const TAB_SELECTION_DURATION_MS = 170;

export function pressTarget(requestedScale: number, disabled: boolean, reducedMotion: boolean) {
  if (disabled || reducedMotion) return 1;
  return Math.max(0.97, Math.min(0.98, Number.isFinite(requestedScale) ? requestedScale : 0.98));
}

/**
 * Shared motion timings (ms). One place so sheets, selectors and toggles feel like one system.
 * Actions never wait for these: feedback runs alongside the work.
 */
export const MOTION = {
  sheetOpen: 300,
  sheetClose: 230,
  segment: 220,
  toggle: 180,
  fade: 200,
} as const;
