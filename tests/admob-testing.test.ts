import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANDROID_TEST_INTERSTITIAL } from '../src/services/adUnit';
import { buildAdDiagnosticReport } from '../src/services/adDiagnosticReport';
import { canExposeAdMobTesting, canUseManualTestInterstitial } from '../src/services/adTestingPolicy';
import { InterstitialManager, type AdEvent, type AdsAdapter, type ConsentResult, type InterstitialHandle } from '../src/services/interstitialManager';

const permitted: ConsentResult = { canRequestAds: true, privacyOptionsRequired: false };
const free = { eligibility: 'free' as const, safeScreen: false, foreground: true };

class FakeInterstitial implements InterstitialHandle {
  private listeners = new Map<AdEvent, Set<(detail?: unknown) => void>>();
  shown = 0;
  on(event: AdEvent, listener: (detail?: unknown) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }
  load() {}
  async show() { this.shown++; }
  destroy() { this.listeners.clear(); }
  emit(event: AdEvent, detail?: unknown) { this.listeners.get(event)?.forEach(listener => listener(detail)); }
}

function setup(options: {
  internal?: boolean;
  unit?: string;
  consent?: ConsentResult;
  initialShown?: number[];
} = {}) {
  const values = new Map<string, string>([['cubyfit.admob.interstitial.shown.v1', JSON.stringify(options.initialShown ?? [])]]);
  const writes = vi.fn(async (key: string, value: string) => { values.set(key, value); });
  const requests: string[] = [];
  const ads: FakeInterstitial[] = [];
  const adapter: AdsAdapter = {
    gatherConsent: vi.fn(async () => options.consent ?? permitted),
    cachedConsent: vi.fn(async () => options.consent ?? permitted),
    privacyOptions: vi.fn(async () => options.consent ?? permitted),
    initialize: vi.fn(async () => undefined),
    createInterstitial: unit => { requests.push(unit); const ad = new FakeInterstitial(); ads.push(ad); return ad; },
  };
  const manager = new InterstitialManager({
    getItem: async key => values.get(key) ?? null,
    setItem: writes,
  }, async () => adapter, options.unit ?? ANDROID_TEST_INTERSTITIAL, () => Date.now(), 0, undefined, { internalTestingEnabled: options.internal ?? false });
  return { manager, requests, ads, adapter, values, writes };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10 * 60_000); });
afterEach(() => vi.useRealTimers());

