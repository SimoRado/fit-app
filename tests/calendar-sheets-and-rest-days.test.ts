import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseGymOverrides, parseGymPlanHistory, planDayChange, planInForce, recordGymPlanChange, resolveDayPlan, serializeGymOverrides, setGymDayPlan, setGymOverride,
  type GymDayPlan,
} from '../src/core/gymSchedule';
import { workoutCalendarData, workoutDayStatus } from '../src/core/workoutCalendar';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const TODAY = '2026-11-18'; // Wednesday
const routines = new Set(['push', 'legs']);
const mondayRest: GymDayPlan[] = [{ weekday: 1, kind: 'rest' }];

describe('calendar buttons and sheets', () => {
  const pages = {
    habits: source('src/app/(tabs)/habits.tsx'),
    workouts: source('src/app/(tabs)/workouts.tsx'),
    nutrition: source('src/app/(tabs)/nutrition.tsx'),
  };
  it('no page renders a permanent calendar grid any more', () => {
    for (const text of Object.values(pages)) {
      expect(text).not.toContain('<ProgressCalendar');
      expect(text).toContain('<MonthCalendarSheet visible={monthOpen}');
    }
  });
  it('header order is [Year] [Month] [main action], main action far right', () => {
    const order = (text: string, action: string) => {
      const buttons = text.indexOf('<CalendarButtons'), main = text.indexOf(action, buttons);
      return buttons > -1 && main > buttons;
    };
    expect(order(pages.habits, 'label="New habit"')).toBe(true);
    expect(order(pages.workouts, 'label="Create routine"')).toBe(true);
    expect(order(pages.nutrition, 'label="Nutrition targets"')).toBe(true);
    const buttons = source('src/ui/ProgressCalendar.tsx');
    const year = buttons.indexOf('icon="grid-outline"'), month = buttons.indexOf('icon="calendar-outline"');
    expect(year).toBeGreaterThan(-1);
    expect(month).toBeGreaterThan(year);
  });
  it('the Year sheet shows Pro history or only the Pro explanation, never locked data', () => {
    const sheet = source('src/ui/ProgressCalendar.tsx');
    expect(sheet).toContain('access.canOpenYear\n    ? <YearBody');
    expect(sheet).toContain(': <YearLocked');
    expect(pages.habits).toContain("const openYear = () => { if (access.canOpenYear) openHistory('year'); else setYearLockedOpen(true); };");
  });
});

describe('one-date exceptions ("This day only")', () => {
  it('a single-date rest affects only that date', () => {
    const change = planDayChange([], '2026-11-25', { kind: 'rest' });
    expect(change).toEqual({ rest: true, override: null });
    const rest = new Set(['2026-11-25']);
    expect(resolveDayPlan([], '2026-11-25', rest, routines)).toEqual({ kind: 'rest', oneOff: true });
    expect(resolveDayPlan([], '2026-12-02', rest, routines)).toBeNull(); // next Wednesday unchanged
  });
  it('removing a single-date rest only clears that date', () => {
    expect(planDayChange([], '2026-11-25', { kind: 'none' })).toEqual({ rest: false, override: null });
  });
  it('a weekly rest Monday can be skipped once without touching other Mondays', () => {
    const change = planDayChange(mondayRest, '2026-11-23', { kind: 'none' });
    expect(change).toEqual({ rest: false, override: { kind: 'none' } });
    const overrides = setGymOverride(new Map(), '2026-11-23', change.override);
    expect(resolveDayPlan(mondayRest, '2026-11-23', [], routines, overrides)).toBeNull();
    expect(resolveDayPlan(mondayRest, '2026-11-30', [], routines, overrides)).toEqual({ kind: 'rest', oneOff: false });
  });
  it('a weekly rest day can become a workout day once', () => {
    const change = planDayChange(mondayRest, '2026-11-23', { kind: 'routine', routineId: 'push' });
    const overrides = setGymOverride(new Map(), '2026-11-23', change.override);
    expect(resolveDayPlan(mondayRest, '2026-11-23', [], routines, overrides)).toEqual({ kind: 'routine', routineId: 'push', oneOff: true });
  });
  it('a weekly workout day can rest once; choosing the weekly value again stores nothing', () => {
    const weekly: GymDayPlan[] = [{ weekday: 1, kind: 'routine', routineId: 'legs' }];
    expect(planDayChange(weekly, '2026-11-23', { kind: 'rest' })).toEqual({ rest: true, override: null });
    expect(planDayChange(weekly, '2026-11-23', { kind: 'routine', routineId: 'legs' })).toEqual({ rest: false, override: null });
    expect(planDayChange(mondayRest, '2026-11-23', { kind: 'rest' })).toEqual({ rest: false, override: null });
  });
  it('precedence: one-off rest, then date exception, then weekly; deleted routines resolve to none', () => {
    const overrides = setGymOverride(new Map(), '2026-11-23', { kind: 'routine', routineId: 'gone' });
    expect(resolveDayPlan(mondayRest, '2026-11-23', [], routines, overrides)).toBeNull();
    expect(resolveDayPlan(mondayRest, '2026-11-23', ['2026-11-23'], routines, overrides)).toEqual({ kind: 'rest', oneOff: true });
  });
  it('persists defensively and prunes very old exceptions', () => {
    const map = setGymOverride(setGymOverride(new Map(), '2024-01-01', { kind: 'none' }), '2026-11-23', { kind: 'routine', routineId: 'push' });
    const round = parseGymOverrides(serializeGymOverrides(map, '2025-01-01'));
    expect([...round.keys()]).toEqual(['2026-11-23']);
    expect(parseGymOverrides('{bad')).toEqual(new Map());
    expect(parseGymOverrides(JSON.stringify([{ day: 'x', kind: 'none' }, { day: '2026-11-23', kind: 'routine', routineId: '' }])).size).toBe(0);
  });
});

