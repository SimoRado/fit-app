import { describe, expect, it } from 'vitest';
import { bestWeekday, comparePeriods, dayBars, habitBreakdown, periodStats } from '../src/core/habitStats';
import type { HistoryDay, HistoryItem } from '../src/core/habitHistory';

const item = (h: string, n: string, d: 0 | 1): HistoryItem => ({ h, n, i: 'x', c: 'Body', t: 'b', d });
const day = (date: string, items: HistoryItem[]): HistoryDay => ({ day: date, status: 'final', source: 'tracked', eligible: items.length, completed: items.reduce((s, i) => s + i.d, 0), percent: 0, items });

// Mon 16 – Sun 22 Nov 2026, today Wed 18.
const rows = [
  day('2026-11-16', [item('water', 'Drink 2L', 1), item('read', 'Read 20 min', 1), item('study', 'Study 1h', 0)]),
  day('2026-11-17', [item('water', 'Drink 2L', 1), item('read', 'Read 20 min', 1)]),
  day('2026-11-18', [item('water', 'Drink 2L', 1), item('read', 'Read 20 minutes', 1), item('study', 'Study 1h', 1)]),
];

describe('habit statistics from history snapshots', () => {
  it('sums only habits that were eligible each day', () => {
    expect(periodStats(rows, '2026-11-16', '2026-11-22')).toEqual({ due: 8, done: 7, percent: 88, consistentDays: 2, trackedDays: 3 });
  });
  it('a deleted habit keeps its past days; a habit added later does not change them', () => {
    // "study" absent on Tuesday: it was not eligible that day, so Tuesday stays 2/2.
    expect(dayBars(rows, ['2026-11-17'], '2026-11-18')[0]).toMatchObject({ due: 2, done: 2, value: 1 });
  });
  it('marks future days and days without data instead of inventing zeros', () => {
    const bars = dayBars(rows, ['2026-11-18', '2026-11-19', '2026-11-15'], '2026-11-18');
    expect(bars.map(b => [b.value, b.future, b.today])).toEqual([[1, false, true], [null, true, false], [null, false, false]]);
  });
  it('per-habit rates use each habit’s own eligible days and latest name', () => {
    expect(habitBreakdown(rows, '2026-11-16', '2026-11-22')).toEqual([
      { id: 'water', name: 'Drink 2L', due: 3, done: 3, percent: 100 },
      { id: 'read', name: 'Read 20 minutes', due: 3, done: 3, percent: 100 },
      { id: 'study', name: 'Study 1h', due: 2, done: 1, percent: 50 },
    ]);
  });
  it('comparison is unavailable when the previous period has no records', () => {
    const current = periodStats(rows, '2026-11-16', '2026-11-22');
    expect(comparePeriods(current, periodStats(rows, '2026-11-09', '2026-11-15'))).toBeNull();
    expect(comparePeriods(current, periodStats(rows.slice(0, 1), '2026-11-16', '2026-11-16'))).toBe(21);
  });
  it('best weekday needs enough recorded days', () => {
    const weekday = (d: string) => new Date(`${d}T12:00:00`).getDay();
    expect(bestWeekday(rows.slice(0, 2), weekday)).toBeNull();
    expect(bestWeekday(rows, weekday)).toBe(2); // Tuesday (2/2) beats Monday (2/3) and ties Wednesday, earliest wins
  });
});
