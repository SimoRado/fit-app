import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

export function subscriptionPackages(offering: PurchasesOffering | null): { weekly: PurchasesPackage | null; monthly: PurchasesPackage | null } {
  return { weekly: offering?.weekly ?? null, monthly: offering?.monthly ?? null };
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
