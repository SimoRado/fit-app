import type { AdEligibility } from './interstitialManager';

export function adEligibility(subscription: {
  ready: boolean;
  loading: boolean;
  busy: boolean;
  activeEntitlementCount: number;
}): AdEligibility {
  // Any active RevenueCat entitlement suppresses ads even while the configured
  // Premium identifier is awaiting verification. Unknown state never means free.
  if (subscription.activeEntitlementCount > 0) return 'premium';
  // Offerings and customer entitlement lookups are independent RevenueCat
  // operations. A missing Play Store Offering must not invalidate successful
  // CustomerInfo; failed CustomerInfo leaves `ready` false in the provider.
  if (!subscription.ready || subscription.loading || subscription.busy) return 'unresolved';
  return 'free';
}
