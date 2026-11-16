import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, estimateTargets, goalAdjustment, macroCalories, mifflinStJeor, parseAlsoGoals, parseGoal, sameTargets, stepTarget, type EstimateInput } from '../src/core/nutritionTargets';
import { desiredReminders } from '../src/core/reminderDefinitions';
import { gymSchedulePreferenceKey } from '../src/core/gymSchedule';

const base: EstimateInput = { weightKg: 76.4, heightCm: 178, age: 30, sex: 'male', activity: 'moderate', goal: 'lose', targetWeightKg: 73 };

describe('age from birthday', () => {
  it('counts whole years and handles the birthday boundary', () => {
    expect(ageFromBirthDate('1996-11-16', '2026-11-16')).toBe(30);
    expect(ageFromBirthDate('1996-11-17', '2026-11-16')).toBe(29);
    expect(ageFromBirthDate('not-a-date', '2026-11-16')).toBeNull();
    expect(ageFromBirthDate('2030-01-01', '2026-11-16')).toBeNull();
  });
});

describe('goal parsing', () => {
  it('maps current labels and labels saved by earlier onboarding builds', () => {
    expect(parseGoal('Lose weight')).toBe('lose');
    expect(parseGoal('Gain muscle')).toBe('gain');
    expect(parseGoal('Gain weight')).toBe('gain');
    expect(parseGoal('Improve general fitness')).toBe('performance');
    expect(parseGoal('Maintain current fitness')).toBe('maintain');
    expect(parseGoal('Build healthy habits')).toBe('habits');
    expect(parseGoal('')).toBe('maintain');
  });
  it('keeps at most two secondary goals and never the main one', () => {
    expect(parseAlsoGoals('gain,lose,maintain,habits', 'lose')).toEqual(['gain', 'maintain']);
    expect(parseAlsoGoals('nonsense', 'lose')).toEqual([]);
  });
});

describe('calorie estimate', () => {
  it('uses Mifflin-St Jeor', () => {
    expect(mifflinStJeor({ weightKg: 76.4, heightCm: 178, age: 30, sex: 'male' })).toBeCloseTo(1731.5);
    expect(mifflinStJeor({ weightKg: 60, heightCm: 165, age: 30, sex: 'female' })).toBeCloseTo(1320.25);
  });

  it('gives a moderate deficit for weight loss with sensible macros', () => {
    const estimate = estimateTargets(base);
    expect(estimate.maintenance).toBeCloseTo(2680, -1);
    expect(estimate.adjustment).toBe(-500);
    expect(estimate.kcal).toBe(2200);
    expect(estimate.protein).toBe(155);
    expect(estimate.kcal % 50).toBe(0);
    expect(Math.abs(macroCalories(estimate) - estimate.kcal)).toBeLessThanOrEqual(40);
  });

  it('moves the target with the goal', () => {
    const lose = estimateTargets(base).kcal;
    const maintain = estimateTargets({ ...base, goal: 'maintain' }).kcal;
    const gain = estimateTargets({ ...base, goal: 'gain', targetWeightKg: 80 }).kcal;
    expect(lose).toBeLessThan(maintain);
    expect(gain).toBeGreaterThan(maintain);
    expect(gain - maintain).toBeLessThanOrEqual(350);
  });

  it('never recommends an extreme deficit and respects a safe floor', () => {
    const small = estimateTargets({ weightKg: 48, heightCm: 152, age: 60, sex: 'female', activity: 'sedentary', goal: 'lose', targetWeightKg: 42 });
    expect(small.kcal).toBeGreaterThanOrEqual(1200);
    expect(small.kcal).toBeGreaterThanOrEqual(small.floor - 25);
    expect(small.carbs).toBeGreaterThanOrEqual(50);
    expect(-goalAdjustment('lose', 4000, 'very_active', 120, 90)).toBe(500);
  });

  it('goes gentle near the target and stops cutting once it is reached', () => {
    expect(goalAdjustment('lose', 2600, 'moderate', 74, 73)).toBe(-250);
    expect(goalAdjustment('lose', 2600, 'moderate', 72, 73)).toBe(0);
    expect(goalAdjustment('gain', 2600, 'moderate', 80, 75)).toBe(0);
  });

  it('keeps maintenance for healthy habits unless a clear weight goal exists', () => {
    expect(goalAdjustment('habits', 2500, 'light', 76, null)).toBe(0);
    expect(goalAdjustment('habits', 2500, 'light', 76, 70)).toBe(-250);
    expect(goalAdjustment('performance', 2500, 'sedentary', 76, null)).toBe(0);
    expect(goalAdjustment('performance', 2500, 'very_active', 76, null)).toBeGreaterThan(0);
  });

  it('fills in missing sex and activity with neutral defaults', () => {
    const estimate = estimateTargets({ ...base, sex: null, activity: null, goal: 'maintain' });
    expect(estimate.activity).toBe('light');
    expect(estimate.kcal).toBeGreaterThan(1500);
  });

  it('caps protein for high body weights', () => {
    expect(estimateTargets({ ...base, weightKg: 160, targetWeightKg: 100 }).protein).toBeLessThanOrEqual(250);
  });
});

