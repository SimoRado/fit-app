export type AdEligibility = 'free' | 'premium' | 'unresolved';
export type AdContext = { eligibility: AdEligibility; safeScreen: boolean; foreground: boolean };
export type ConsentResult = { canRequestAds: boolean; privacyOptionsRequired: boolean };
export type AdEvent = 'loaded' | 'opened' | 'closed' | 'error';
export type InterstitialHandle = {
  on: (event: AdEvent, listener: () => void) => () => void;
  load: () => void;
  show: () => Promise<void>;
  destroy: () => void;
};
export type AdsAdapter = {
  gatherConsent: () => Promise<ConsentResult>;
  cachedConsent: () => Promise<ConsentResult>;
  privacyOptions: () => Promise<ConsentResult>;
  initialize: () => Promise<void>;
  createInterstitial: (unitId: string) => InterstitialHandle;
};
export type AdStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
export type AdSnapshot = { privacyOptionsRequired: boolean; ready: boolean; reason: string };

const FIVE_MINUTES = 5 * 60_000;
const EIGHT_MINUTES = 8 * 60_000;
const DAY = 24 * 60 * 60_000;
const MAX_ADS_PER_DAY = 3;
const AD_MAX_AGE = 60 * 60_000;
const CONSENT_OVERLAY_COOLDOWN = 30_000;
const STORAGE_KEY = 'cubyfit.admob.interstitial.shown.v1';

export function nextAllowedAt(shownAt: number[], launchedAt: number, now: number): number {
  const recent = shownAt.filter(time => Number.isFinite(time) && time > now - DAY).sort((a, b) => a - b);
  return Math.max(
    launchedAt + FIVE_MINUTES,
    recent.length ? recent[recent.length - 1] + EIGHT_MINUTES : 0,
    recent.length >= MAX_ADS_PER_DAY ? recent[recent.length - MAX_ADS_PER_DAY] + DAY : 0,
  );
}

export class InterstitialManager {
  private context: AdContext = { eligibility: 'unresolved', safeScreen: false, foreground: true };
  private adapter: AdsAdapter | null = null;
  private initPromise: Promise<void> | null = null;
  private sdkInitPromise: Promise<void> | null = null;
  private initialized = false;
  private consentAllowed = false;
  private consentFlowEndedAt = 0;
  private shownAt: number[] = [];
  private storageReady = false;
  private ad: InterstitialHandle | null = null;
  private unlisten: (() => void)[] = [];
  private loadedAt = 0;
  private loading = false;
  private showing = false;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private opportunityTimer: ReturnType<typeof setTimeout> | null = null;
  private seenCompletions = new Set<string>();
  private subscribers = new Set<() => void>();
  private snapshot: AdSnapshot = { privacyOptionsRequired: false, ready: false, reason: 'unavailable' };

  constructor(
    private readonly storage: AdStorage,
    private readonly getAdapter: () => Promise<AdsAdapter | null>,
    private readonly unitId: string,
    private readonly now: () => number = Date.now,
    private readonly launchedAt = Date.now(),
    private readonly log: (event: string) => void = () => undefined,
  ) {}

  subscribe = (listener: () => void) => {
    this.subscribers.add(listener);
    return () => { this.subscribers.delete(listener); };
  };
  getSnapshot = () => this.snapshot;

  private publish(next: AdSnapshot) {
    if (Object.entries(next).every(([key, value]) => this.snapshot[key as keyof AdSnapshot] === value)) return;
    this.snapshot = next;
    this.subscribers.forEach(listener => listener());
  }

  setContext(context: AdContext) {
    this.context = context;
    if (context.eligibility !== 'free' || !context.foreground) {
      if (context.eligibility === 'premium') this.log('suppressed: Premium');
      this.clearRetry();
      if (!this.showing) this.releaseAd();
      return;
    }
    if (context.safeScreen) void this.prepare().then(async () => {
      await this.initializeIfEligible();
      this.maybeLoad();
    });
  }

  private canRequest() {
    return this.context.eligibility === 'free' && this.context.safeScreen && this.context.foreground && this.consentAllowed && this.initialized && this.storageReady;
  }

