import { dayKey, fromDay, validDay } from './date';
import type { Nutrients } from './nutrition';

/**
 * First-pass calorie and macro estimate.
 *
 * BMR: Mifflin-St Jeor. TDEE: BMR × activity factor. The goal then applies a
 * moderate adjustment, the result never drops below a safe floor, and macros
 * are split as protein (by body weight) → fat (share of calories) → carbs
 * (remainder). This is a practical starting point, not medical advice.
 */

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very_active';
export type MainGoal = 'lose' | 'gain' | 'maintain' | 'performance' | 'habits';
export type TargetsMode = 'auto' | 'custom';

export const mainGoals: readonly MainGoal[] = ['lose', 'gain', 'maintain', 'performance', 'habits'];
export const activities: readonly Activity[] = ['sedentary', 'light', 'moderate', 'very_active'];

/** Stored in `profile.fitness_goal` (kept human-readable for sync and older builds). */
export const goalLabels: Record<MainGoal, string> = {
  lose: 'Lose weight',
  gain: 'Gain weight',
  maintain: 'Maintain weight',
  performance: 'Improve performance',
  habits: 'Build healthy habits',
};
export const activityLabels: Record<Activity, string> = { sedentary: 'Mostly seated', light: 'Light', moderate: 'Moderate', very_active: 'Very active' };
export const activityFactors: Record<Activity, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725 };

/** Preference keys (the preferences table is per-account and syncs). */
export const prefKeys = {
  sex: 'body.sex',
  activity: 'body.activity',
  mode: 'nutrition.targets-mode',
  alsoGoals: 'goal.also',
} as const;

/** Maps saved goal text, including labels written by earlier onboarding builds. */
export function parseGoal(value: string | null | undefined): MainGoal {
  const text = (value ?? '').trim().toLowerCase();
  if (text.startsWith('lose')) return 'lose';
  if (text.startsWith('gain')) return 'gain';
  if (text.startsWith('maintain')) return 'maintain';
  if (text.includes('performance') || text === 'improve general fitness') return 'performance';
  if (text.includes('habit')) return 'habits';
  return 'maintain';
}
export const parseSex = (value: string | null | undefined): Sex | null => value === 'male' || value === 'female' ? value : null;
export const parseActivity = (value: string | null | undefined): Activity | null => activities.includes(value as Activity) ? value as Activity : null;
export const parseTargetsMode = (value: string | null | undefined): TargetsMode | null => value === 'auto' || value === 'custom' ? value : null;
export function parseAlsoGoals(value: string | null | undefined, main: MainGoal): MainGoal[] {
  const items = (value ?? '').split(',').map(item => item.trim()).filter((item): item is MainGoal => mainGoals.includes(item as MainGoal));
  return [...new Set(items)].filter(item => item !== main).slice(0, 2);
}

/** Whole years between the birth date and `today`; null when the date is unusable. */
export function ageFromBirthDate(birth: string, today = dayKey()): number | null {
  if (!validDay(birth) || !validDay(today) || birth >= today) return null;
  const b = fromDay(birth), t = fromDay(today);
  const age = t.getFullYear() - b.getFullYear() - (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate()) ? 1 : 0);
  return age >= 0 && age <= 120 ? age : null;
}

export type EstimateInput = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex | null;
  activity: Activity | null;
  goal: MainGoal;
  targetWeightKg?: number | null;
};
export type Estimate = Nutrients & {
  bmr: number;
  maintenance: number;
  adjustment: number;
  floor: number;
  /** True when the floor raised the goal-adjusted number. */
  floored: boolean;
  activity: Activity;
};

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function mifflinStJeor({ weightKg, heightCm, age, sex }: Pick<EstimateInput, 'weightKg' | 'heightCm' | 'age' | 'sex'>) {
  // Unknown sex uses the midpoint of the +5 / −161 constants.
  const constant = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + constant;
}

