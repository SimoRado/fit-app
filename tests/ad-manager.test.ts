import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyExpoRuntime } from '../src/core/runtimeClassification';
import { adEligibility } from '../src/services/adEligibility';
import { canUseAdMobNative } from '../src/services/adRuntime';
import { androidInterstitialUnit, ANDROID_TEST_INTERSTITIAL } from '../src/services/adUnit';
import { InterstitialManager, nextAllowedAt, type AdEvent, type AdsAdapter, type ConsentResult, type InterstitialHandle } from '../src/services/interstitialManager';

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
    const dev = classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'storeClient', hasExpoGoConfig: false, expoGoModule: true, legacyPurchasesBridgeModule: false });
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
    expect(adEligibility({ ...free, activeEntitlementCount: 1, loading: true, error: 'offline' })).toBe('premium');
    expect(adEligibility({ ...free, busy: true })).toBe('unresolved');
    expect(adEligibility({ ...free, ready: false })).toBe('unresolved');
    expect(adEligibility({ ...free, error: 'offline' })).toBe('unresolved');
  });
});

describe('central interstitial manager', () => {
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
    expect(h.logs).toContain('ad dismissed');
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
    expect(h.logs).toContain('suppressed: Premium');
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
    expect(h.logs).toContain('native AdMob module unavailable; ads skipped');
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
    expect(h.logs).toContain('ad failed to display');
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
    expect(h.logs).toContain('frequency storage unavailable; ads disabled');
  });
});