describe('target editing steps', () => {
  it('steps calories by 50 and macros by 5, snapping typed values to the grid', () => {
    expect(stepTarget('kcal', 2100, 1)).toBe(2150);
    expect(stepTarget('kcal', 2100, -1)).toBe(2050);
    expect(stepTarget('kcal', 2137, 1)).toBe(2150);
    expect(stepTarget('kcal', 2137, -1)).toBe(2100);
    expect(stepTarget('protein', 140, 1)).toBe(145);
    expect(stepTarget('fat', 0, -1)).toBe(0);
    expect(stepTarget('kcal', 800, -1)).toBe(800);
  });
  it('compares targets to the nearest unit', () => {
    expect(sameTargets({ kcal: 2100, protein: 140, carbs: 240, fat: 65 }, { kcal: 2100.2, protein: 140, carbs: 240, fat: 65 })).toBe(true);
    expect(sameTargets(null, { kcal: 1, protein: 0, carbs: 0, fat: 0 })).toBe(false);
  });
});

describe('profile notification switches', () => {
  it('schedules the daily check-in, streak nudge and workout reminder with defaults', () => {
    const keys = desiredReminders([], [{ key: 'motivation_reminders', value: 'on' }, { key: 'streak_reminders', value: 'on' }, { key: 'workout_reminders', value: 'on' }], '2026-11-16').map(row => [row.key, row.hour, row.minute]);
    expect(keys).toEqual([['motivation', 7, 30], ['workout', 18, 0], ['streak', 20, 0]]);
  });
  it('limits workout reminders to planned training days when a weekly plan exists', () => {
    const plan = JSON.stringify([{ weekday: 1, kind: 'routine', routineId: 'push' }, { weekday: 3, kind: 'rest' }, { weekday: 4, kind: 'routine', routineId: 'pull' }]);
    const rows = desiredReminders([], [{ key: 'workout_reminders', value: 'on' }, { key: 'workout_time', value: '17:15' }, { key: gymSchedulePreferenceKey, value: plan }], '2026-11-16');
    expect(rows.map(row => [row.key, row.weekday, row.hour, row.minute])).toEqual([['workout:1', 2, 17, 15], ['workout:4', 5, 17, 15]]);
  });
  it('tags the streak reminder so the foreground handler can skip completed days', () => {
    const [streak] = desiredReminders([], [{ key: 'streak_reminders', value: 'on' }], '2026-11-16');
    expect(streak.kind).toBe('streak');
    expect(desiredReminders([], [{ key: 'streak_reminders', value: 'off' }], '2026-11-16')).toEqual([]);
  });
});
