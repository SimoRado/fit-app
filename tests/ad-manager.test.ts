import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyExpoRuntime } from '../src/core/runtimeClassification';
import { adEligibility } from '../src/services/adEligibility';
import { canUseAdMobNative } from '../src/services/adRuntime';
import { androidInterstitialUnit, ANDROID_TEST_INTERSTITIAL } from '../src/services/adUnit';
import { InterstitialManager, nextAllowedAt, privacyOptionsAvailable, type AdEvent, type AdsAdapter, type ConsentResult, type InterstitialHandle } from '../src/services/interstitialManager';
import { adultAdEligible } from '../src/services/adAgeEligibility';

const MINUTE = 60_000;
const permitted: ConsentResult = { canRequestAds: true, privacyOptionsRequired: false };
const free = { ready: true, loading: false, busy: false, error: null, activeEntitlementCount: 0 };
const freeScreen = { eligibility: 'free' as const, safeScreen: true, foreground: true };

class FakeAd implements InterstitialHandle {
  listeners = new Map<AdEvent, Set<() => void>>();
  loads = 0;
  shows = 0;
  destroyed = false;
  rejectShow = false;
  on(event: AdEvent, listener: () => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener); this.listeners.set(event, listeners);
    return () => { listeners.delete(listener); };
  }
  emit(event: AdEvent) { this.listeners.get(event)?.forEach(listener => listener()); }
  load() { this.loads++; }
  async show() { this.shows++; if (this.rejectShow) throw Error('show failed'); }
  destroy() { this.destroyed = true; this.listeners.clear(); }
}

function harness(options: { consent?: ConsentResult; cached?: ConsentResult; native?: boolean; initialCap?: number[] } = {}) {
  let stored = JSON.stringify(options.initialCap ?? []);
  const ads: FakeAd[] = [];
  const writes: string[] = [];
  const logs: string[] = [];
  const initialize = vi.fn(async () => undefined);
  const adapter: AdsAdapter = {
    gatherConsent: vi.fn(async () => options.consent ?? permitted),
    cachedConsent: vi.fn(async () => options.cached ?? permitted),
    privacyOptions: vi.fn(async () => permitted),
    initialize,
    createInterstitial: () => { const ad = new FakeAd(); ads.push(ad); return ad; },
  };
  const storage = {
    getItem: vi.fn(async () => stored),
    setItem: vi.fn(async (_key: string, value: string) => { stored = value; writes.push(value); }),
  };
  const manager = new InterstitialManager(storage, async () => options.native === false ? null : adapter, 'test-unit', Date.now, 0, event => logs.push(event));
  const advance = async (milliseconds: number) => { await vi.advanceTimersByTimeAsync(milliseconds); };
  return { manager, ads, writes, logs, storage, adapter, initialize, advance, getStored: () => stored };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe('AdMob runtime and entitlement gates', () => {
  it('suppresses ads for invalid, unknown and under-18 birth dates', () => {
    const today = new Date('2026-11-18T12:00:00Z');
    expect(adultAdEligible(undefined, today)).toBe(false);
    expect(adultAdEligible('not-a-date', today)).toBe(false);
    expect(adultAdEligible('2008-11-19', today)).toBe(false);
    expect(adultAdEligible('2008-11-18', today)).toBe(true);
    expect(adultAdEligible('2000-02-30', today)).toBe(false);
  });
  it('shows privacy options only when UMP requires them and consent state is usable', () => {
    const h = harness();
    const base = h.manager.getSnapshot();
    expect(privacyOptionsAvailable(base)).toBe(false);
    expect(privacyOptionsAvailable({ ...base, nativeAvailable: true, privacyOptionsRequired: true, consentStatus: 'checking' })).toBe(false);
    expect(privacyOptionsAvailable({ ...base, nativeAvailable: true, privacyOptionsRequired: true, consentStatus: 'unavailable' })).toBe(false);
    expect(privacyOptionsAvailable({ ...base, nativeAvailable: true, privacyOptionsRequired: true, consentStatus: 'denied' })).toBe(true);
    expect(privacyOptionsAvailable({ ...base, nativeAvailable: true, privacyOptionsRequired: true, consentStatus: 'permitted' })).toBe(true);
  });
  it('uses official test inventory in development and internal previews', () => {
    const live = 'ca-app-pub-1234567890/1234567890';
    expect(androidInterstitialUnit(live, true, true, true)).toBe(ANDROID_TEST_INTERSTITIAL);
    expect(androidInterstitialUnit(live, false, false, false)).toBe(ANDROID_TEST_INTERSTITIAL);
    expect(androidInterstitialUnit(live, false, true, false)).toBe(ANDROID_TEST_INTERSTITIAL);
    expect(androidInterstitialUnit(live, false, true, true)).toBe(live);
    expect(androidInterstitialUnit(undefined, false, true, true)).toBeNull();
  });
  it('supports native development and standalone builds only when AdMob modules exist', () => {
    const go = classifyExpoRuntime({ appOwnership: 'expo', executionEnvironment: 'storeClient', hasExpoGoConfig: true });
    const dev = classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'storeClient', hasExpoGoConfig: false, expoVersion: null, debugMode: true, nativeApplicationId: 'com.bettereveryday.fitness', expectedApplicationId: 'com.bettereveryday.fitness', expoGoModule: true, legacyPurchasesBridgeModule: false });
    const standalone = classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'standalone', hasExpoGoConfig: false });
    expect(canUseAdMobNative(go, 'android', true)).toBe(false);
    expect(canUseAdMobNative(dev, 'android', true)).toBe(true);
    expect(canUseAdMobNative(standalone, 'android', true)).toBe(true);
    expect(canUseAdMobNative(dev, 'android', false)).toBe(false);
    expect(canUseAdMobNative(standalone, 'ios', true)).toBe(false);
  });

  it('keeps active entitlements ad-free through purchase, restore, loading, and errors', () => {
    expect(adEligibility(free)).toBe('free');
    expect(adEligibility({ ...free, activeEntitlementCount: 1 })).toBe('premium');
    expect(adEligibility({ ...free, activeEntitlementCount: 1, loading: true })).toBe('premium');
    expect(adEligibility({ ...free, busy: true })).toBe('unresolved');
    expect(adEligibility({ ...free, ready: false })).toBe('unresolved');
    expect(adEligibility({ ...free, activeEntitlementCount: 0 })).toBe('free');
    expect(adEligibility({ ...free, ready: false })).toBe('unresolved');
  });
});

