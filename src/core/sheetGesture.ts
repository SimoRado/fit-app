/**
 * Drag-to-dismiss rules for the shared bottom sheet (`src/ui/BottomSheet.tsx`). Pure functions so the
 * gesture decisions are unit tested. Distances are px; velocities are PanResponder px/ms.
 */
export const SHEET_GESTURE = {
  /** Vertical travel before the header claims the touch (keeps taps on the X button working). */
  claimDistance: 6,
  /** Release past this distance closes the sheet. */
  dismissDistance: 110,
  /** A downward flick this fast closes the sheet… */
  dismissVelocity: 0.9,
  /** …once it has moved at least this far (a twitch on release is not a flick). */
  flickMinDistance: 24,
  /** Upward drags move the sheet only this fraction of the finger (never past its open position by much). */
  upwardResistance: 0.12,
  maxUpward: 18,
} as const;

/** The header takes the gesture only for a mostly-vertical, downward drag. */
export function sheetShouldClaim(dx: number, dy: number) {
  return dy > SHEET_GESTURE.claimDistance && Math.abs(dy) > Math.abs(dx);
}

/** Finger travel → sheet offset: 1:1 downward, a small rubber band upward. */
export function sheetDragOffset(dy: number) {
  if (dy >= 0) return dy;
  return -Math.min(SHEET_GESTURE.maxUpward, -dy * SHEET_GESTURE.upwardResistance);
}

/** Close on release past the distance threshold, or on a real downward flick; upward never closes. */
export function sheetShouldDismiss(dy: number, vy: number) {
  if (dy <= 0) return false;
  return dy > SHEET_GESTURE.dismissDistance || (vy > SHEET_GESTURE.dismissVelocity && dy > SHEET_GESTURE.flickMinDistance);
}
