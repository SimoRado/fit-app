/**
 * Habit statistics from the per-day history snapshots (`habit_days`).
 *
 * Each snapshot records the habits that were actually eligible that day, with
 * their name at the time and whether they were fully completed (measured
 * habits count only when the day's target was reached). Using snapshots means
 * a habit created, edited, archived or deleted later never rewrites the past.
 */
import type { HistoryDay, HistoryItem } from './habitHistory';

export type PeriodStats = { due: number; done: number; percent: number | null; consistentDays: number; trackedDays: number };

export function periodStats(rows: readonly HistoryDay[], start: string, end: string): PeriodStats {
  let due = 0, done = 0, consistentDays = 0, trackedDays = 0;
  for (const row of rows) {
    if (row.day < start || row.day > end || row.eligible <= 0) continue;
    trackedDays++;
    due += row.eligible;
    done += Math.min(row.completed, row.eligible);
    if (row.completed >= row.eligible) consistentDays++;
  }
  return { due, done, percent: due ? Math.round(done / due * 100) : null, consistentDays, trackedDays };
}

/** Percentage-point change, or null when either period has no recorded eligible habits. */
export function comparePeriods(current: PeriodStats, previous: PeriodStats): number | null {
  return current.percent === null || previous.percent === null ? null : current.percent - previous.percent;
}

export type DayBar = { day: string; value: number | null; future: boolean; today: boolean; due: number; done: number };

/** One bar per day; `value` is null when no habits were recorded as due that day. */
export function dayBars(rows: readonly HistoryDay[], days: readonly string[], today: string): DayBar[] {
  const byDay = new Map(rows.map(row => [row.day, row]));
  return days.map(day => {
    const row = byDay.get(day);
    const future = day > today;
    const due = !future && row ? row.eligible : 0;
    const done = !future && row ? Math.min(row.completed, row.eligible) : 0;
    return { day, value: due ? done / due : null, future, today: day === today, due, done };
  });
}

export type HabitBreakdown = { id: string; name: string; due: number; done: number; percent: number };

/** Per-habit completion across the period, named as on the most recent day it was due. */
export function habitBreakdown(rows: readonly HistoryDay[], start: string, end: string): HabitBreakdown[] {
  const totals = new Map<string, HabitBreakdown & { last: string }>();
  for (const row of rows) {
    if (row.day < start || row.day > end) continue;
    for (const item of row.items ?? [] as HistoryItem[]) {
      const current = totals.get(item.h) ?? { id: item.h, name: item.n, due: 0, done: 0, percent: 0, last: '' };
      current.due++;
      current.done += item.d;
      if (row.day >= current.last) { current.last = row.day; current.name = item.n; }
      totals.set(item.h, current);
    }
  }
  return [...totals.values()]
    .map(({ last: _last, ...item }) => ({ ...item, percent: Math.round(item.done / item.due * 100) }))
    .sort((a, b) => b.percent - a.percent || b.due - a.due || a.name.localeCompare(b.name));
}

/** Weekday (0 = Sunday) with the best completion rate, or null without enough data. */
export function bestWeekday(rows: readonly HistoryDay[], weekdayOf: (day: string) => number, minimumDays = 3): number | null {
  const totals = Array.from({ length: 7 }, () => ({ due: 0, done: 0, days: 0 }));
  for (const row of rows) {
    if (row.eligible <= 0) continue;
    const t = totals[weekdayOf(row.day)];
    t.due += row.eligible; t.done += Math.min(row.completed, row.eligible); t.days++;
  }
  const ranked = totals.map((t, weekday) => ({ weekday, rate: t.due ? t.done / t.due : -1, days: t.days }))
    .filter(t => t.rate >= 0 && t.days >= 1);
  if (ranked.reduce((sum, t) => sum + t.days, 0) < minimumDays) return null;
  ranked.sort((a, b) => b.rate - a.rate);
  return ranked[0]?.weekday ?? null;
}