describe('central interstitial manager', () => {
  it('refreshes UMP information and exposes consent-form availability', async () => {
    const h = harness({ consent: { canRequestAds: false, privacyOptionsRequired: false, status: 'REQUIRED', consentFormAvailable: false } });
    await h.manager.refreshDiagnostics();
    expect(h.adapter.gatherConsent).toHaveBeenCalledOnce();
    expect(h.manager.getSnapshot()).toMatchObject({
      consentStatus: 'denied',
      consentInfoStatus: 'REQUIRED',
      consentFormAvailable: false,
      canRequestAds: false,
      privacyOptionsRequired: false,
    });
    expect(h.manager.getSnapshot().reason).toContain('no form is available');
  });

  it('waits five minutes after launch, then shows only after a saved workout and records actual display', async () => {
    const h = harness();
    h.manager.setContext(freeScreen);
    await h.advance(5 * MINUTE - 1);
    expect(h.ads).toHaveLength(0);
    await h.advance(1);
    expect(h.initialize).toHaveBeenCalledOnce();
    expect(h.ads).toHaveLength(1);
    h.ads[0].emit('loaded');
    await h.advance(30_000);
    h.manager.afterWorkoutSaved('workout-1');
    await h.advance(1500);
    expect(h.ads[0].shows).toBe(1);
    expect(h.writes).toHaveLength(0);
    h.ads[0].emit('opened');
    await Promise.resolve();
    expect(JSON.parse(h.getStored())).toEqual([5 * MINUTE + 30_000 + 1500]);
    h.ads[0].emit('closed');
    expect(h.ads[0].destroyed).toBe(true);
    expect(h.manager.getDiagnostics().events.map(event => event.event)).toContain('interstitial dismissed');
  });

  it('never requests or displays for Premium and cancels a loaded ad on activation or restore', async () => {
    const h = harness();
    h.manager.setContext({ ...freeScreen, eligibility: 'premium' });
    await h.advance(6 * MINUTE);
    expect(h.initialize).not.toHaveBeenCalled();
    h.manager.setContext(freeScreen);
    await h.advance(0);
    h.ads[0].emit('loaded');
    h.manager.setContext({ ...freeScreen, eligibility: 'premium' });
    expect(h.ads[0].destroyed).toBe(true);
    h.manager.afterWorkoutSaved('workout-2');
    await h.advance(1500);
    expect(h.ads[0].shows).toBe(0);
    expect(h.manager.getDiagnostics().events.some(event => event.event === 'ad suppressed' && event.detail === 'Premium entitlement is active')).toBe(true);
  });

  it('does not initialize if Premium activates while consent is being resolved', async () => {
    const h = harness();
    let resolveConsent!: (result: ConsentResult) => void;
    vi.mocked(h.adapter.gatherConsent).mockImplementationOnce(() => new Promise(resolve => { resolveConsent = resolve; }));
    h.manager.setContext(freeScreen);
    await h.advance(0);
    h.manager.setContext({ ...freeScreen, eligibility: 'premium' });
    resolveConsent(permitted);
    await h.advance(6 * MINUTE);
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.ads).toHaveLength(0);
  });

  it('skips Expo Go or an old client without native AdMob modules', async () => {
    const h = harness({ native: false });
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    expect(h.ads).toHaveLength(0);
    expect(h.manager.getSnapshot().nativeAvailable).toBe(false);
    expect(h.manager.getDiagnostics().events.map(event => event.event)).toContain('native SDK unavailable');
  });

  it('does not initialize or load when UMP forbids requests, then handles privacy options', async () => {
    const h = harness({ consent: { canRequestAds: false, privacyOptionsRequired: true } });
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    expect(h.manager.getSnapshot().privacyOptionsRequired).toBe(true);
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.ads).toHaveLength(0);
    expect(await h.manager.showPrivacyOptions()).toBe(true);
    expect(h.initialize).toHaveBeenCalledOnce();
    expect(h.ads).toHaveLength(1);
  });

  it('releases a loaded ad when privacy choices are withdrawn and does not reload it', async () => {
    const h = harness({ consent: { canRequestAds: true, privacyOptionsRequired: true } });
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    h.ads[0].emit('loaded');
    vi.mocked(h.adapter.privacyOptions).mockResolvedValueOnce({ canRequestAds: false, privacyOptionsRequired: true });
    expect(await h.manager.showPrivacyOptions()).toBe(true);
    expect(h.ads[0].destroyed).toBe(true);
    expect(h.manager.getSnapshot()).toMatchObject({ consentStatus: 'denied', canRequestAds: false, ready: false });
    await h.advance(MINUTE);
    expect(h.ads).toHaveLength(1);
  });

  it('fails closed on a later UMP refresh failure even if cached consent allowed ads', async () => {
    const h = harness({ consent: { canRequestAds: true, privacyOptionsRequired: true } });
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    h.ads[0].emit('loaded');
    vi.mocked(h.adapter.gatherConsent).mockRejectedValueOnce(Error('offline'));
    vi.mocked(h.adapter.cachedConsent).mockResolvedValueOnce({ canRequestAds: true, privacyOptionsRequired: true });
    await h.manager.refreshConsent();
    expect(h.ads[0].destroyed).toBe(true);
    expect(h.manager.getSnapshot()).toMatchObject({ consentStatus: 'unavailable', canRequestAds: false, ready: false });
    expect(h.ads).toHaveLength(1);
  });

  it('refreshes UMP on return and removes loaded ads when requests become disallowed', async () => {
    const h = harness({ consent: { canRequestAds: true, privacyOptionsRequired: true } });
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    h.ads[0].emit('loaded');
    vi.mocked(h.adapter.gatherConsent).mockResolvedValueOnce({ canRequestAds: false, privacyOptionsRequired: true });
    await Promise.all([h.manager.refreshConsent(), h.manager.refreshConsent()]);
    expect(h.adapter.gatherConsent).toHaveBeenCalledTimes(2); // Launch plus one deduplicated refresh.
    expect(h.ads[0].destroyed).toBe(true);
    expect(h.manager.getSnapshot()).toMatchObject({ consentStatus: 'denied', canRequestAds: false });
    expect(h.ads).toHaveLength(1);
  });

  it('uses only UMP cached permission after an offline consent refresh error', async () => {
    const h = harness({ cached: { canRequestAds: false, privacyOptionsRequired: false } });
    vi.mocked(h.adapter.gatherConsent).mockRejectedValueOnce(Error('offline'));
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    expect(h.adapter.cachedConsent).toHaveBeenCalledOnce();
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.ads).toHaveLength(0);
  });

  it('does not show on unsafe screens, in background, or while entitlement is unresolved', async () => {
    const h = harness();
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    h.ads[0].emit('loaded');
    h.manager.setContext({ ...freeScreen, safeScreen: false });
    h.manager.afterWorkoutSaved('workout-3');
    await h.advance(1500);
    expect(h.ads[0].shows).toBe(0);
    h.manager.setContext({ ...freeScreen, foreground: false });
    h.manager.afterWorkoutSaved('workout-4');
    await h.advance(1500);
    expect(h.ads[0].shows).toBe(0);
    h.manager.setContext({ ...freeScreen, eligibility: 'unresolved' });
    h.manager.afterWorkoutSaved('workout-5');
    await h.advance(1500);
    expect(h.ads[0].shows).toBe(0);
  });

  it('deduplicates completion events and does not count failed presentation', async () => {
    const h = harness();
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    h.ads[0].emit('loaded');
    h.ads[0].rejectShow = true;
    h.manager.afterWorkoutSaved('duplicate');
    h.manager.afterWorkoutSaved('duplicate');
    await h.advance(1500);
    expect(h.ads[0].shows).toBe(1);
    expect(h.writes).toHaveLength(0);
    expect(h.manager.getSnapshot().lastError).toBe('AdMob could not display the interstitial');
  });

  it('retries a failed load without parallel requests', async () => {
    const h = harness();
    h.manager.setContext(freeScreen);
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    expect(h.ads).toHaveLength(1);
    h.ads[0].emit('error');
    expect(h.ads[0].destroyed).toBe(true);
    await h.advance(MINUTE);
    expect(h.ads).toHaveLength(2);
    expect(h.ads[1].loads).toBe(1);
  });

  it('retries SDK initialization after a transient failure', async () => {
    const h = harness();
    h.initialize.mockRejectedValueOnce(Error('temporarily offline'));
    h.manager.setContext(freeScreen);
    await h.advance(0);
    expect(h.initialize).toHaveBeenCalledOnce();
    expect(h.manager.getSnapshot().initialized).toBe(false);

    h.manager.setContext(freeScreen);
    await h.advance(0);
    expect(h.initialize).toHaveBeenCalledTimes(2);
    expect(h.manager.getSnapshot().initialized).toBe(true);
    await h.advance(6 * MINUTE);
    expect(h.ads).toHaveLength(1);
  });

  it('persists the rolling cap across restarts and honors eight minutes plus three per day', async () => {
    expect(nextAllowedAt([10 * MINUTE], 0, 11 * MINUTE)).toBe(18 * MINUTE);
    expect(nextAllowedAt([1, 10, 20], 0, 25 * MINUTE)).toBe(24 * 60 * MINUTE + 1);
    const h = harness({ initialCap: [5 * MINUTE] });
    h.manager.setContext(freeScreen);
    await h.advance(12 * MINUTE);
    expect(h.ads).toHaveLength(0);
    await h.advance(MINUTE);
    expect(h.ads).toHaveLength(1);
  });

  it('fails closed if frequency storage cannot be read', async () => {
    const h = harness();
    h.storage.getItem.mockRejectedValueOnce(Error('storage unavailable'));
    h.manager.setContext(freeScreen);
    await h.advance(6 * MINUTE);
    expect(h.ads).toHaveLength(0);
    expect(h.manager.getSnapshot().reason).toBe('frequency storage unavailable; automatic ads disabled');
  });
});
