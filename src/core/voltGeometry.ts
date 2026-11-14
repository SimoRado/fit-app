/**
 * Pure geometry for the Volt progress graphics, kept free of React Native so it
 * can be unit-tested. Values mirror the prototype's `SqRings` and `Horseshoe`.
 */

/** `SqRings`: 136×136 viewBox, 10px strokes, 15px step, corner radius max(6, 30 − 7i). */
export const SQUARE_RINGS = { size: 136, stroke: 10, step: 15 } as const;

export function squareRing(index: number) {
  const { size, stroke, step } = SQUARE_RINGS;
  const offset = stroke / 2 + index * step;
  const width = size - 2 * offset;
  const radius = Math.max(6, 30 - index * 7);
  return { offset, width, radius, length: roundedRectLength(width, radius) };
}

/** Perimeter of a square with rounded corners (stroke dash length). */
export function roundedRectLength(width: number, radius: number) {
  return 4 * (width - 2 * radius) + 2 * Math.PI * radius;
}

/** Visible fraction for a ring; the prototype always shows at least a 1% dot. */
export const ringFraction = (value: number) => Math.max(0.01, Math.min(1, Number.isFinite(value) ? value : 0));

/** `Horseshoe`: 240° arc (from 210° to −30°) centred at (120,116) in a 240×196 viewBox. */
export const HORSESHOE = { radius: 96, cx: 120, cy: 116, start: Math.PI * 7 / 6, end: -Math.PI / 6 } as const;

export function horseshoePoint(angle: number, radius: number = HORSESHOE.radius) {
  return [HORSESHOE.cx + radius * Math.cos(angle), HORSESHOE.cy - radius * Math.sin(angle)] as const;
}

export function horseshoeArc(radius: number = HORSESHOE.radius) {
  const [x0, y0] = horseshoePoint(HORSESHOE.start, radius), [x1, y1] = horseshoePoint(HORSESHOE.end, radius);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${radius} ${radius} 0 1 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export const horseshoeLength = (radius: number = HORSESHOE.radius) => radius * (HORSESHOE.start - HORSESHOE.end);

/** Badge position along the main arc for a consumed/target ratio (clamped to the arc). */
export function horseshoeBadge(ratio: number) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return horseshoePoint(HORSESHOE.start - (HORSESHOE.start - HORSESHOE.end) * clamped);
}

/** Prototype daily progress: average of the available ring values, each capped at 100%. */
export function dailyProgressPercent(values: (number | null)[]) {
  const counted = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return counted.length ? Math.round(counted.reduce((sum, value) => sum + Math.min(1, Math.max(0, value)), 0) / counted.length * 100) : null;
}
