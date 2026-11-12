import type { AdEligibility } from './interstitialManager';

export function adEligibility(subscription: {
  ready: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  activeEntitlementCount: number;
}): AdEligibility {
  // Any active RevenueCat entitlement suppresses ads even while the configured
  // Premium identifier is awaiting verification. Unknown state never means free.
  if (subscription.activeEntitlementCount > 0) return 'premium';
  if (!subscription.ready || subscription.loading || subscription.busy || subscription.error) return 'unresolved';
  return 'free';
}
