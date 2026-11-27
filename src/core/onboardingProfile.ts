import type { Sex } from './nutritionTargets';

/**
 * "Your starting point" (onboarding step 2) completeness for NEW profiles: sex (the existing
 * `body.sex` value used for calorie estimates, not a gender identity field), height, current and
 * target weight are all required. Exact ranges are still enforced by `validateProfileValues`.
 * Existing profiles keep `target_weight: null` as valid; this only gates onboarding.
 */
export type StartingPoint = { sex: Sex | null; height: string; weight: string; target: string };

const parse = (value: string) => (value.trim() === '' ? Number.NaN : Number(value.trim()));

/** True once every required field has a value, so Continue can be enabled. */
export const startingPointComplete = (v: StartingPoint) => !!v.sex && !!v.height.trim() && !!v.weight.trim() && !!v.target.trim();

/** The first problem to show, or null when the step can continue. */
export function startingPointIssue(v: StartingPoint): string | null {
  if (!v.sex) return 'Select Male or Female.';
  if (!(parse(v.height) > 0)) return 'Enter a valid height.';
  if (!(parse(v.weight) > 0)) return 'Enter a valid current weight.';
  if (!v.target.trim()) return 'Enter your target weight.';
  const target = parse(v.target);
  if (!Number.isFinite(target) || target < 20 || target > 500) return 'Target weight must be 20–500 kg.';
  return null;
}