  private async readCap() {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed) || !parsed.every(value => typeof value === 'number' && Number.isFinite(value))) throw Error('Invalid ad cap state');
      this.shownAt = parsed;
      this.storageReady = true;
    } catch {
      this.storageReady = false;
      this.log('frequency storage unavailable; ads disabled');
    }
  }

  private async prepare() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.prepareOnce();
    await this.initPromise;
  }

  private async prepareOnce() {
    try {
      this.adapter = await this.getAdapter();
      if (!this.adapter) { this.log('native AdMob module unavailable; ads skipped'); return; }
      await this.readCap();
      if (!this.storageReady) return;
      let consent: ConsentResult;
      try { consent = await this.adapter.gatherConsent(); }
      catch {
        this.log('consent refresh failed; checking UMP cached permission');
        consent = await this.adapter.cachedConsent();
      }
      this.consentFlowEndedAt = this.now();
      this.publish({ ...this.snapshot, privacyOptionsRequired: consent.privacyOptionsRequired, reason: consent.canRequestAds ? 'consent permitted' : 'consent disallows requests' });
      this.log(consent.canRequestAds ? 'consent permits ad requests' : 'consent does not permit ad requests');
      this.consentAllowed = consent.canRequestAds;
    } catch {
      this.log('AdMob initialization unavailable; ads skipped');
    }
  }

  private async initializeIfEligible() {
    if (this.initialized || !this.adapter || !this.consentAllowed || this.context.eligibility !== 'free') return;
    if (!this.sdkInitPromise) {
      this.sdkInitPromise = this.adapter.initialize().then(() => {
        this.initialized = true;
        this.log('SDK initialized');
      }).catch(() => this.log('AdMob initialization unavailable; ads skipped'));
    }
    await this.sdkInitPromise;
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private releaseAd() {
    this.unlisten.forEach(remove => remove());
    this.unlisten = [];
    this.ad?.destroy();
    this.ad = null;
    this.loadedAt = 0;
    this.loading = false;
    this.publish({ ...this.snapshot, ready: false });
  }

  private retryLater() {
    if (this.retryTimer || !this.canRequest()) return;
    const delay = Math.min(60_000 * 2 ** this.retryCount++, 15 * 60_000);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.maybeLoad(); }, delay);
  }

  private maybeLoad() {
    if (!this.canRequest() || this.showing || this.loading || this.ad || this.retryTimer || !this.adapter) return;
    const wait = nextAllowedAt(this.shownAt, this.launchedAt, this.now()) - this.now();
    if (wait > 0) {
      this.log('suppressed: frequency limit');
      this.retryTimer = setTimeout(() => { this.retryTimer = null; this.maybeLoad(); }, wait);
      return;
    }
    try {
      const ad = this.adapter.createInterstitial(this.unitId);
      this.ad = ad;
      this.loading = true;
      this.unlisten = [
        ad.on('loaded', () => {
          if (this.ad !== ad) return;
          this.loading = false;
          this.loadedAt = this.now();
          this.publish({ ...this.snapshot, ready: true, reason: 'loaded' });
          this.log('ad loaded');
        }),
        ad.on('opened', () => {
          if (this.ad !== ad) return;
          this.showing = true;
          this.shownAt.push(this.now());
          this.publish({ ...this.snapshot, ready: false, reason: 'shown' });
          this.log('ad shown');
          void this.storage.setItem(STORAGE_KEY, JSON.stringify(this.shownAt.filter(time => time > this.now() - DAY))).catch(() => {
            this.storageReady = false;
            this.log('frequency storage failed; ads disabled');
          });
        }),
        ad.on('closed', () => {
          if (this.ad !== ad) return;
          this.log('ad dismissed');
          this.showing = false;
          this.retryCount = 0;
          this.releaseAd();
          this.maybeLoad();
        }),
        ad.on('error', () => {
          if (this.ad !== ad) return;
          this.log('ad failed');
          this.showing = false;
          this.releaseAd();
          this.retryLater();
        }),
      ];
      ad.load();
    } catch {
      this.log('ad failed to load');
      this.releaseAd();
      this.retryLater();
    }
  }

  private async showReady() {
    if (!this.canRequest() || this.showing || !this.ad || !this.snapshot.ready) return false;
    if (this.now() - this.consentFlowEndedAt < CONSENT_OVERLAY_COOLDOWN) return false;
    if (this.now() - this.loadedAt >= AD_MAX_AGE) {
      this.releaseAd(); this.maybeLoad(); return false;
    }
    if (nextAllowedAt(this.shownAt, this.launchedAt, this.now()) > this.now()) {
      this.log('suppressed: frequency limit'); return false;
    }
    this.showing = true;
    this.publish({ ...this.snapshot, ready: false, reason: 'presenting' });
    try { await this.ad.show(); return true; }
    catch {
      this.log('ad failed to display');
      this.showing = false;
      this.releaseAd();
      this.retryLater();
      return false;
    }
  }

  afterWorkoutSaved(completionId: string) {
    if (this.seenCompletions.has(completionId)) return;
    this.seenCompletions.add(completionId);
    if (this.seenCompletions.size > 100) this.seenCompletions.delete(this.seenCompletions.values().next().value!);
    if (this.opportunityTimer) clearTimeout(this.opportunityTimer);
    // The bottom sheet and navigation animation finish before this check.
    this.opportunityTimer = setTimeout(() => { this.opportunityTimer = null; void this.showReady(); }, 1500);
  }

  async showPrivacyOptions() {
    if (!this.adapter || !this.snapshot.privacyOptionsRequired) return false;
    this.consentAllowed = false;
    this.clearRetry();
    if (!this.showing) this.releaseAd();
    try {
      const consent = await this.adapter.privacyOptions();
      this.consentFlowEndedAt = this.now();
      this.publish({ ...this.snapshot, privacyOptionsRequired: consent.privacyOptionsRequired, reason: consent.canRequestAds ? 'consent permitted' : 'consent disallows requests' });
      this.consentAllowed = consent.canRequestAds;
      this.log(consent.canRequestAds ? 'consent permits ad requests' : 'consent does not permit ad requests');
      await this.initializeIfEligible();
      this.maybeLoad();
      return true;
    } catch {
      this.log('privacy options unavailable');
      return false;
    }
  }

}