describe('recurring weekly rest days', () => {
  it('can be created and removed; future Mondays stop inheriting it', () => {
    const created = setGymDayPlan([], 1, { weekday: 1, kind: 'rest' });
    expect(resolveDayPlan(created, '2026-11-30', [], routines)).toEqual({ kind: 'rest', oneOff: false });
    const removed = setGymDayPlan(created, 1, null);
    expect(resolveDayPlan(removed, '2026-11-30', [], routines)).toBeNull();
  });
  it('removing it keeps earlier Mondays as rest days (plan history)', () => {
    const history = recordGymPlanChange([], mondayRest, TODAY);
    const data = workoutCalendarData([], [], [], routines, new Map(), history);
    expect(workoutDayStatus('2026-11-16', TODAY, data).kind).toBe('rest'); // last Monday keeps its moon
    expect(workoutDayStatus('2026-11-23', TODAY, data).kind).toBe('open'); // next Monday no longer rests
  });
  it('several changes on one day keep the plan that was in force before that day', () => {
    let history = recordGymPlanChange([], mondayRest, TODAY);
    history = recordGymPlanChange(history, [], TODAY);
    expect(history).toHaveLength(1);
    expect(planInForce(history, [], '2026-11-16')).toEqual(mondayRest);
    expect(planInForce(history, [], TODAY)).toEqual([]);
    expect(parseGymPlanHistory(JSON.stringify(history))).toEqual(history);
    expect(parseGymPlanHistory('nope')).toEqual([]);
  });
  it('completed workouts stay full colour over any rest status', () => {
    const data = workoutCalendarData([{ day: '2026-11-16', completed: 1 }], ['2026-11-16'], mondayRest, routines);
    expect(workoutDayStatus('2026-11-16', TODAY, data).kind).toBe('done');
  });
  it('planned (dumbbell) and rest (moon) follow one-date exceptions', () => {
    const overrides = setGymOverride(new Map(), '2026-11-23', { kind: 'routine', routineId: 'push' });
    const data = workoutCalendarData([], [], mondayRest, routines, overrides);
    expect(workoutDayStatus('2026-11-23', TODAY, data).kind).toBe('planned');
    expect(workoutDayStatus('2026-11-30', TODAY, data).kind).toBe('rest');
  });
  it('Train asks before broad recurring changes and saves through one local transaction', () => {
    const train = source('src/app/(tabs)/workouts.tsx');
    expect(train).toContain("{item === 'day' ? 'This day only' : `Every ${weekdayName}`}");
    expect(train).toContain("next ? 'Change every week' : 'Remove weekly plan'");
    expect(train).toContain('const history = recordGymPlanChange(planHistory, weeklyPlan, today);');
    const db = source('src/data/db.ts');
    expect(db).toContain('saveTrainingSchedule: async (owner: string');
  });
});

describe('final onboarding legal acknowledgment', () => {
  const onboarding = source('src/app/onboarding.tsx');
  const legal = source('src/ui/LegalAgreements.tsx');
  it('sits on the final step, unchecked by default, and gates Continue', () => {
    expect(onboarding).toContain('const [legalAccepted, setLegalAccepted] = useState(false)');
    expect(onboarding).toContain('<Card><LegalAgreementChoice checked={legalAccepted} onChange={setLegalAccepted}/></Card>');
    expect(onboarding).toContain('disabled={step === 3 ? !ready : busy || ageBlocked}');
    expect(onboarding).toContain('canBeginProfile(legalAccepted, busy)');
  });
  it('persists versions through the existing server and local flow before creating the profile', () => {
    const accept = onboarding.indexOf('await acceptEligibility({'), create = onboarding.indexOf('await repo.createProfile(profile)');
    expect(onboarding).toContain('termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true');
    expect(accept).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(accept);
    expect(onboarding).toContain("await repo.setPreference('terms_accepted_version', TERMS_VERSION)");
    expect(onboarding).toContain("if (birthStatus !== 'adult') return;");
  });
  it('uses the requested copy with separate Terms and Privacy links', () => {
    expect(legal).toContain("I have read and agree to the <Text accessibilityRole=\"link\" onPress={() => openLegal(TERMS_URL)}");
    expect(legal).toContain("const TERMS_URL = 'https://cubyfit.app/terms';");
    expect(legal).toContain("const PRIVACY_URL = 'https://cubyfit.app/privacy';");
    expect(legal).toContain('Advertising choices are separate');
  });
});

describe('Home header', () => {
  const home = source('src/app/(tabs)/index.tsx');
  it('the logo has no accent outline', () => {
    expect(home).not.toContain("borderWidth: 1, borderColor: p.accent, borderRadius: 12");
    expect(home).toContain('<CubyMark size={40} variant="brand"/>');
  });
  it('the profile button has a theme border and keeps its navigation', () => {
    const button = home.slice(home.indexOf('accessibilityLabel="Profile"'), home.indexOf('{initials}'));
    expect(button).toContain('borderWidth: 1.5, borderColor: p.borderStrong');
    expect(home).toMatch(/accessibilityLabel="Profile"[^>]*onPress=\{\(\) => router\.navigate\('\/profile'\)\}/);
  });
});
