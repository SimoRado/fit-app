import { monthKey, shiftMonth } from './habitHistory';

/**
 * Free / Pro rules shared by the Habits, Workouts and Nutrition calendars.
 *
 * - Both plans: the current month, plus any future months a page allows for planning
 *   (`futureMonths`). Planning ahead is never a Pro feature.
 * - Pro only: earlier months and the yearly view.
 *
 * `isPro` must come from the verified RevenueCat entitlement (`useSubscription().isPremium`), never a
 * stored or client-supplied flag. Losing Pro never deletes anything: it only narrows what can be shown.
 */
export type CalendarAccess = {
  /** YYYY-MM of today. */
  current: string;
  isPro: boolean;
  canBrowseMonth: (month: string) => boolean;
  /** True when `month` exists but is hidden only because it is in the past and the plan is Free. */
  needsPro: (month: string) => boolean;
  canOpenYear: boolean;
};

export function calendarAccess(isPro: boolean, today: string, futureMonths = 0): CalendarAccess {
  const current = monthKey(today);
  const last = shiftMonth(current, Math.max(0, futureMonths));
  return {
    current,
    isPro,
    canBrowseMonth: month => month === current || (month < current ? isPro : month <= last),
    needsPro: month => month < current && !isPro,
    canOpenYear: isPro,
  };
}

/**
 * Every month change goes through here: buttons, year → month taps, restored state and an expired
 * entitlement. A month that may not be shown resolves to the current month; `locked` says whether the
 * reason was Pro (so the page can show the upgrade prompt) rather than an out-of-range future month.
 */
export function guardMonth(access: CalendarAccess, requested: string): { month: string; locked: boolean } {
  if (access.canBrowseMonth(requested)) return { month: requested, locked: false };
  return { month: access.current, locked: access.needsPro(requested) };
}

/** Days a calendar may show detail for: everything in a month the plan can browse. */
export const canSeeDay = (access: CalendarAccess, day: string) => access.canBrowseMonth(monthKey(day));
