import { describe, expect, it } from 'vitest';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { activeEntitlements, isPurchaseCancelled, subscriptionPackages } from '../src/services/subscriptionLogic';

describe('subscription logic', () => {
  it('uses only weekly and monthly packages returned by the current Offering', () => {
    const weekly = { identifier: '$rc_weekly' } as PurchasesPackage;
    const monthly = { identifier: '$rc_monthly' } as PurchasesPackage;
    expect(subscriptionPackages({ weekly, monthly } as PurchasesOffering)).toEqual({ weekly, monthly });
    expect(subscriptionPackages(null)).toEqual({ weekly: null, monthly: null });
  });
  it('derives access from RevenueCat CustomerInfo and honors a configured entitlement', () => {
    const info = { entitlements: { active: { premium: {}, unrelated: {} } } } as unknown as CustomerInfo;
    expect(activeEntitlements(null, 'premium')).toEqual([]);
    expect(activeEntitlements(info, 'premium')).toEqual(['premium']);
    expect(activeEntitlements(info, 'missing')).toEqual([]);
  });
  it('recognizes a successful empty CustomerInfo entitlement map', () => {
    const info = { entitlements: { active: {} } } as unknown as CustomerInfo;
    expect(activeEntitlements(info, 'premium')).toEqual([]);
    expect(activeEntitlements(info)).toEqual([]);
  });
  it('distinguishes cancellation from failures', () => {
    expect(isPurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isPurchaseCancelled(new Error('Network unavailable'))).toBe(false);
  });
});