/** Calories added to (or removed from) maintenance for the chosen goal. */
export function goalAdjustment(goal: MainGoal, maintenance: number, activity: Activity, weightKg: number, targetWeightKg?: number | null) {
  const target = targetWeightKg ?? null;
  const gap = target === null ? null : target - weightKg;
  switch (goal) {
    case 'lose':
      if (gap !== null && gap >= 0) return 0; // Already at or below the target weight.
      if (gap !== null && gap > -2) return -250; // Last couple of kilos: go gentler.
      return -clamp(roundTo(maintenance * 0.2, 10), 300, 500);
    case 'gain':
      if (gap !== null && gap <= 0) return 0;
      return clamp(roundTo(maintenance * 0.1, 10), 200, 350);
    case 'performance':
      return activity === 'moderate' || activity === 'very_active' ? clamp(roundTo(maintenance * 0.05, 10), 100, 200) : 0;
    case 'habits':
      if (gap === null || Math.abs(gap) < 2) return 0;
      return gap < 0 ? -250 : 200;
    default:
      return 0;
  }
}

/** Protein grams per kg of reference body weight by goal. */
const proteinPerKg: Record<MainGoal, number> = { lose: 2.0, gain: 1.8, performance: 1.8, maintain: 1.6, habits: 1.4 };

export function estimateTargets(input: EstimateInput): Estimate {
  const weight = clamp(input.weightKg, 20, 500), height = clamp(input.heightCm, 80, 250), age = clamp(input.age, 13, 120);
  const activity = input.activity ?? 'light';
  const bmr = mifflinStJeor({ weightKg: weight, heightCm: height, age, sex: input.sex });
  const maintenance = bmr * activityFactors[activity];
  const adjustment = goalAdjustment(input.goal, maintenance, activity, weight, input.targetWeightKg);
  const sexFloor = input.sex === 'male' ? 1500 : input.sex === 'female' ? 1200 : 1350;
  const floor = Math.max(sexFloor, roundTo(bmr, 50));
  const raw = maintenance + adjustment;
  const kcal = clamp(roundTo(Math.max(raw, floor), 50), 1000, 6000);

  // Protein uses a reference weight capped at BMI 27 so high body weights do not inflate it.
  const meters = height / 100;
  const reference = Math.min(weight, 27 * meters * meters);
  let protein = clamp(roundTo(reference * proteinPerKg[input.goal], 5), 50, 250);
  let fat = Math.max(roundTo(kcal * 0.28 / 9, 5), roundTo(reference * 0.6, 5));
  let carbs = roundTo((kcal - protein * 4 - fat * 9) / 4, 5);
  if (carbs < 50) {
    // Very low calorie targets: keep a minimum of carbs by trimming fat first, then protein.
    fat = Math.max(30, roundTo((kcal - protein * 4 - 50 * 4) / 9, 5));
    carbs = Math.max(0, roundTo((kcal - protein * 4 - fat * 9) / 4, 5));
    if (carbs < 50) { protein = Math.max(50, roundTo((kcal - fat * 9 - 50 * 4) / 4, 5)); carbs = Math.max(0, roundTo((kcal - protein * 4 - fat * 9) / 4, 5)); }
  }
  return { kcal, protein, carbs, fat, bmr: Math.round(bmr), maintenance: roundTo(maintenance, 10), adjustment, floor, floored: raw < floor, activity };
}

export const macroCalories = (macros: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>) => Math.round(macros.protein * 4 + macros.carbs * 4 + macros.fat * 9);

/** Step sizes for the +/− buttons on the targets sheet. */
export const targetSteps: Record<keyof Nutrients, number> = { kcal: 50, protein: 5, carbs: 5, fat: 5 };
export const targetLimits: Record<keyof Nutrients, { min: number; max: number }> = { kcal: { min: 800, max: 10000 }, protein: { min: 0, max: 2000 }, carbs: { min: 0, max: 2000 }, fat: { min: 0, max: 2000 } };
export function stepTarget(key: keyof Nutrients, value: number, direction: 1 | -1) {
  const step = targetSteps[key];
  // Snap to the step grid first so a typed 2,137 moves to 2,150 / 2,100.
  const snapped = direction > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
  return clamp(snapped, targetLimits[key].min, targetLimits[key].max);
}

/** Whether two target sets are the same to the nearest whole unit. */
export const sameTargets = (a: Nutrients | null | undefined, b: Nutrients | null | undefined) =>
  !!a && !!b && (['kcal', 'protein', 'carbs', 'fat'] as const).every(key => Math.round(a[key]) === Math.round(b[key]));
