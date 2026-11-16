import { describe, expect, it } from 'vitest';
import { annualSavingsPercent, buildPlans, ctaLabel, detectTrial, disclosure, planSubtitle, purchaseErrorMessage, timeline, type PlanProduct } from '../src/services/paywallLogic';
import { hasPremium, subscriptionPackages } from '../src/services/subscriptionLogic';

const product = (extra: Partial<PlanProduct> & Pick<PlanProduct, 'identifier' | 'price' | 'priceString'>): PlanProduct => ({ currencyCode: 'USD', ...extra });
const pkg = (identifier: string, item: PlanProduct) => ({ identifier, product: item }) as never;
const yearly = product({ identifier: 'pro_yearly', price: 59.99, priceString: '$59.99', pricePerMonthString: '$5.00', subscriptionPeriod: 'P1Y' });
const monthly = product({ identifier: 'pro_monthly', price: 5.99, priceString: '$5.99', subscriptionPeriod: 'P1M' });
const trialYearly = { ...yearly, defaultOption: { freePhase: { billingPeriod: { unit: 'DAY', value: 14 } } } };

describe('paywall plans', () => {
  it('maps annual and monthly packages with store prices', () => {
    const plans = buildPlans({ annual: pkg('$rc_annual', yearly), monthly: pkg('$rc_monthly', monthly) }, 'android');
    expect(plans.map(plan => [plan.kind, plan.packageId, plan.billed, plan.perMonth])).toEqual([['annual', '$rc_annual', '$59.99', '$5.00'], ['monthly', '$rc_monthly', '$5.99', '$5.99']]);
  });
  it('computes the real saving (17%, not the mockup 50%)', () => {
    expect(annualSavingsPercent(buildPlans({ annual: pkg('a', yearly), monthly: pkg('m', monthly) }, 'android'))).toBe(17);
    expect(annualSavingsPercent(buildPlans({ annual: pkg('a', { ...yearly, price: 71.88 }), monthly: pkg('m', monthly) }, 'android'))).toBeNull();
    expect(annualSavingsPercent(buildPlans({ annual: pkg('a', { ...yearly, currencyCode: 'EUR' }), monthly: pkg('m', monthly) }, 'android'))).toBeNull();
  });
  it('only reads annual and monthly from the offering', () => {
    expect(subscriptionPackages({ annual: 'A', monthly: 'M', weekly: 'W' } as never)).toEqual({ annual: 'A', monthly: 'M', weekly: 'W' });
  });
});

describe('free trial detection', () => {
  it('uses the Google Play free phase on Android', () => {
    expect(detectTrial(trialYearly, 'android', 'unknown')).toEqual({ days: 14 });
    expect(detectTrial({ ...yearly, defaultOption: { freePhase: { billingPeriod: { unit: 'WEEK', value: 2 } } } }, 'android', 'unknown')).toEqual({ days: 14 });
    expect(detectTrial(yearly, 'android', 'eligible')).toBeNull();
  });
  it('needs confirmed eligibility on iOS and never promises one when unknown', () => {
    const intro = { ...yearly, introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 14, cycles: 1 } };
    expect(detectTrial(intro, 'ios', 'eligible')).toEqual({ days: 14 });
    expect(detectTrial(intro, 'ios', 'unknown')).toBeNull();
    expect(detectTrial(intro, 'ios', 'ineligible')).toBeNull();
    expect(detectTrial({ ...intro, introPrice: { ...intro.introPrice, price: 0.99 } }, 'ios', 'eligible')).toBeNull();
  });
});

describe('paywall copy', () => {
  const [trialPlan] = buildPlans({ annual: pkg('a', trialYearly), monthly: null }, 'android');
  const [, plainMonthly] = buildPlans({ annual: pkg('a', yearly), monthly: pkg('m', monthly) }, 'android');
  it('switches the CTA between trial and standard subscriptions', () => {
    expect(ctaLabel(trialPlan)).toBe('Start my 14-day free trial');
    expect(ctaLabel(plainMonthly)).toBe('Continue with Monthly');
    expect(planSubtitle(trialPlan)).toBe('14 days free, then $59.99/year');
  });
  it('builds a dated trial timeline from today', () => {
    const steps = timeline(trialPlan, 'android', new Date(2026, 10, 16), 'en-GB');
    expect(steps.map(step => step.label)).toEqual(['Today', '29 Nov', '30 Nov']);
    expect(steps[2].text).toBe('$59.99 for the year, unless you cancel.');
  });
  it('states charges honestly and names the right store', () => {
    expect(disclosure(trialPlan, 'android')).toContain('No payment today');
    expect(disclosure(trialPlan, 'android')).toContain('Google Play');
    expect(disclosure(plainMonthly, 'ios')).toBe('$5.99 is charged today and renews automatically every month until cancelled. Cancel anytime in the App Store subscriptions.');
    expect(timeline(plainMonthly, 'android', new Date(2026, 10, 16), 'en-GB')[0].text).toContain('$5.99 is charged');
    const [, plainYearly] = [plainMonthly, buildPlans({ annual: pkg('a', yearly), monthly: null }, 'android')[0]];
    expect(timeline(plainYearly, 'android', new Date(2026, 10, 16), 'en-GB')[1]).toEqual({ label: '16 Nov 2027', text: 'Renews automatically at $59.99 a year.' });
  });
  it('maps RevenueCat error codes to helpful messages', () => {
    expect(purchaseErrorMessage({ code: '10' })).toMatch(/No connection/);
    expect(purchaseErrorMessage({ code: '7' })).toMatch(/another Cubyfit account/);
  });
});

describe('entitlement', () => {
  const info = { entitlements: { active: { pro: {} } } } as never;
  it('requires the configured entitlement ID', () => {
    expect(hasPremium(info, 'pro')).toBe(true);
    expect(hasPremium(info, 'other')).toBe(false);
    expect(hasPremium(info, undefined)).toBe(false);
    expect(hasPremium(null, 'pro')).toBe(false);
  });
});
