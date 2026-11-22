import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calendarAccess, canSeeDay, guardMonth } from '../src/core/calendarAccess';
import { workoutCalendarData, workoutDayStatus } from '../src/core/workoutCalendar';
import { nutritionScore, targetForDay } from '../src/core/nutritionCalendar';
import { monthWeeks, shadeLevel, shiftMonth } from '../src/core/habitHistory';
import type { GymDayPlan } from '../src/core/gymSchedule';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const TODAY = '2026-11-18'; // a Wednesday

describe('shared calendar Free / Pro access', () => {
  it('Free sees the current month and planning months only', () => {
    const free = calendarAccess(false, TODAY, 12);
    expect(free.canBrowseMonth('2026-11')).toBe(true);
    expect(free.canBrowseMonth('2026-10')).toBe(false);
    expect(free.needsPro('2026-10')).toBe(true);
    expect(free.canBrowseMonth('2027-11')).toBe(true); // planning ahead is never Pro-only
    expect(free.canBrowseMonth('2027-12')).toBe(false);
    expect(free.needsPro('2027-12')).toBe(false);
    expect(free.canOpenYear).toBe(false);
  });
  it('Pro additionally browses earlier months and opens the year', () => {
    const pro = calendarAccess(true, TODAY, 0);
    expect(pro.canBrowseMonth('2020-01')).toBe(true);
    expect(pro.canBrowseMonth('2026-12')).toBe(false); // Nutrition: no future months
    expect(pro.canOpenYear).toBe(true);
  });
  it('every navigation route is guarded and falls back to the current month', () => {
    const free = calendarAccess(false, TODAY, 12);
    expect(guardMonth(free, '2026-10')).toEqual({ month: '2026-11', locked: true });
    expect(guardMonth(free, '2027-01')).toEqual({ month: '2027-01', locked: false });
    expect(guardMonth(calendarAccess(false, TODAY, 0), '2026-12')).toEqual({ month: '2026-11', locked: false });
    // Pro expired while viewing October: the same request now resolves to November, nothing is deleted.
    expect(guardMonth(calendarAccess(true, TODAY), '2026-10').month).toBe('2026-10');
    expect(guardMonth(calendarAccess(false, TODAY), '2026-10').month).toBe('2026-11');
    expect(canSeeDay(free, '2026-10-31')).toBe(false);
    expect(canSeeDay(free, '2026-11-01')).toBe(true);
  });
  it('handles year transitions and leap months', () => {
    const access = calendarAccess(false, '2027-01-03', 1);
    expect(access.current).toBe('2027-01');
    expect(access.canBrowseMonth(shiftMonth('2027-01', -1))).toBe(false);
    expect(access.canBrowseMonth('2027-02')).toBe(true);
    expect(monthWeeks('2028-02', 0).flat().filter(Boolean)).toHaveLength(29);
    expect(monthWeeks('2027-02', 0).flat().filter(Boolean)).toHaveLength(28);
  });
  it('the calendar sheets and pages use the verified entitlement only', () => {
    const calendar = source('src/ui/ProgressCalendar.tsx');
    expect(calendar).toContain('const result = guardMonth(access, requested);');
    expect(calendar).toContain('useEffect(() => { if (!access.canBrowseMonth(month)) setMonth(access.current); }, [access, month]);');
    for (const page of ['src/app/(tabs)/habits.tsx', 'src/app/(tabs)/workouts.tsx', 'src/app/(tabs)/nutrition.tsx']) {
      const text = source(page);
      expect(text).toMatch(/calendarAccess\(subscription\.isPremium, (today|calendarToday),/);
      expect(text).toContain('<MonthCalendarSheet');
      expect(text).toContain('<YearCalendarSheet');
    }
    const sheet = source('src/ui/HabitHistorySheet.tsx');
    expect(sheet).toContain("if (!access.canBrowseMonth(next)) { if (next < current) setLocked('months'); return; }");
  });
});

describe('Habits page drops the redundant date pickers', () => {
  const habits = source('src/app/(tabs)/habits.tsx');
  it('has no month dropdown, seven-day strip or This week card', () => {
    expect(habits).not.toContain('MonthWeekCalendar');
    expect(habits).not.toContain('Choose a date');
    expect(habits).not.toContain('title="This week"');
    expect(habits).not.toContain('weeklyConsistency');
  });
  it("keeps today's tile live using the History snapshot maths", () => {
    expect(habits).toContain('computeDay(habits, today, evidence(completions, progress))');
  });
});

describe('workout calendar status', () => {
  const plan: GymDayPlan[] = [{ weekday: 1, kind: 'routine', routineId: 'push' }, { weekday: 0, kind: 'rest' }, { weekday: 5, kind: 'routine', routineId: 'deleted' }];
  const routines = new Set(['push']);
  const data = (training: { day: string; completed: number }[], rest: string[] = []) => workoutCalendarData(training, rest, plan, routines);
  const kind = (day: string, d = data([])) => workoutDayStatus(day, TODAY, d).kind;

  it('completed workout is full colour, and wins over a rest day', () => {
    const d = data([{ day: '2026-11-15', completed: 1 }, { day: '2026-11-15', completed: 1 }], ['2026-11-10']);
    expect(workoutDayStatus('2026-11-15', TODAY, d)).toMatchObject({ kind: 'done', workouts: 2, plan: { kind: 'rest' } }); // Sunday = weekly rest
  });
  it('drafts and in-progress sessions never count as completed', () => {
    expect(kind('2026-11-17', data([{ day: '2026-11-17', completed: 0 }]))).toBe('missed');
  });
  it('rest days: one-off and weekly, past, today and future', () => {
    const d = data([], ['2026-11-10', TODAY]);
    expect(workoutDayStatus('2026-11-10', TODAY, d).plan).toEqual({ kind: 'rest', oneOff: true });
    expect(kind(TODAY, d)).toBe('rest');
    expect(kind('2026-11-22')).toBe('rest'); // future Sunday from the weekly plan
  });
  it('planned training shows for today and later only; a passed plan becomes missed', () => {
    expect(kind('2026-11-23')).toBe('planned'); // Monday
    expect(kind('2026-11-16')).toBe('missed'); // last Monday, not done
    expect(kind('2026-11-20')).toBe('open'); // Friday points at a deleted routine → no plan
  });
  it('today is pending, never missed, while it is still running', () => {
    expect(kind(TODAY)).toBe('pending');
    expect(kind('2026-11-17')).toBe('missed');
    expect(kind('2026-11-19')).toBe('open');
  });
  it('the Train screen schedules only today and later and passes the tapped date', () => {
    const train = source('src/app/(tabs)/workouts.tsx');
    expect(train).toContain("case 'rest': return { shade: 1, icon: 'moon'");
    expect(train).toContain("case 'done': return { shade: 3");
    expect(train).toContain("case 'planned': return { shade: null, icon: 'barbell'");
    // Existing synced tables only: preferences (weekly plan, history, date exceptions) and rest_days, in one transaction.
    expect(train).toContain('await repo.saveTrainingSchedule(profile.id, { preferences: preferencesToSave, rest: change.rest });');
  });
});

describe('nutrition calendar score', () => {
  const target = { kcal: 2000, protein: 100, carbs: 250, fat: 70 };
  const day = (kcal: number, protein: number) => ({ kcal, protein, carbs: 0, fat: 0 });
  it('an unconfigured goal is never complete', () => {
    expect(nutritionScore(day(2000, 100), true, null)).toBeNull();
  });
  it('nothing logged is 0%', () => {
    expect(nutritionScore(day(0, 0), false, target)?.percent).toBe(0);
  });
  it('one small meal does not reach full intensity', () => {
    const score = nutritionScore(day(500, 25), true, target)!;
    expect(shadeLevel(score.percent)).toBe(1);
  });
  it('full intensity needs calories within 90–110% and protein at 90%+', () => {
    expect(nutritionScore(day(1900, 95), true, target)!.percent).toBe(100);
    expect(nutritionScore(day(2200, 90), true, target)!.percent).toBe(100);
    expect(nutritionScore(day(1900, 40), true, target)!.percent).toBeLessThan(100);
  });
  it('a big overshoot loses credit but never below half for calories', () => {
    expect(nutritionScore(day(3000, 100), true, target)!.calories).toBeCloseTo(0.6);
    expect(nutritionScore(day(6000, 100), true, target)!.calories).toBe(0.5);
  });
  it('protein counts only when a protein target is set', () => {
    expect(nutritionScore(day(1900, 0), true, { ...target, protein: 0 })).toMatchObject({ percent: 100, protein: null });
  });
  it('maps to the same four bands as Habits', () => {
    expect([0, 20, 33, 50, 67, 80, 100].map(shadeLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
  it('resolves the target in force on each day, like nutritionTarget(day)', () => {
    const targets = [{ effective_day: '2026-11-05', kcal: 1 }, { effective_day: '2026-11-12', kcal: 2 }];
    expect(targetForDay(targets, '2026-11-12')?.kcal).toBe(2);
    expect(targetForDay(targets, '2026-11-11')?.kcal).toBe(1);
    expect(targetForDay(targets, '2026-11-01')?.kcal).toBe(1); // dashboard fallback: first target
    expect(targetForDay([], '2026-11-01')).toBeNull();
  });
  it('reads a month with one grouped query, not per day', () => {
    const data = source('src/data/nutrition.ts');
    expect(data).toContain('GROUP BY day');
  });
});
