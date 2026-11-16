import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

export function subscriptionPackages(offering: PurchasesOffering | null): { annual: PurchasesPackage | null; monthly: PurchasesPackage | null; weekly: PurchasesPackage | null } {
  return { annual: offering?.annual ?? null, monthly: offering?.monthly ?? null, weekly: offering?.weekly ?? null };
}

/** Pro is active only when the verified entitlement ID is active in CustomerInfo. */
export function hasPremium(info: CustomerInfo | null, entitlementId?: string): boolean {
  return !!entitlementId && activeEntitlements(info, entitlementId).length > 0;
}

export function activeEntitlements(info: CustomerInfo | null, entitlementId?: string): string[] {
  if (!info) return [];
  const ids = Object.keys(info.entitlements.active);
  return entitlementId ? ids.filter(id => id === entitlementId) : ids;
}

export function isPurchaseCancelled(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'userCancelled' in error && error.userCancelled === true;
}

export function visibleCustomerInfo<T>(info: T | null, clerkUserId: string | null | undefined, revenueCatUserId: string | null): T | null {
  return clerkUserId && clerkUserId === revenueCatUserId ? info : null;
}
