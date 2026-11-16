import { db, repo } from './db';
import { dayKey } from '../core/date';
import type { Nutrients } from '../core/nutrition';
import { weightSummary } from '../core/logic';
import { ageFromBirthDate, estimateTargets, parseActivity, parseGoal, parseSex, parseTargetsMode, prefKeys, sameTargets, type Estimate, type EstimateInput, type TargetsMode } from '../core/nutritionTargets';
import { nutritionTarget, saveNutritionTarget } from './nutrition';

export type PlanInputs = EstimateInput & { birthDate: string; latestWeightDay: string | null };

/** Everything the estimate needs, read from the profile, latest weigh-in and body preferences. */
export async function planInputs(today = dayKey()): Promise<PlanInputs | null> {
  const [profile, weights, preferences] = await Promise.all([repo.profile(), repo.weights(), repo.preferences()]);
  if (!profile) return null;
  const prefs = new Map(preferences.map(item => [item.key, item.value]));
  const latest = weightSummary(weights).latest;
  return {
    weightKg: latest?.kg ?? profile.start_weight,
    latestWeightDay: latest?.day ?? null,
    heightCm: profile.height_cm,
    birthDate: profile.birth_date,
    age: ageFromBirthDate(profile.birth_date, today) ?? 30,
    sex: parseSex(prefs.get(prefKeys.sex)),
    activity: parseActivity(prefs.get(prefKeys.activity)),
    goal: parseGoal(profile.fitness_goal),
    targetWeightKg: profile.target_weight,
  };
}

export async function currentEstimate(today = dayKey()): Promise<Estimate | null> {
  const inputs = await planInputs(today);
  return inputs ? estimateTargets(inputs) : null;
}

/**
 * Auto: targets follow the estimate. Custom: the user edited them, so they are
 * preserved until the user resets. Accounts that already had targets before
 * this setting existed are treated as custom so nothing they typed is replaced.
 */
export async function targetsMode(): Promise<TargetsMode> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', prefKeys.mode);
  const saved = parseTargetsMode(row?.value);
  if (saved) return saved;
  const owner = await d.getFirstAsync<{ id: string }>('SELECT id FROM profile LIMIT 1');
  const existing = owner ? await d.getFirstAsync('SELECT 1 FROM nutrition_targets WHERE owner_id=? LIMIT 1', owner.id) : null;
  return existing ? 'custom' : 'auto';
}
export async function setTargetsMode(mode: TargetsMode) { await repo.setPreference(prefKeys.mode, mode); }

/** Saves user-edited targets from today and keeps them from being recalculated. */
export async function saveCustomTargets(nutrients: Nutrients, day = dayKey()) {
  await saveNutritionTarget(day, nutrients);
  await setTargetsMode('custom');
}

/**
 * In auto mode, writes today's target when the estimate differs from the
 * target in effect. Earlier days keep the targets they had. Returns whether a
 * row was written. Custom targets are never touched.
 */
export async function syncAutoTargets(day = dayKey(), force = false): Promise<boolean> {
  const saved = parseTargetsMode((await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', prefKeys.mode))?.value);
  if (!force && (saved ?? await targetsMode()) !== 'auto') return false;
  const estimate = await currentEstimate(day);
  if (!estimate) return false;
  const next = { kcal: estimate.kcal, protein: estimate.protein, carbs: estimate.carbs, fat: estimate.fat };
  // Persist the mode once so a target written now is not later mistaken for a custom one.
  if (saved !== 'auto') await setTargetsMode('auto');
  if (sameTargets(await nutritionTarget(day), next)) return false;
  await saveNutritionTarget(day, next);
  return true;
}

/** Switches back to the calculated targets. */
export const resetToEstimate = (day = dayKey()) => syncAutoTargets(day, true);
