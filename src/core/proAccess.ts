/**
 * Cubyfit Pro access decisions shared by UI surfaces. Pure functions (no React, no RevenueCat) so
 * they are unit tested. The only input is the live subscription state from `useSubscription()`
 * (RevenueCat CustomerInfo) — never a stored or hardcoded flag.
 */
export type ProSignal = { ready: boolean; isPremium: boolean; error: string | null };

/**
 * `pro` / `free` only once RevenueCat has resolved this account's CustomerInfo. While it is loading
 * (`checking`) or could not be reached (`unavailable`, e.g. offline) the entitlement is unknown, so
 * surfaces must neither claim the user is Free nor unlock Pro content.
 */
export type ProStatus = 'pro' | 'free' | 'checking' | 'unavailable';
export function proStatus(signal: ProSignal): ProStatus {
  if (signal.ready) return signal.isPremium ? 'pro' : 'free';
  return signal.error ? 'unavailable' : 'checking';
}

/** Weight chart ranges. 7D and 30D are free; 90D requires an active Pro entitlement. */
export const weightRanges = ['7D', '30D', '90D'] as const;
export type WeightRangeKey = (typeof weightRanges)[number];
export const weightRangeDays = { '7D': 7, '30D': 30, '90D': 90 } as const satisfies Record<WeightRangeKey, number>;
export const proWeightRanges: readonly WeightRangeKey[] = ['90D'];
/** The range Free users fall back to when a Pro range is no longer allowed. */
export const freeFallbackRange: WeightRangeKey = '30D';

export const isProWeightRange = (range: WeightRangeKey) => proWeightRanges.includes(range);
/** Only a resolved, active entitlement unlocks a Pro range; unknown states stay locked. */
export const canUseWeightRange = (range: WeightRangeKey, signal: ProSignal) => !isProWeightRange(range) || proStatus(signal) === 'pro';

/**
 * What a tap on a range chip does: select it, or open the paywall and keep the current range.
 * A Pro range tapped while the entitlement is still unknown also goes to the paywall, which shows
 * the loading/retry state and the Pro status once resolved.
 */
export function weightRangeTap(range: WeightRangeKey, signal: ProSignal): 'select' | 'paywall' {
  return canUseWeightRange(range, signal) ? 'select' : 'paywall';
}

/**
 * The range actually shown. A Pro range selected earlier (restored state, deep link, entitlement
 * expiry) is replaced by the Free fallback whenever the entitlement is not an active Pro one.
 */
export function effectiveWeightRange(selected: WeightRangeKey, signal: ProSignal): WeightRangeKey {
  return canUseWeightRange(selected, signal) ? selected : freeFallbackRange;
}

/** Parses an untrusted range (route param, stored preference); anything unknown → 7D. */
export function parseWeightRange(value: unknown): WeightRangeKey {
  return typeof value === 'string' && (weightRanges as readonly string[]).includes(value) ? value as WeightRangeKey : '7D';
}
