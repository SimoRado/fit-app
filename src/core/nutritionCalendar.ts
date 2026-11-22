import type { Nutrients } from './nutrition';

/**
 * Nutrition calendar adapter: a daily goal-completion percentage built only from the existing goal
 * semantics (see `weekStats`): a day is "on target" within ±10% of the calorie target, and a
 * "protein day" reaches 90% of the protein target. It does not change any nutrition calculation.
 *
 * Score per day (0–100), the mean of the goals that are configured:
 *   - Calories: reaching 90% of the target scores 1; below that it scales linearly
 *     (kcal / (0.9 × target)). Going more than 10% over loses credit gradually
 *     (1 − (ratio − 1.1)), never below 0.5, so a big overshoot is never shown as complete.
 *   - Protein (only when a protein target above 0 is set): protein / (0.9 × target), capped at 1.
 * 100% therefore needs calories within 90–110% and protein at 90% or more — one small meal never
 * reaches it. A day without any configured target has no score (shown neutral, never complete),
 * and a past day with nothing logged scores 0.
 */
export type NutritionDayTotals = Nutrients & { day: string; entries: number };
export type NutritionScore = { percent: number; calories: number; protein: number | null };

export function nutritionScore(total: Nutrients, logged: boolean, target: Nutrients | null): NutritionScore | null {
  if (!target || !(target.kcal > 0)) return null;
  if (!logged) return { percent: 0, calories: 0, protein: target.protein > 0 ? 0 : null };
  const ratio = total.kcal / target.kcal;
  const calories = ratio > 1.1 ? Math.max(0.5, 1 - (ratio - 1.1)) : Math.min(1, ratio / 0.9);
  const protein = target.protein > 0 ? Math.min(1, total.protein / (target.protein * 0.9)) : null;
  const parts = protein === null ? [calories] : [calories, protein];
  return { percent: parts.reduce((sum, part) => sum + part, 0) / parts.length * 100, calories, protein };
}

/**
 * Target in force on `day`: the latest target effective on or before it (same rule as
 * `nutritionTarget(day)`), else the first target ever set (the dashboard's fallback for earlier days).
 * `targets` must be sorted by `effective_day` ascending.
 */
export function targetForDay<T extends { effective_day: string }>(targets: readonly T[], day: string): T | null {
  let found: T | null = null;
  for (const target of targets) { if (target.effective_day <= day) found = target; else break; }
  return found ?? targets[0] ?? null;
}
