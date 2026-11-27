import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clampHomeDay, homeDaySelectable, homeEarliestDay, homeWeekBounds, homeWeekLabel, shiftHomeWeek, sundayWeekStart } from '../src/core/homeWeek';
import { birthEligibility } from '../src/core/authMode';
import { ageOnDay } from '../shared/ageEligibility';

const read = (path: string) => readFileSync(path, 'utf8');
const today = '2026-11-27'; // Friday; its Sunday-first week starts 2026-11-22.

describe('Home weekly navigation', () => {
  it('starts on the current Sunday-first week, labelled "This week"', () => {
    expect(sundayWeekStart(today)).toBe('2026-11-22');
    expect(homeWeekLabel('2026-11-22', today)).toBe('This week');
  });
  it('labels past weeks as compact ranges, across months and years', () => {
    expect(homeWeekLabel('2026-11-15', today)).toBe('Nov 15–21');
    expect(homeWeekLabel('2026-10-25', today)).toBe('Oct 25–31');
    expect(homeWeekLabel('2026-11-29', '2026-12-12')).toBe('Nov 29 – Dec 5');
    expect(homeWeekLabel('2025-12-28', '2026-01-10')).toBe('Dec 28 – Jan 3');
  });
  it('never goes into future weeks', () => {
    expect(homeWeekBounds('2026-11-22', today).canGoForward).toBe(false);
    expect(shiftHomeWeek('2026-11-22', today, 1, today)).toEqual({ weekStart: '2026-11-22', selected: today });
  });
  it('moves exactly seven days and returns to today on the current week', () => {
    const back = shiftHomeWeek('2026-11-22', today, -1, today);
    expect(back).toEqual({ weekStart: '2026-11-15', selected: '2026-11-20' });
    expect(shiftHomeWeek(back.weekStart, back.selected, 1, today)).toEqual({ weekStart: '2026-11-22', selected: today });
  });
  it('stops at the rolling 30-day boundary', () => {
    expect(homeEarliestDay(today)).toBe('2026-10-28');
    // Weeks: Nov 22 (current) → Nov 15 → Nov 8 → Nov 1 → Oct 25 (contains Oct 28–31).
    expect(homeWeekBounds('2026-11-01', today).canGoBack).toBe(true);
    expect(homeWeekBounds('2026-10-25', today).canGoBack).toBe(false);
    expect(shiftHomeWeek('2026-10-25', '2026-10-30', -1, today).weekStart).toBe('2026-10-25');
  });
  it('blocks selecting dates older than 30 days or in the future, and clamps saved state', () => {
    expect(homeDaySelectable('2026-10-28', today)).toBe(true);
    expect(homeDaySelectable('2026-10-27', today)).toBe(false);
    expect(homeDaySelectable('2026-11-28', today)).toBe(false);
    expect(shiftHomeWeek('2026-11-01', '2026-11-01', -1, today).selected).toBe('2026-10-28');
    expect(clampHomeDay('2026-09-01', today)).toBe('2026-10-28');
    expect(clampHomeDay('2027-01-01', today)).toBe(today);
  });
  it('crosses a year boundary', () => {
    const start = sundayWeekStart('2026-01-03');
    expect(start).toBe('2025-12-28');
    expect(shiftHomeWeek(start, '2026-01-03', -1, '2026-01-03')).toEqual({ weekStart: '2025-12-21', selected: '2025-12-27' });
  });
  it('removes the month dropdown and month calendar sheet from Home', () => {
    const home = read('src/app/(tabs)/index.tsx');
    expect(home).not.toContain('monthLabel');
    expect(home).not.toContain('calendarOpen');
    expect(home).toContain('<WeekArrow direction={-1}');
    expect(home).toContain('homeDaySelectable(day, today)');
  });
});

describe('small UI refinements', () => {
  it('gives the Volt Light workout legend a contrasting icon', () => {
    expect(read('src/app/(tabs)/index.tsx')).toContain("color={p.light && p.style === 'volt' ? p.chipFg : p.q3}");
  });
  it('outlines unselected habit category cards with a softer border', () => {
    expect(read('src/ui/HabitEditor.tsx')).toContain('borderColor: on ? p.text : p.borderStrong, backgroundColor: p.c8');
  });
  it('slides the Sign up / Log in pill instead of jumping', () => {
    const auth = read('src/ui/auth.tsx');
    expect(auth).toContain('useSegmentThumb(mode === ');
    expect(auth).toContain('thumbStyle: thumb');
  });
});

describe('onboarding step 1', () => {
  const onboarding = read('src/app/onboarding.tsx');
  it('shows exactly one age message', () => {
    expect(onboarding).toContain("{birthStatus === 'underage' && <View accessibilityRole=\"alert\"");
    expect(onboarding).toContain("{birthStatus !== 'underage' && <View");
    expect(birthEligibility('2010-02-02', '2026-11-27', ageOnDay)).toBe('underage');
    expect(birthEligibility('2000-02-02', '2026-11-27', ageOnDay)).toBe('adult');
  });
  it('drops the guest-data pill and banner but keeps one restore entry (the only pre-profile path)', () => {
    expect(onboarding).not.toContain('Guest data');
    expect(onboarding).not.toContain('History from before sign-in');
    expect(onboarding.match(/\/cloud-sync/g)?.length).toBe(1);
    expect(read('src/app/cloud-sync.tsx')).toContain('Import preserved guest history');
  });
});
