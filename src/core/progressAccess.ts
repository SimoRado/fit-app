import { addDays, dayKey, fromDay, weekStart } from './date';

/**
 * Free / Pro rules for the Progress page (calendar months, never a rolling window).
 *
 * - Free: Day, Week and Month periods that reach into the current calendar month; inside them only
 *   dates from the 1st of this month onward are counted or shown. Year is Pro only.
 * - Pro: every past period, including the full days of weeks that cross into the previous month.
 *
 * `isPro` must be the verified RevenueCat entitlement (`useSubscription().isPremium`). These are
 * visibility rules only: no history is ever deleted.
 */
export type ProgressPeriod = 'Day' | 'Week' | 'Month' | 'Year';

export const monthStartOf = (day: string) => `${day.slice(0, 7)}-01`;
const monthEndOf = (day: string) => { const date = fromDay(monthStartOf(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)); };
const shiftMonth = (day: string, offset: number) => { const date = fromDay(monthStartOf(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + offset, 1, 12)); };

/** The calendar range shown for `offset` periods before (negative) or after today's period. */
export function progressRange(period: ProgressPeriod, offset: number, today: string): { start: string; end: string } {
  if (period === 'Day') { const day = addDays(today, offset); return { start: day, end: day }; }
  if (period === 'Week') { const start = addDays(weekStart(today), offset * 7); return { start, end: addDays(start, 6) }; }
  if (period === 'Month') { const start = shiftMonth(today, offset); return { start, end: monthEndOf(start) }; }
  const year = fromDay(today).getFullYear() + offset;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** True when the plan may open this period (Free: Year never, others only if they reach this month). */
export function canViewProgressPeriod(period: ProgressPeriod, offset: number, today: string, isPro: boolean) {
  if (isPro) return true;
  if (period === 'Year') return false;
  return progressRange(period, offset, today).end >= monthStartOf(today);
}

/** First date whose records the plan may count: the 1st of this month for Free, none for Pro. */
export const progressFloor = (today: string, isPro: boolean) => (isPro ? null : monthStartOf(today));

/** The part of a range the plan may see (Free weeks that cross into last month start on the 1st). */
export function visibleProgressRange(range: { start: string; end: string }, today: string, isPro: boolean) {
  const floor = progressFloor(today, isPro);
  return floor && range.start < floor ? { start: floor, end: range.end } : range;
}

/**
 * Every period change goes through here: tabs, arrows, an expired entitlement or a stale selection.
 * A locked request resolves to the current period of the same view (Year falls back to Month);
 * `locked` tells the page to offer the paywall.
 */
export function guardProgressPeriod(period: ProgressPeriod, offset: number, today: string, isPro: boolean): { period: ProgressPeriod; offset: number; locked: boolean } {
  const safeOffset = Math.min(0, Math.trunc(offset) || 0); // future periods are not shown
  if (canViewProgressPeriod(period, safeOffset, today, isPro)) return { period, offset: safeOffset, locked: false };
  return { period: period === 'Year' ? 'Month' : period, offset: 0, locked: true };
}