describe('AdMob internal testing policy', () => {
  it('shows diagnostics only in debug or explicitly internal builds and always hides them for production', () => {
    expect(canExposeAdMobTesting({ debugBuild: true, internalBuild: false, productionAdsEnabled: 'false', productionBuild: false })).toBe(true);
    expect(canExposeAdMobTesting({ debugBuild: false, internalBuild: true, productionAdsEnabled: 'false', productionBuild: false })).toBe(true);
    expect(canExposeAdMobTesting({ debugBuild: false, internalBuild: false, productionAdsEnabled: 'false', productionBuild: false })).toBe(false);
    expect(canExposeAdMobTesting({ debugBuild: true, internalBuild: true, productionAdsEnabled: 'true', productionBuild: true })).toBe(false);
  });

  it('allows test interstitial requests only with Google sample inventory, consent, Free eligibility and foreground', () => {
    const base = { testingEnabled: true, requestedUnit: ANDROID_TEST_INTERSTITIAL, activeUnit: ANDROID_TEST_INTERSTITIAL, consentPermitsRequests: true, entitlement: 'free' as const, foreground: true };
    expect(canUseManualTestInterstitial(base)).toBe(true);
    expect(canUseManualTestInterstitial({ ...base, requestedUnit: 'ca-app-pub-999/111' })).toBe(false);
    expect(canUseManualTestInterstitial({ ...base, activeUnit: 'ca-app-pub-999/111' })).toBe(false);
    expect(canUseManualTestInterstitial({ ...base, consentPermitsRequests: false })).toBe(false);
    expect(canUseManualTestInterstitial({ ...base, entitlement: 'premium' })).toBe(false);
    expect(canUseManualTestInterstitial({ ...base, entitlement: 'unresolved' })).toBe(false);
    expect(canUseManualTestInterstitial({ ...base, foreground: false })).toBe(false);
    expect(canUseManualTestInterstitial({ ...base, testingEnabled: false })).toBe(false);
  });

  it('loads and shows only the official test ad without changing frequency records', async () => {
    const h = setup({ internal: true, initialShown: [5 * 60_000] });
    h.manager.setContext(free);
    expect(await h.manager.loadTestInterstitial()).toBe(true);
    expect(h.requests).toEqual([ANDROID_TEST_INTERSTITIAL]);
    h.ads[0].emit('loaded');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await h.manager.showTestInterstitial()).toBe(true);
    h.ads[0].emit('opened');
    expect(h.ads[0].shown).toBe(1);
    expect(h.writes).not.toHaveBeenCalled();
    expect(h.manager.getDiagnostics().shownInRolling24Hours).toBe(1);
    expect(h.manager.getDiagnostics().lastShownAt).toBe(10 * 60_000 + 30_000);
    h.ads[0].emit('closed');
    expect(h.manager.getDiagnostics().lastDismissedAt).toBe(10 * 60_000 + 30_000);
  });

  it('suppresses manual test ads for Premium, unresolved eligibility, denied consent, or production configuration', async () => {
    const premium = setup({ internal: true });
    premium.manager.setContext({ ...free, eligibility: 'premium' });
    expect(await premium.manager.loadTestInterstitial()).toBe(false);
    expect(premium.adapter.initialize).not.toHaveBeenCalled();

    const unresolved = setup({ internal: true });
    unresolved.manager.setContext({ ...free, eligibility: 'unresolved' });
    expect(await unresolved.manager.loadTestInterstitial()).toBe(false);
    expect(unresolved.requests).toHaveLength(0);

    const denied = setup({ internal: true, consent: { canRequestAds: false, privacyOptionsRequired: false } });
    denied.manager.setContext(free);
    expect(await denied.manager.loadTestInterstitial()).toBe(false);
    expect(denied.adapter.initialize).not.toHaveBeenCalled();
    expect(denied.requests).toHaveLength(0);

    const productionUnit = setup({ internal: true, unit: 'ca-app-pub-999/111' });
    productionUnit.manager.setContext(free);
    expect(await productionUnit.manager.loadTestInterstitial()).toBe(false);
    expect(productionUnit.requests).toHaveLength(0);
  });

  it('does not treat a cached canRequestAds value as consent when UMP refresh fails', async () => {
    const h = setup({ internal: true });
    h.manager.setContext(free);
    h.adapter.gatherConsent = vi.fn(async () => { throw new Error('UMP form refresh failed'); });
    await h.manager.refreshDiagnostics();
    expect(h.manager.getSnapshot()).toMatchObject({
      canRequestAds: true,
      consentStatus: 'unavailable',
      consentError: 'UMP consent refresh failed: UMP form refresh failed',
    });
    expect(await h.manager.loadTestInterstitial()).toBe(false);
    expect(h.adapter.initialize).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
  });

  it('bounds in-memory diagnostic history and clearing it leaves persisted frequency caps intact', async () => {
    const h = setup({ internal: true, initialShown: [5 * 60_000] });
    h.manager.setContext({ ...free, eligibility: 'premium' });
    for (let index = 0; index < 75; index++) await h.manager.loadTestInterstitial();
    expect(h.manager.getDiagnostics().events.length).toBeLessThanOrEqual(60);
    h.manager.clearDiagnosticHistory();
    expect(h.manager.getDiagnostics().events).toEqual([]);
    expect(h.values.get('cubyfit.admob.interstitial.shown.v1')).toBe(JSON.stringify([5 * 60_000]));
  });

  it('copies a concise report without keys, tokens, email addresses or ad identifiers', () => {
    const h = setup({ internal: true });
    h.manager.setContext(free);
    const state = h.manager.getDiagnostics();
    const report = buildAdDiagnosticReport({
      buildType: 'Standalone internal preview',
      platform: 'android',
      runtime: { kind: 'standalone', executionEnvironment: 'standalone', appOwnership: 'none', hasExpoGoConfig: true, expoVersionPresent: false, appIdMatches: true },
      testingEnabled: true,
      diagnostics: {
        ...state,
        lastError: 'AdMob error ABC_12 pk_test_private value eyJabcdefghijklm.abcdefghijklm.abcdefghijklm user@example.com',
        events: [{ at: Date.now(), event: 'interstitial failed', detail: 'pk_live_super-secret user@example.com' }],
      },
    });
    expect(report).toContain('Runtime: standalone');
    expect(report).not.toMatch(/pk_(?:test|live)_/);
    expect(report).not.toContain('eyJabcdefghijklm');
    expect(report).not.toContain('user@example.com');
    expect(report).not.toContain(ANDROID_TEST_INTERSTITIAL);
  });
});
