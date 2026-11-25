/**
 * Weight chart data mapping (pure, no React).
 *
 * - One point per calendar day: the newest weigh-in of that day.
 * - Points are placed at their real dates; days without a weigh-in are simply
 *   gaps along the x-axis, never invented values.
 * - The curve uses monotone cubic interpolation (Fritsch–Carlson), so it never
 *   overshoots above or below the recorded values.
 */
import { addDays, fromDay, validDay } from './date';
import type { WeightEntry } from './types';

/** Whole calendar days from `a` to `b` (noon-anchored, so daylight-saving shifts round away). */
export const dayOffset = (a: string, b: string) => Math.round((fromDay(b).getTime() - fromDay(a).getTime()) / 86400000);

export type WeightPoint = { id: string; day: string; kg: number };

/** Newest entry per day, ascending by day. Malformed dates are ignored. */
export function dailyWeights(entries: readonly WeightEntry[]): WeightPoint[] {
  const byDay = new Map<string, WeightEntry>();
  for (const entry of entries) {
    if (!validDay(entry.day) || !Number.isFinite(entry.kg)) continue;
    const current = byDay.get(entry.day);
    if (!current || entry.created_at.localeCompare(current.created_at) > 0) byDay.set(entry.day, entry);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map(entry => ({ id: entry.id, day: entry.day, kg: entry.kg }));
}

/** Calendar window ending today: `days` = 7 covers today and the six days before it. */
export function windowStart(today: string, days: number) {
  return addDays(today, 1 - days);
}

export function pointsInWindow(points: readonly WeightPoint[], start: string, end: string) {
  return points.filter(point => point.day >= start && point.day <= end);
}

export type ChartBox = { width: number; height: number; left: number; right: number; top: number; bottom: number };
export type PlacedPoint = WeightPoint & { x: number; y: number };
export type ChartGeometry = { points: PlacedPoint[]; line: string; area: string; lo: number; hi: number; ticks: number[]; yOf: (kg: number) => number; xOf: (day: string) => number };

/**
 * Places points by date between `start` and `end` (inclusive) and fits the
 * y-range to the data with half-kilogram steps.
 */
export function chartGeometry(points: readonly WeightPoint[], start: string, end: string, box: ChartBox, tickCount = 5): ChartGeometry {
  const span = Math.max(1, dayOffset(start, end));
  const plotW = Math.max(0, box.width - box.left - box.right);
  const plotH = Math.max(0, box.height - box.top - box.bottom);
  const values = points.map(point => point.kg);
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 1;
  let lo = Math.floor(min * 2) / 2, hi = Math.ceil(max * 2) / 2;
  if (hi - lo < 1) { const mid = (lo + hi) / 2; lo = Math.floor((mid - 0.5) * 2) / 2; hi = lo + 1; }
  const xOf = (day: string) => box.left + dayOffset(start, day) / span * plotW;
  const yOf = (kg: number) => box.top + (hi - kg) / (hi - lo) * plotH;
  const placed = points.map(point => ({ ...point, x: xOf(point.day), y: yOf(point.kg) }));
  const line = monotonePath(placed);
  const baseline = box.top + plotH;
  const area = placed.length > 1 ? `${line}L${placed.at(-1)!.x.toFixed(1)} ${baseline.toFixed(1)}L${placed[0].x.toFixed(1)} ${baseline.toFixed(1)}Z` : '';
  const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((lo + (hi - lo) * i / (tickCount - 1)) * 10) / 10);
  return { points: placed, line, area, lo, hi, ticks, yOf, xOf };
}

/** Monotone cubic Bézier path through points sorted by x. */
export function monotonePath(points: readonly { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  const f = (value: number) => value.toFixed(1);
  if (n === 1) return `M${f(points[0].x)} ${f(points[0].y)}`;
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = points[i + 1].x - points[i].x; slope[i] = dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]; }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  tangent[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); tangent[i] = t * a * slope[i]; tangent[i + 1] = t * b * slope[i]; }
  }
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i], p1 = points[i + 1], h = dx[i] / 3;
    d += `C${f(p0.x + h)} ${f(p0.y + tangent[i] * h)} ${f(p1.x - h)} ${f(p1.y - tangent[i + 1] * h)} ${f(p1.x)} ${f(p1.y)}`;
  }
  return d;
}

/**
 * X-axis ticks for the 7D / 30D / 90D weight chart. Ticks come from the selected date domain
 * (`start`…`end`), never from where the weigh-ins happen to be, so they are evenly spread along the
 * timeline whatever the data looks like and never pile up on clustered points.
 *
 * - 7D: every other day from the start (four labels, e.g. 19, 21, 23, 25 Nov) — formatted "19 Nov".
 * - 30D: days of the month 1, 5, 10, 15, 20, 25, 30 that fall in the window — formatted "15". The
 *   1st wins over a nearby 30th/31st when the window crosses a month.
 * - 90D: the 15th of each month in the window — formatted "Sep 15" — plus one edge tick when only
 *   two mid-months fit and the edge is far enough away.
 *
 * A minimum gap (in days) between ticks guarantees labels never overlap.
 */
export type AxisRange = 7 | 30 | 90;
export type AxisTick = { day: string; kind: 'dayMonth' | 'day' | 'monthDay' };

const TICK_GAP: Record<AxisRange, number> = { 7: 2, 30: 4, 90: 20 };

function spaced(candidates: { day: string; priority: number }[], minGap: number) {
  const kept: string[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.priority - b.priority || a.day.localeCompare(b.day))) {
    if (kept.every(day => Math.abs(dayOffset(day, candidate.day)) >= minGap)) kept.push(candidate.day);
  }
  return kept.sort();
}

export function axisTicks(range: AxisRange, start: string, end: string): AxisTick[] {
  if (!validDay(start) || !validDay(end) || end < start) return [];
  const span = dayOffset(start, end);
  const days: string[] = [];
  for (let i = 0; i <= span; i++) days.push(addDays(start, i));
  const dom = (day: string) => Number(day.slice(8, 10));
  if (range === 7) {
    // Anchor on the last day so today is always labelled: …, today-4, today-2, today.
    return days.filter((_, i) => (span - i) % 2 === 0).map(day => ({ day, kind: 'dayMonth' }));
  }
  if (range === 30) {
    const marks = [1, 5, 10, 15, 20, 25, 30];
    const candidates = days.filter(day => marks.includes(dom(day))).map(day => ({ day, priority: dom(day) === 1 ? 0 : dom(day) === 15 ? 1 : 2 }));
    return spaced(candidates, TICK_GAP[30]).map(day => ({ day, kind: 'day' }));
  }
  const mids = days.filter(day => dom(day) === 15);
  const ticks = [...mids];
  if (ticks.length < 3) {
    // Only two mid-months fit: add the edge with the most room, if it is far enough from them.
    const gapStart = ticks.length ? dayOffset(start, ticks[0]) : span;
    const gapEnd = ticks.length ? dayOffset(ticks.at(-1)!, end) : span;
    const edge = gapEnd >= gapStart ? end : start;
    if (Math.max(gapStart, gapEnd) >= TICK_GAP[90]) ticks.push(edge);
  }
  return ticks.sort().map(day => ({ day, kind: 'monthDay' }));
}
