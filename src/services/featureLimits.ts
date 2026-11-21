/**
 * Subscription limits applied at the local write boundary. `isPremium` must
 * originate from the live RevenueCat CustomerInfo entitlement; a persisted
 * preference or a caller-supplied "Pro" flag is never used as proof.
 */
export const FREE_HABIT_LIMIT = 3;
export const FREE_ROUTINE_LIMIT = 6;

export type LimitedFeature = 'habits' | 'routines';
export type FeatureAccess = { isPremium: boolean };

export function limitFor(feature: LimitedFeature) {
  return feature === 'habits' ? FREE_HABIT_LIMIT : FREE_ROUTINE_LIMIT;
}

export function mayCreate(feature: LimitedFeature, currentCount: number, access: FeatureAccess) {
  return access.isPremium || currentCount < limitFor(feature);
}

/** A typed error lets the UI offer the existing paywall without masking storage failures. */
export class FeatureLimitError extends Error {
  readonly feature: LimitedFeature;
  readonly limit: number;

  constructor(feature: LimitedFeature) {
    const limit = limitFor(feature);
    super(feature === 'habits'
      ? `Free plan limit reached. You can track up to ${limit} habits on Cubyfit Free.`
      : `Free plan limit reached. You can create up to ${limit} gym routines on Cubyfit Free.`);
    this.name = 'FeatureLimitError';
    this.feature = feature;
    this.limit = limit;
  }
}

export function assertMayCreate(feature: LimitedFeature, currentCount: number, access: FeatureAccess) {
  if (!mayCreate(feature, currentCount, access)) throw new FeatureLimitError(feature);
}

export function isFeatureLimitError(error: unknown): error is FeatureLimitError {
  return error instanceof FeatureLimitError;
}
