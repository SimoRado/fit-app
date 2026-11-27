import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canViewProgressPeriod, guardProgressPeriod, progressFloor, progressRange, visibleProgressRange } from '../src/core/progressAccess';

const today = '2026-11-27'; // Friday; weeks start on Monday (core/date weekStart).

describe('Free plan: current calendar month only', () => {
  it('allows current-month days and blocks earlier months (not a rolling window)', () => {
    expect(canViewProgressPeriod('Day', 0, today, false)).toBe(true);
    expect(canViewProgressPeriod('Day', -26, today, false)).toBe(true); // Nov 1
    expect(canViewProgressPeriod('Day', -27, today, false)).toBe(false); // Oct 31, only 27 days ago
  });
  it('allows weeks that reach into this month and blocks fully historical ones', () => {
    // Week of Oct 26 – Nov 1 crosses into November.
    expect(progressRange('Week', -4, today)).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(canViewProgressPeriod('Week', -4, today, false)).toBe(true);
    expect(canViewProgressPeriod('Week', -5, today, false)).toBe(false);
  });
  it('trims cross-month weeks to dates in this month', () => {
    expect(visibleProgressRange(progressRange('Week', -4, today), today, false)).toEqual({ start: '2026-11-01', end: '2026-11-01' });
    expect(progressFloor(today, false)).toBe('2026-11-01');
  });
  it('allows the current month, blocks previous months and Year', () => {
    expect(canViewProgressPeriod('Month', 0, today, false)).toBe(true);
    expect(canViewProgressPeriod('Month', -1, today, false)).toBe(false);
    expect(canViewProgressPeriod('Year', 0, today, false)).toBe(false);
  });
  it('resolves locked or stale selections to an allowed view and flags the paywall', () => {
    expect(guardProgressPeriod('Year', 0, today, false)).toEqual({ period: 'Month', offset: 0, locked: true });
    expect(guardProgressPeriod('Month', -3, today, false)).toEqual({ period: 'Month', offset: 0, locked: true });
    expect(guardProgressPeriod('Week', -4, today, false)).toEqual({ period: 'Week', offset: -4, locked: false });
    expect(guardProgressPeriod('Day', 5, today, false)).toEqual({ period: 'Day', offset: 0, locked: false }); // no future periods
  });
});

describe('Pro plan', () => {
  it('opens every past day, week, month and year with full ranges', () => {
    for (const period of ['Day', 'Week', 'Month', 'Year'] as const) expect(canViewProgressPeriod(period, -12, today, true)).toBe(true);
    expect(visibleProgressRange(progressRange('Week', -4, today), today, true)).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(progressFloor(today, true)).toBeNull();
  });
  it('drops back to the current period when Pro expires', () => {
    expect(guardProgressPeriod('Month', -2, today, true).locked).toBe(false);
    expect(guardProgressPeriod('Month', -2, today, false)).toEqual({ period: 'Month', offset: 0, locked: true });
  });
});

describe('calendar edges', () => {
  it('first and last day of a month', () => {
    expect(canViewProgressPeriod('Day', -1, '2026-12-01', false)).toBe(false);
    expect(canViewProgressPeriod('Day', -29, '2026-11-30', false)).toBe(true);
    expect(canViewProgressPeriod('Day', -30, '2026-11-30', false)).toBe(false);
  });
  it('December to January, including a week spanning the new year', () => {
    expect(progressRange('Month', -1, '2027-01-05')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(canViewProgressPeriod('Month', -1, '2027-01-05', false)).toBe(false);
    const week = progressRange('Week', -1, '2027-01-05'); // Dec 28 – Jan 3
    expect(week).toEqual({ start: '2026-12-28', end: '2027-01-03' });
    expect(visibleProgressRange(week, '2027-01-05', false)).toEqual({ start: '2027-01-01', end: '2027-01-03' });
  });
  it('leap-year February', () => {
    expect(progressRange('Month', 0, '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(canViewProgressPeriod('Day', -9, '2028-02-10', false)).toBe(true);
    expect(canViewProgressPeriod('Day', -10, '2028-02-10', false)).toBe(false);
  });
});

describe('Progress page wiring', () => {
  const page = readFileSync('src/app/(tabs)/progress.tsx', 'utf8');
  it('resolves every render through the guard and opens the paywall without moving the selection', () => {
    expect(page).toContain('guardProgressPeriod(requestedPeriod, requestedOffset, today, isPro)');
    expect(page).toContain("if (!canViewProgressPeriod(value, 0, today, isPro)) { openPaywall(); return; }");
    expect(page).toContain("if (!canViewProgressPeriod(period, offset - 1, today, isPro)) { openPaywall(); return; }");
    expect(page).toContain("router.push('/paywall')");
  });
  it('uses the verified entitlement and waits for it instead of guessing', () => {
    expect(page).toContain('const isPro = subscription.isPremium;');
    expect(page).toContain('const checking = !subscription.ready && !subscription.error;');
    expect(page).toContain('const waitingForPlan = checking &&');
  });
  it('counts only this month for Free everywhere (stats, bars, comparisons, insights)', () => {
    expect(page).toContain('const visibleHistory = floor ? history.filter(row => row.day >= floor) : history;');
    expect(page).not.toMatch(/periodStats\(history,|habitBreakdown\(history,|dayBars\(history,|bestWeekday\(history\./);
  });
  it('marks Year with a lock for Free users', () => {
    expect(page).toContain("icons={isPro ? undefined : { Year: 'lock-closed' }}");
  });
});
