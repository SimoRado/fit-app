/**
 * Pure paywall rules: plan mapping, savings, trial detection, timeline and
 * disclosure copy. Prices always come from the RevenueCat store product; this
 * file never invents an amount.
 */
import type { PurchasesPackage } from 'react-native-purchases';

export type PlanKind = 'annual' | 'monthly';
export type StorePlatform = 'android' | 'ios';
/** iOS eligibility from `checkTrialOrIntroductoryPriceEligibility`; Android lists only offers the user can redeem. */
export type TrialEligibility = 'eligible' | 'ineligible' | 'unknown';

/** The subset of a RevenueCat store product the paywall reads (keeps tests SDK-free). */
export type PlanProduct = {
  identifier: string;
  price: number;
  priceString: string;
  currencyCode: string;
  pricePerMonthString?: string | null;
  subscriptionPeriod?: string | null;
  introPrice?: { price: number; periodUnit: string; periodNumberOfUnits: number; cycles: number } | null;
  defaultOption?: { freePhase?: { billingPeriod: { unit: string; value: number } } | null } | null;
};
export type Trial = { days: number };
export type Plan = {
  kind: PlanKind;
  packageId: string;
  product: PlanProduct;
  /** Billing amount for the full period, e.g. "$59.99". */
  billed: string;
  /** Per-month amount: the store's own value when it provides one. */
  perMonth: string;
  trial: Trial | null;
};

const unitDays: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
export const periodDays = (unit: string, value: number) => (unitDays[unit.toUpperCase()] ?? 0) * value;

/**
 * A free trial only counts when the billing provider configured one for this
 * product AND the user can redeem it. Unknown eligibility never promises a trial.
 */
export function detectTrial(product: PlanProduct, platform: StorePlatform, eligibility: TrialEligibility): Trial | null {
  if (platform === 'android') {
    // Google Play (and the RevenueCat Test Store on Android) attach the free phase
    // to the default option only when the user is eligible for that offer.
    const phase = product.defaultOption?.freePhase?.billingPeriod;
    const days = phase ? periodDays(phase.unit, phase.value) : 0;
    return days > 0 ? { days } : null;
  }
  const intro = product.introPrice;
  if (!intro || intro.price !== 0 || eligibility !== 'eligible') return null;
  const days = periodDays(intro.periodUnit, intro.periodNumberOfUnits) * Math.max(1, intro.cycles);
  return days > 0 ? { days } : null;
}

export function formatMoney(amount: number, currency: string, locale?: string) {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
}

/** RevenueCat exposes `annual` / `monthly` packages on the current offering. */
export function buildPlans(packages: { annual: PurchasesPackage | null; monthly: PurchasesPackage | null }, platform: StorePlatform, eligibility: Partial<Record<string, TrialEligibility>> = {}, locale?: string): Plan[] {
  const plans: Plan[] = [];
  for (const kind of ['annual', 'monthly'] as const) {
    const item = packages[kind];
    if (!item) continue;
    const product = item.product as unknown as PlanProduct;
    const perMonth = kind === 'monthly' ? product.priceString : product.pricePerMonthString ?? formatMoney(product.price / 12, product.currencyCode, locale);
    plans.push({ kind, packageId: item.identifier, product, billed: product.priceString, perMonth, trial: detectTrial(product, platform, eligibility[product.identifier] ?? 'unknown') });
  }
  return plans;
}

/** Whole-percent saving of the annual plan over 12 monthly payments (same currency only). */
export function annualSavingsPercent(plans: Plan[]): number | null {
  const annual = plans.find(plan => plan.kind === 'annual'), monthly = plans.find(plan => plan.kind === 'monthly');
  if (!annual || !monthly || annual.product.currencyCode !== monthly.product.currencyCode || monthly.product.price <= 0) return null;
  const percent = Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100);
  return percent >= 5 ? percent : null;
}

export const storeName = (platform: StorePlatform) => platform === 'android' ? 'Google Play' : 'the App Store';
const intervalWord = (kind: PlanKind) => kind === 'annual' ? 'year' : 'month';
const planName = (kind: PlanKind) => kind === 'annual' ? 'Yearly' : 'Monthly';

export const ctaLabel = (plan: Plan) => plan.trial ? `Start my ${plan.trial.days}-day free trial` : `Continue with ${planName(plan.kind)}`;
export function planSubtitle(plan: Plan) {
  if (plan.trial) return `${plan.trial.days} days free, then ${plan.billed}/${intervalWord(plan.kind)}`;
  return plan.kind === 'annual' ? `Billed ${plan.billed} once a year` : 'Billed monthly, cancel anytime';
}

const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const addPeriod = (date: Date, kind: PlanKind) => { const next = new Date(date); if (kind === 'annual') next.setFullYear(next.getFullYear() + 1); else next.setMonth(next.getMonth() + 1); return next; };
/** "29 Nov", or "16 Nov 2027" when the date is not in the current year (so a renewal never reads like today). */
export const shortDate = (date: Date, locale?: string, today = new Date()) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) }).format(date);

export type TimelineStep = { label: string; text: string };
/**
 * Real dates from today. Cubyfit does not schedule its own trial-ending
 * reminder, so the middle step states the cancellation deadline instead.
 */
export function timeline(plan: Plan, platform: StorePlatform, today = new Date(), locale?: string): TimelineStep[] {
  if (plan.trial) {
    const ends = addDays(today, plan.trial.days);
    return [
      { label: 'Today', text: 'Full Pro access starts. No charge today.' },
      { label: shortDate(addDays(ends, -1), locale, today), text: `Last day to cancel in ${storeName(platform)} without being charged.` },
      { label: shortDate(ends, locale, today), text: `${plan.billed} for the ${intervalWord(plan.kind)}, unless you cancel.` },
    ];
  }
  const next = addPeriod(today, plan.kind);
  return [
    { label: 'Today', text: `Pro starts and ${plan.billed} is charged.` },
    { label: shortDate(next, locale, today), text: `Renews automatically at ${plan.billed} a ${intervalWord(plan.kind)}.` },
    { label: 'Anytime', text: `Cancel in ${storeName(platform)} subscriptions.` },
  ];
}

export function disclosure(plan: Plan, platform: StorePlatform) {
  const cancel = `Cancel anytime in ${storeName(platform)} subscriptions.`;
  return plan.trial
    ? `No payment today. After ${plan.trial.days} days, ${plan.billed}/${intervalWord(plan.kind)} renews automatically until cancelled. ${cancel}`
    : `${plan.billed} is charged today and renews automatically every ${intervalWord(plan.kind)} until cancelled. ${cancel}`;
}

/** Friendly purchase/restore failure text by RevenueCat error code. */
export function purchaseErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === '10' || code === '35') return 'No connection to the store. Check your internet and try again.';
  if (code === '20') return 'Your payment is pending. Pro unlocks as soon as the store confirms it.';
  if (code === '6') return 'This subscription is already owned. Tap Restore purchases.';
  if (code === '7') return 'This purchase belongs to another Cubyfit account. Sign in with that account or contact support.';
  return error instanceof Error && error.message ? error.message : 'The store could not complete this request. Please try again.';
}
