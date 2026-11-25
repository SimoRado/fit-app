import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { axisTicks, chartGeometry, dailyWeights, dayOffset, pointsInWindow, windowStart, type WeightPoint } from '../src/core/weightChart';
import { axisLabel } from '../src/ui/dates';
import { canUseWeightRange, effectiveWeightRange, parseWeightRange, proStatus, weightRangeDays, weightRangeTap, type ProSignal } from '../src/core/proAccess';
import { SHEET_GESTURE, sheetDragOffset, sheetShouldClaim, sheetShouldDismiss } from '../src/core/sheetGesture';
import type { WeightEntry } from '../src/core/types';

const source = (path: string) => readFileSync(path, 'utf8');
const days = (ticks: { day: string }[]) => ticks.map(tick => tick.day);
const en = (range: 7 | 30 | 90, start: string, end: string) => axisTicks(range, start, end).map(tick => axisLabel('en-US', tick));

const FREE: ProSignal = { ready: true, isPremium: false, error: null };
const PRO: ProSignal = { ready: true, isPremium: true, error: null };
const LOADING: ProSignal = { ready: false, isPremium: false, error: null };
const OFFLINE: ProSignal = { ready: false, isPremium: false, error: 'Network error' };

describe('weight chart X-axis ticks', () => {
  it('7D: day + abbreviated month, every other day, ending on today', () => {
    expect(en(7, windowStart('2026-11-25', 7), '2026-11-25')).toEqual(['19 Nov', '21 Nov', '23 Nov', '25 Nov']);
    // Month and year transitions use the real dates.
    expect(en(7, windowStart('2027-01-02', 7), '2027-01-02')).toEqual(['27 Dec', '29 Dec', '31 Dec', '2 Jan']);
  });

  it('30D: day-of-month numbers in chronological order, never a sequential index', () => {
    const start = windowStart('2026-11-25', 30); // 27 Oct
    expect(start).toBe('2026-10-27');
    const ticks = axisTicks(30, start, '2026-11-25');
    expect(days(ticks)).toEqual(['2026-11-01', '2026-11-05', '2026-11-10', '2026-11-15', '2026-11-20', '2026-11-25']);
    expect(ticks.map(tick => axisLabel('en-US', tick))).toEqual(['1', '5', '10', '15', '20', '25']);
    // 30 Oct is two days before 1 Nov: the month start wins, so the labels cannot collide.
    expect(days(ticks)).not.toContain('2026-10-30');
  });

  it('30D handles February and leap years without crowding', () => {
    for (const today of ['2028-03-10', '2027-03-10', '2026-12-31', '2027-01-15']) {
      const start = windowStart(today, 30);
      const ticks = days(axisTicks(30, start, today));
      expect(ticks.length).toBeGreaterThanOrEqual(5);
      expect(ticks.length).toBeLessThanOrEqual(7);
      for (let i = 1; i < ticks.length; i++) expect(dayOffset(ticks[i - 1], ticks[i])).toBeGreaterThanOrEqual(4);
      expect(ticks.every(day => day >= start && day <= today)).toBe(true);
    }
    expect(axisTicks(30, windowStart('2028-03-10', 30), '2028-03-10').some(tick => tick.day === '2028-02-29')).toBe(false);
  });

  it('90D: mid-month "Mon 15" labels for the months in range, not twelve months', () => {
    expect(en(90, windowStart('2026-11-25', 90), '2026-11-25')).toEqual(['Sep 15', 'Oct 15', 'Nov 15']);
    expect(en(90, windowStart('2027-02-20', 90), '2027-02-20')).toEqual(['Dec 15', 'Jan 15', 'Feb 15']);
  });

  it('90D adds one edge tick only when just two mid-months fit', () => {
    const start = windowStart('2027-04-14', 90); // 15 Jan … 14 Apr
    const labels = en(90, start, '2027-04-14');
    expect(labels).toContain('Feb 15');
    expect(labels).toContain('Mar 15');
    expect(labels.length).toBeLessThanOrEqual(3);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it('ticks never overlap across every day of a year for every range', () => {
    const minGap = { 7: 2, 30: 4, 90: 20 } as const;
    for (let i = 0; i < 366; i++) {
      const today = windowStart('2028-12-31', i + 1);
      for (const range of [7, 30, 90] as const) {
        const ticks = days(axisTicks(range, windowStart(today, range), today));
        expect(ticks.length).toBeGreaterThanOrEqual(2);
        expect(ticks.length).toBeLessThanOrEqual(7);
        for (let k = 1; k < ticks.length; k++) expect(dayOffset(ticks[k - 1], ticks[k])).toBeGreaterThanOrEqual(minGap[range]);
      }
    }
  });

  it('French and Arabic keep their own short month names', () => {
    expect(axisLabel('fr-FR', { day: '2026-11-19', kind: 'dayMonth' })).toMatch(/^19 nov/);
    expect(axisLabel('ar-u-nu-arab', { day: '2026-11-19', kind: 'day' })).toBe('١٩');
  });

  it('rejects malformed domains instead of throwing', () => {
    expect(axisTicks(30, 'nope', '2026-11-25')).toEqual([]);
    expect(axisTicks(30, '2026-11-25', '2026-11-01')).toEqual([]);
  });
});

describe('weight chart positioning in the selected date domain', () => {
  const box = { width: 340, height: 164, left: 14, right: 14, top: 18, bottom: 0 };
  const today = '2026-11-25';
  const point = (day: string, kg: number): WeightPoint => ({ id: day, day, kg });

  it('places sparse points at their real dates instead of stretching them edge to edge', () => {
    const start = windowStart(today, 30);
    const geometry = chartGeometry([point('2026-11-10', 80), point('2026-11-20', 79)], start, today, box);
    const plotW = box.width - box.left - box.right;
    const [a, b] = geometry.points;
    expect(a.x).toBeCloseTo(box.left + dayOffset(start, '2026-11-10') / 29 * plotW, 5);
    expect(b.x).toBeCloseTo(box.left + dayOffset(start, '2026-11-20') / 29 * plotW, 5);
    expect(a.x).toBeGreaterThan(box.left + 1);
    expect(b.x).toBeLessThan(box.width - box.right - 1);
    // Axis ticks use the same mapping, so labels line up with the data.
    expect(geometry.xOf('2026-11-15')).toBeCloseTo((a.x + b.x) / 2, 5);
  });

  it('keeps the same domain width whatever the data, and the domain edges at the plot edges', () => {
    for (const range of [7, 30, 90]) {
      const start = windowStart(today, range);
      const geometry = chartGeometry([point(today, 80)], start, today, box);
      expect(geometry.xOf(start)).toBeCloseTo(box.left, 5);
      expect(geometry.xOf(today)).toBeCloseTo(box.width - box.right, 5);
      expect(geometry.points).toHaveLength(1);
      expect(geometry.line.startsWith('M')).toBe(true);
      expect(geometry.area).toBe(''); // a single weigh-in draws a point, not an area
    }
  });

  it('one point per day (newest wins), missing days stay gaps, and the data is not changed', () => {
    const e = (id: string, day: string, kg: number, created: string): WeightEntry => ({ id, owner_id: 'p', day, kg, note: '', created_at: created });
    const entries = [e('a', '2026-11-20', 80, '2026-11-20T07:00:00Z'), e('b', '2026-11-20', 79.6, '2026-11-20T21:00:00Z'), e('c', '2026-11-24', 79.1, '2026-11-24T07:00:00Z')];
    const snapshot = JSON.stringify(entries);
    const daily = dailyWeights(entries);
    expect(daily.map(p => [p.day, p.kg])).toEqual([['2026-11-20', 79.6], ['2026-11-24', 79.1]]);
    const inWindow = pointsInWindow(daily, windowStart(today, 7), today);
    const geometry = chartGeometry(inWindow, windowStart(today, 7), today, box);
    expect(geometry.points[1].x - geometry.points[0].x).toBeCloseTo(4 / 6 * (box.width - box.left - box.right), 5);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it('many points over 90 days stay inside the plot', () => {
    const start = windowStart(today, 90);
    const points = Array.from({ length: 90 }, (_, i) => point(windowStart(today, 90 - i), 80 - i * 0.05));
    const geometry = chartGeometry(points, start, today, box);
    expect(Math.min(...geometry.points.map(p => p.x))).toBeGreaterThanOrEqual(box.left - 1e-6);
    expect(Math.max(...geometry.points.map(p => p.x))).toBeLessThanOrEqual(box.width - box.right + 1e-6);
  });

  it('the chart draws domain ticks with an inset so first/last halos are not clipped', () => {
    const chart = source('src/ui/WeightChart.tsx');
    expect(chart).toContain('axisTicks(range, start, end)');
    expect(chart).toContain('geometry.xOf(tick.day)');
    expect(chart).toContain('left: INSET * s, right: INSET * s');
    expect(chart).not.toContain('labelIdx');
  });
});

describe('Cubyfit Pro access from the live entitlement', () => {
  it('only a resolved entitlement is Pro or Free; loading/offline stay unknown', () => {
    expect(proStatus(PRO)).toBe('pro');
    expect(proStatus(FREE)).toBe('free');
    expect(proStatus(LOADING)).toBe('checking');
    expect(proStatus(OFFLINE)).toBe('unavailable');
    // A stale isPremium without a resolved CustomerInfo never unlocks anything.
    expect(proStatus({ ready: false, isPremium: true, error: null })).toBe('checking');
  });

  it('7D and 30D are free; 90D needs Pro', () => {
    for (const signal of [FREE, PRO, LOADING, OFFLINE]) {
      expect(canUseWeightRange('7D', signal)).toBe(true);
      expect(canUseWeightRange('30D', signal)).toBe(true);
    }
    expect(canUseWeightRange('90D', PRO)).toBe(true);
    for (const signal of [FREE, LOADING, OFFLINE]) expect(canUseWeightRange('90D', signal)).toBe(false);
    expect(weightRangeDays).toEqual({ '7D': 7, '30D': 30, '90D': 90 });
  });

  it('a Free tap on 90D opens the paywall instead of switching', () => {
    expect(weightRangeTap('90D', FREE)).toBe('paywall');
    expect(weightRangeTap('90D', LOADING)).toBe('paywall');
    expect(weightRangeTap('90D', PRO)).toBe('select');
    expect(weightRangeTap('30D', FREE)).toBe('select');
  });

  it('losing Pro (expiry, restart before load, restored state) falls back to 30D', () => {
    expect(effectiveWeightRange('90D', PRO)).toBe('90D');
    expect(effectiveWeightRange('90D', FREE)).toBe('30D');
    expect(effectiveWeightRange('90D', LOADING)).toBe('30D');
    expect(effectiveWeightRange('7D', FREE)).toBe('7D');
    expect(parseWeightRange('90D')).toBe('90D');
    expect(parseWeightRange('365D')).toBe('7D');
    expect(parseWeightRange(undefined)).toBe('7D');
  });

  it('Weight screen wiring: gated chips, paywall route, no stored Pro flag, history untouched', () => {
    const weight = source('src/app/weight.tsx');
    expect(weight).toContain("if (weightRangeTap(next, subscription) === 'paywall') { router.push('/paywall'); return; }");
    expect(weight).toContain('const range = effectiveWeightRange(selectedRange, subscription);');
    expect(weight).toContain("'lock-closed' as const");
    expect(weight).toContain('const history = showAll ? weights : weights.slice(0, HISTORY_PREVIEW);');
    expect(weight).not.toMatch(/isPremium\s*[:=]\s*true|AsyncStorage|SecureStore/);
  });
});

describe('Bottom sheet drag-to-dismiss rules', () => {
  it('claims only downward, mostly vertical drags (taps and horizontal moves stay with children)', () => {
    expect(sheetShouldClaim(0, SHEET_GESTURE.claimDistance + 1)).toBe(true);
    expect(sheetShouldClaim(0, 3)).toBe(false);
    expect(sheetShouldClaim(0, -40)).toBe(false);
    expect(sheetShouldClaim(30, 10)).toBe(false);
  });
  it('follows the finger downward and resists upward', () => {
    expect(sheetDragOffset(80)).toBe(80);
    expect(sheetDragOffset(-50)).toBeCloseTo(-6);
    expect(sheetDragOffset(-1000)).toBe(-SHEET_GESTURE.maxUpward);
  });
  it('dismisses past the distance or on a real downward flick; springs back otherwise', () => {
    expect(sheetShouldDismiss(SHEET_GESTURE.dismissDistance + 1, 0)).toBe(true);
    expect(sheetShouldDismiss(60, 1.5)).toBe(true);
    expect(sheetShouldDismiss(60, 0.2)).toBe(false);
    expect(sheetShouldDismiss(10, 3)).toBe(false); // a twitch is not a flick
    expect(sheetShouldDismiss(-200, 5)).toBe(false); // swiping up never closes
  });
});

describe('Bottom navigation is opaque', () => {
  it('every theme’s nav surface is a solid colour', () => {
    const theme = source('src/ui/theme.ts');
    const values = [...theme.matchAll(/navBackground: '([^']+)'/g)].map(match => match[1]);
    expect(values).toHaveLength(6);
    for (const value of values) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it('the floating tab bar keeps its pill shape and uses that surface (no blur layer)', () => {
    const tabs = source('src/app/(tabs)/_layout.tsx');
    expect(tabs).toContain('backgroundColor: palette.navBackground');
    expect(tabs).toContain('borderRadius: 28');
    expect(tabs).not.toMatch(/BlurView|expo-blur/);
  });
});
