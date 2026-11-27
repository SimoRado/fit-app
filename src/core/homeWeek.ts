import { addDays, dayKey, fromDay } from './date';

/** Home only: how far back the week strip can reach (rolling, from the local calendar day). */
export const HOME_LOOKBACK_DAYS = 30;

/** Home uses Sunday-first weeks (the same order as its day pills). */
export function sundayWeekStart(day: string) {
  const date = fromDay(day);
  date.setDate(date.getDate() - date.getDay());
  return dayKey(date);
}

export const homeEarliestDay = (today: string) => addDays(today, -HOME_LOOKBACK_DAYS);

/** A day can be selected on Home only inside [today − 30 days, today]. */
export const homeDaySelectable = (day: string, today: string) => day <= today && day >= homeEarliestDay(today);

export function homeWeekBounds(weekStart: string, today: string) {
  return {
    canGoBack: addDays(weekStart, -1) >= homeEarliestDay(today),
    canGoForward: weekStart < sundayWeekStart(today),
  };
}

/** Clamp any requested day (saved state, a new week, a day that rolled over) into the Home range. */
export function clampHomeDay(day: string, today: string) {
  const earliest = homeEarliestDay(today);
  return day > today ? today : day < earliest ? earliest : day;
}

/**
 * Moves the strip one week and picks the day to select there: today when returning to the current
 * week, otherwise the same weekday clamped into the allowed range.
 */
export function shiftHomeWeek(weekStart: string, selected: string, direction: -1 | 1, today: string) {
  const { canGoBack, canGoForward } = homeWeekBounds(weekStart, today);
  if ((direction < 0 && !canGoBack) || (direction > 0 && !canGoForward)) return { weekStart, selected };
  const nextStart = addDays(weekStart, direction * 7);
  if (nextStart === sundayWeekStart(today)) return { weekStart: nextStart, selected: today };
  const sameWeekday = addDays(selected, direction * 7);
  const inWeek = sameWeekday < nextStart ? nextStart : sameWeekday > addDays(nextStart, 6) ? addDays(nextStart, 6) : sameWeekday;
  return { weekStart: nextStart, selected: clampHomeDay(inWeek, today) };
}

/** "This week", or a compact range such as "Nov 16–22" / "Oct 26 – Nov 1". */
export function homeWeekLabel(weekStart: string, today: string, locale = 'en-US') {
  if (weekStart === sundayWeekStart(today)) return 'This week';
  const start = fromDay(weekStart), end = fromDay(addDays(weekStart, 6));
  const month = (date: Date) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
  const day = (date: Date) => new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date);
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${day(start)}–${day(end)}`
    : `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`;
}
