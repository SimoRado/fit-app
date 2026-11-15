/**
 * Local-calendar week maths for the shared week selector. Days are `YYYY-MM-DD` strings and all
 * arithmetic goes through `fromDay`/`addDays`, which work at local noon, so daylight-saving changes
 * and UTC offsets never shift a selected day.
 */
import { addDays, dayKey, fromDay } from './date';

export type WeekStartsOn = 0 | 1; // 0 = Sunday, 1 = Monday

export function startOfWeek(day: string, startsOn: WeekStartsOn = 1) {
  const offset = (fromDay(day).getDay() - startsOn + 7) % 7;
  return addDays(day, -offset);
}

export function weekDays(day: string, startsOn: WeekStartsOn = 1) {
  const start = startOfWeek(day, startsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export const shiftWeek = (day: string, weeks: number) => addDays(day, weeks * 7);

export type WeekRules = {
  /** Earliest selectable day (inclusive). */
  minDay?: string;
  /** Latest selectable day (inclusive). */
  maxDay?: string;
  startsOn?: WeekStartsOn;
};

/** Whether the week containing `day` may be left backwards / forwards under `rules`. */
export function weekNavigation(day: string, rules: WeekRules = {}) {
  const days = weekDays(day, rules.startsOn);
  return {
    canPrevious: !rules.minDay || days[0] > rules.minDay,
    canNext: !rules.maxDay || days[6] < rules.maxDay,
  };
}

export const daySelectable = (day: string, rules: WeekRules = {}) => (!rules.minDay || day >= rules.minDay) && (!rules.maxDay || day <= rules.maxDay);

/** Clamps a day into the allowed range (used after week navigation and when returning to today). */
export function clampDay(day: string, rules: WeekRules = {}) {
  if (rules.minDay && day < rules.minDay) return rules.minDay;
  if (rules.maxDay && day > rules.maxDay) return rules.maxDay;
  return day;
}

/**
 * Moves to the previous/next week keeping the same weekday where possible, then clamps into the
 * allowed range so the selection is always a selectable day.
 */
export function moveSelectionByWeek(selected: string, weeks: number, rules: WeekRules = {}) {
  const { canPrevious, canNext } = weekNavigation(selected, rules);
  if ((weeks < 0 && !canPrevious) || (weeks > 0 && !canNext)) return selected;
  return clampDay(shiftWeek(selected, weeks), rules);
}

/** "9 – 15 Nov", "28 Oct – 3 Nov", or with years when the week crosses a year or is not this year. */
export function weekRangeLabel(day: string, locale = 'en-US', startsOn: WeekStartsOn = 1, today = dayKey()) {
  const days = weekDays(day, startsOn);
  const first = fromDay(days[0]), last = fromDay(days[6]);
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  const showYear = first.getFullYear() !== last.getFullYear() || last.getFullYear() !== fromDay(today).getFullYear();
  const end = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(showYear ? { year: 'numeric' } : {}) }).format(last);
  const start = sameMonth ? String(first.getDate()) : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(first.getFullYear() !== last.getFullYear() ? { year: 'numeric' } : {}) }).format(first);
  return `${start} – ${end}`;
}
