import { ANDROID_TEST_INTERSTITIAL } from './adUnit';
import { canUseManualTestInterstitial } from './adTestingPolicy';

export type AdEligibility = 'free' | 'premium' | 'unresolved';
export type AdContext = { eligibility: AdEligibility; safeScreen: boolean; foreground: boolean };
export type ConsentResult = {
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
  status?: string;
  consentFormAvailable?: boolean;
};
export type AdEvent = 'loaded' | 'opened' | 'closed' | 'error';
export type InterstitialHandle = {
  on: (event: AdEvent, listener: (detail?: unknown) => void) => () => void;
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
export type ConsentStatus = 'unknown' | 'checking' | 'permitted' | 'denied' | 'unavailable';
export type AdDiagnosticEvent = { at: number; event: string; detail?: string };
export type AdSnapshot = {
  privacyOptionsRequired: boolean;
  ready: boolean;
  reason: string;
  nativeAvailable: boolean | null;
  initialized: boolean;
  consentStatus: ConsentStatus;
  consentInfoStatus: string;
  consentFormAvailable: boolean | null;
  consentError: string | null;
  canRequestAds: boolean | null;
  loading: boolean;
  lastLoadAttemptAt: number | null;
  lastLoadedAt: number | null;
  lastShownAt: number | null;
  lastDismissedAt: number | null;
  lastError: string | null;
  eventRevision: number;
};
export type AdDiagnostics = AdSnapshot & {
  testUnitActive: boolean;
  testControlsEnabled: boolean;
  eligibility: AdEligibility;
  safeScreen: boolean;
  foreground: boolean;
  launchedAt: number;
  now: number;
  elapsedSinceLaunch: number;
  lastAutomaticShownAt: number | null;
  shownInRolling24Hours: number;
  remainingDailyAllowance: number;
  nextEligibleAt: number;
  events: AdDiagnosticEvent[];
};

export type InterstitialManagerOptions = {
  internalTestingEnabled?: boolean;
  testUnitId?: string;
};

const FIVE_MINUTES = 5 * 60_000;
const EIGHT_MINUTES = 8 * 60_000;
const DAY = 24 * 60 * 60_000;
const MAX_ADS_PER_DAY = 3;
const AD_MAX_AGE = 60 * 60_000;
const CONSENT_OVERLAY_COOLDOWN = 30_000;
const STORAGE_KEY = 'cubyfit.admob.interstitial.shown.v1';
const MAX_DIAGNOSTIC_EVENTS = 60;

function sanitizedError(detail: unknown): string {
  if (detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string' && /^[A-Z0-9_]{1,48}$/.test(detail.code)) {
    return `AdMob request failed (${detail.code})`;
  }
  return 'AdMob request failed';
}

function sanitizedConsentError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UMP consent refresh failed';
  const code = 'code' in error && (typeof error.code === 'number' || typeof error.code === 'string') ? String(error.code).slice(0, 24) : null;
  const rawMessage = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const message = rawMessage
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/ca-app-pub-\d+[~/]\d+/gi, '[AdMob app or unit id]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .replace(/[^A-Za-z0-9 .,:()_\-\[\]]/g, '')
    .trim()
    .slice(0, 160);
  if (message.toLowerCase().includes('no form') || message.toLowerCase().includes('publisher misconfiguration')) {
    return 'AdMob has no consent form configured for this app in Privacy & messaging';
  }
  return message ? `UMP consent refresh failed${code ? ` (code ${code})` : ''}: ${message}` : `UMP consent refresh failed${code ? ` (code ${code})` : ''}`;
}

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
  private events: AdDiagnosticEvent[] = [];
  private adPurpose: 'automatic' | 'test' | null = null;
  private snapshot: AdSnapshot = {
    privacyOptionsRequired: false,
    ready: false,
    reason: 'unavailable',
    nativeAvailable: null,
    initialized: false,
    consentStatus: 'unknown',
    consentInfoStatus: 'UNKNOWN',
    consentFormAvailable: null,
    consentError: null,
    canRequestAds: null,
    loading: false,
    lastLoadAttemptAt: null,
    lastLoadedAt: null,
    lastShownAt: null,
    lastDismissedAt: null,
    lastError: null,
    eventRevision: 0,
  };

  constructor(
    private readonly storage: AdStorage,
    private readonly getAdapter: () => Promise<AdsAdapter | null>,
    private readonly unitId: string,
    private readonly now: () => number = Date.now,
    private readonly launchedAt = Date.now(),
    private readonly log: (event: string) => void = () => undefined,
    private readonly options: InterstitialManagerOptions = {},
  ) {}

  subscribe = (listener: () => void) => {
    this.subscribers.add(listener);
    return () => { this.subscribers.delete(listener); };
  };
  getSnapshot = () => this.snapshot;

  getDiagnostics = (): AdDiagnostics => {
    const now = this.now();
    const recent = this.shownAt.filter(time => Number.isFinite(time) && time > now - DAY).sort((a, b) => a - b);
    const nextEligibleAt = nextAllowedAt(this.shownAt, this.launchedAt, now);
    return {
      ...this.snapshot,
      testUnitActive: this.unitId === ANDROID_TEST_INTERSTITIAL,
      testControlsEnabled: this.options.internalTestingEnabled === true && this.unitId === ANDROID_TEST_INTERSTITIAL,
      eligibility: this.context.eligibility,
      safeScreen: this.context.safeScreen,
      foreground: this.context.foreground,
      launchedAt: this.launchedAt,
      now,
      elapsedSinceLaunch: Math.max(0, now - this.launchedAt),
      lastAutomaticShownAt: recent.length ? recent[recent.length - 1] : null,
      shownInRolling24Hours: recent.length,
      remainingDailyAllowance: Math.max(0, MAX_ADS_PER_DAY - recent.length),
      nextEligibleAt,
      events: [...this.events],
    };
  };

  private record(event: string, detail?: string, error = false) {
    this.events.push({ at: this.now(), event, ...(detail ? { detail } : {}) });
    if (this.events.length > MAX_DIAGNOSTIC_EVENTS) this.events.splice(0, this.events.length - MAX_DIAGNOSTIC_EVENTS);
    this.publish({
      ...this.snapshot,
      eventRevision: this.snapshot.eventRevision + 1,
      ...(error ? { lastError: detail ?? event } : {}),
    });
    this.log(detail ? `${event}: ${detail}` : event);
  }

  private publish(next: AdSnapshot) {
    if (Object.entries(next).every(([key, value]) => this.snapshot[key as keyof AdSnapshot] === value)) return;
    this.snapshot = next;
    this.subscribers.forEach(listener => listener());
  }

  setContext(context: AdContext) {
    const previous = this.context;
    this.context = context;
    if (previous.eligibility !== context.eligibility || previous.safeScreen !== context.safeScreen || previous.foreground !== context.foreground) {
      this.record('ad eligibility updated', context.eligibility);
    }
    if (context.eligibility !== 'free' || !context.foreground) {
      if (context.eligibility === 'premium' && previous.eligibility !== 'premium') this.record('ad suppressed', 'Premium entitlement is active');
      else if (context.eligibility === 'unresolved' && previous.eligibility !== 'unresolved') this.record('ad suppressed', 'subscription eligibility is unresolved');
      this.clearRetry();
      if (!this.showing) this.releaseAd();
      this.publish({ ...this.snapshot, reason: this.automaticSuppressionReason() });
      return;
    }
    if (!context.safeScreen) {
      this.publish({ ...this.snapshot, reason: this.automaticSuppressionReason() });
      return;
    }
    void this.prepare().then(async () => {
      await this.initializeIfEligible();
      this.maybeLoad();
    });
  }

  private canRequest() {
    return this.context.eligibility === 'free' && this.context.safeScreen && this.context.foreground && this.consentAllowed && this.snapshot.consentStatus === 'permitted' && this.initialized && this.storageReady;
  }

  private automaticSuppressionReason() {
    if (this.context.eligibility === 'premium') return 'Premium entitlement is active';
    if (this.context.eligibility === 'unresolved') return 'subscription eligibility is unresolved';
    if (!this.context.foreground) return 'app is not in the foreground';
    if (!this.context.safeScreen) return 'current screen is not an automatic ad placement';
    if (this.snapshot.nativeAvailable === false) return 'native AdMob module unavailable';
    if (!this.storageReady) return 'frequency storage unavailable; automatic ads disabled';
    if (!this.consentAllowed) return this.snapshot.consentStatus === 'unavailable' ? 'consent unavailable' : 'consent does not permit ad requests';
    if (!this.initialized) return 'AdMob SDK is not initialized';
    return 'automatic ad request is unavailable';
  }

  private async readCap() {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed) || !parsed.every(value => typeof value === 'number' && Number.isFinite(value))) throw Error('Invalid ad cap state');
      this.shownAt = parsed;
      this.storageReady = true;
      this.publish({ ...this.snapshot, reason: 'frequency state ready' });
    } catch {
      this.storageReady = false;
      this.publish({ ...this.snapshot, reason: 'frequency storage unavailable; automatic ads disabled' });
      this.record('automatic ads suppressed', 'frequency storage unavailable');
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
      this.publish({ ...this.snapshot, nativeAvailable: Boolean(this.adapter) });
      this.record(this.adapter ? 'native SDK available' : 'native SDK unavailable');
      if (!this.adapter) { this.publish({ ...this.snapshot, reason: 'native AdMob module unavailable' }); return; }
      await this.readCap();
      let consent: ConsentResult;
      let refreshFailed = false;
      this.publish({ ...this.snapshot, consentStatus: 'checking', reason: 'checking consent' });
      this.record('consent requested');
      try { consent = await this.adapter.gatherConsent(); }
      catch (error) {
        refreshFailed = true;
        const detail = sanitizedConsentError(error);
        this.publish({ ...this.snapshot, consentError: detail });
        this.record('consent refresh failed', detail, true);
        consent = await this.adapter.cachedConsent();
      }
      this.consentFlowEndedAt = this.now();
      this.publish({
        ...this.snapshot,
        privacyOptionsRequired: consent.privacyOptionsRequired,
        consentInfoStatus: consent.status ?? 'UNKNOWN',
        consentFormAvailable: consent.consentFormAvailable ?? null,
        consentError: refreshFailed ? 'UMP information refresh failed; cached status used' : null,
        canRequestAds: consent.canRequestAds,
        consentStatus: refreshFailed ? 'unavailable' : consent.canRequestAds ? 'permitted' : 'denied',
        reason: refreshFailed ? 'UMP refresh failed; ad requests disabled' : consent.canRequestAds ? 'consent permitted' : consent.status === 'REQUIRED' && consent.consentFormAvailable === false ? 'consent is required but no form is available; check UMP dashboard messages' : 'consent disallows requests',
      });
      this.record('consent status updated', `status ${consent.status ?? 'UNKNOWN'}; form ${consent.consentFormAvailable === undefined ? 'unknown' : consent.consentFormAvailable ? 'available' : 'unavailable'}; requests ${consent.canRequestAds ? 'permitted' : 'not permitted'}${refreshFailed ? '; refresh failed, requests disabled' : ''}`);
      this.consentAllowed = consent.canRequestAds;
    } catch {
      this.publish({ ...this.snapshot, consentStatus: 'unavailable', consentError: 'UMP consent refresh failed', canRequestAds: false, reason: 'consent unavailable' });
      this.record('consent unavailable', 'ad requests disabled until UMP can be checked', true);
    }
  }

  private async initializeIfEligible() {
    if (this.initialized || !this.adapter || !this.consentAllowed || this.snapshot.consentStatus !== 'permitted' || this.context.eligibility !== 'free') return;
    if (!this.sdkInitPromise) {
      this.sdkInitPromise = this.adapter.initialize().then(() => {
        this.initialized = true;
        this.publish({ ...this.snapshot, initialized: true, reason: 'SDK initialized' });
        this.record('SDK initialized');
      }).catch(error => {
        this.publish({ ...this.snapshot, initialized: false, reason: 'SDK initialization failed' });
        this.record('SDK initialization failed', sanitizedError(error), true);
      });
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
    this.adPurpose = null;
    this.loadedAt = 0;
    this.loading = false;
    this.publish({ ...this.snapshot, ready: false, loading: false });
  }

  private retryLater() {
    if (this.retryTimer || !this.canRequest()) return;
    const delay = Math.min(60_000 * 2 ** this.retryCount++, 15 * 60_000);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.maybeLoad(); }, delay);
  }

  private maybeLoad() {
    if (!this.canRequest()) {
      const reason = this.automaticSuppressionReason();
      if (reason !== this.snapshot.reason) this.publish({ ...this.snapshot, reason });
      return;
    }
    this.loadInterstitial('automatic');
  }

  private loadInterstitial(purpose: 'automatic' | 'test') {
    const canLoad = purpose === 'automatic'
      ? this.canRequest()
      : this.canManualTestRequest();
    if (!canLoad || this.showing || this.loading || this.ad || this.retryTimer || !this.adapter) return false;
    if (purpose === 'automatic') {
      const wait = nextAllowedAt(this.shownAt, this.launchedAt, this.now()) - this.now();
      if (wait > 0) {
        this.publish({ ...this.snapshot, reason: 'frequency limit' });
        this.record('ad suppressed', 'frequency limit');
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.maybeLoad(); }, wait);
        return false;
      }
    }
    try {
      const requestUnit = purpose === 'test' ? this.options.testUnitId ?? ANDROID_TEST_INTERSTITIAL : this.unitId;
      if (purpose === 'test' && (requestUnit !== ANDROID_TEST_INTERSTITIAL || this.unitId !== ANDROID_TEST_INTERSTITIAL)) {
        this.publish({ ...this.snapshot, reason: 'test controls require the official Google test unit' });
        this.record('test ad suppressed', 'official Google test unit is not active');
        return false;
      }
      const ad = this.adapter.createInterstitial(requestUnit);
      this.ad = ad;
      this.adPurpose = purpose;
      this.loading = true;
      const attemptedAt = this.now();
      this.publish({ ...this.snapshot, loading: true, ready: false, lastLoadAttemptAt: attemptedAt, lastError: null, reason: purpose === 'test' ? 'loading official test interstitial' : 'loading interstitial' });
      this.record(purpose === 'test' ? 'test interstitial load started' : 'interstitial load started');
      this.unlisten = [
        ad.on('loaded', () => {
          if (this.ad !== ad) return;
          this.loading = false;
          this.loadedAt = this.now();
          this.publish({ ...this.snapshot, ready: true, loading: false, lastLoadedAt: this.loadedAt, reason: purpose === 'test' ? 'official test interstitial loaded' : 'loaded' });
          this.record(purpose === 'test' ? 'test interstitial loaded' : 'interstitial loaded');
        }),
        ad.on('opened', () => {
          if (this.ad !== ad) return;
          this.showing = true;
          const shownAt = this.now();
          if (this.adPurpose === 'automatic') {
            this.shownAt.push(shownAt);
            void this.storage.setItem(STORAGE_KEY, JSON.stringify(this.shownAt.filter(time => time > this.now() - DAY))).catch(() => {
              this.storageReady = false;
              this.record('automatic ads suppressed', 'frequency storage failed', true);
            });
          }
          this.publish({ ...this.snapshot, ready: false, loading: false, lastShownAt: shownAt, reason: this.adPurpose === 'test' ? 'test interstitial shown' : 'shown' });
          this.record(this.adPurpose === 'test' ? 'test interstitial opened' : 'interstitial opened');
        }),
        ad.on('closed', () => {
          if (this.ad !== ad) return;
          const purposeAtClose = this.adPurpose;
          this.publish({ ...this.snapshot, lastDismissedAt: this.now(), reason: purposeAtClose === 'test' ? 'test interstitial dismissed' : 'dismissed' });
          this.record(purposeAtClose === 'test' ? 'test interstitial dismissed' : 'interstitial dismissed');
          this.showing = false;
          this.retryCount = 0;
          this.releaseAd();
          if (purposeAtClose === 'automatic') this.maybeLoad();
        }),
        ad.on('error', detail => {
          if (this.ad !== ad) return;
          const failure = sanitizedError(detail);
          this.publish({ ...this.snapshot, lastError: failure, reason: failure });
          this.record(purpose === 'test' ? 'test interstitial failed' : 'interstitial failed', failure, true);
          this.showing = false;
          this.releaseAd();
          if (purpose === 'automatic') this.retryLater();
        }),
      ];
      ad.load();
      return true;
    } catch {
      this.publish({ ...this.snapshot, lastError: 'AdMob could not start the load request', reason: 'load failed to start' });
      this.record(purpose === 'test' ? 'test interstitial failed' : 'interstitial failed', 'AdMob could not start the load request', true);
      this.releaseAd();
      if (purpose === 'automatic') this.retryLater();
      return false;
    }
  }

  private canManualTestRequest() {
    return this.initialized && canUseManualTestInterstitial({
      testingEnabled: this.options.internalTestingEnabled === true,
      requestedUnit: this.options.testUnitId ?? ANDROID_TEST_INTERSTITIAL,
      activeUnit: this.unitId,
      consentPermitsRequests: this.consentAllowed && this.snapshot.consentStatus === 'permitted',
      entitlement: this.context.eligibility,
      foreground: this.context.foreground,
    });
  }

  private async showReady(purpose: 'automatic' | 'test') {
    const eligible = purpose === 'automatic' ? this.canRequest() : this.canManualTestRequest();
    if (!eligible) return false;
    if (this.showing || !this.ad || !this.snapshot.ready) {
      if (purpose === 'test') this.record('test interstitial unavailable', 'load the official test ad before showing it');
      else if (!this.ad || !this.snapshot.ready) this.record('ad suppressed', 'interstitial is not ready');
      return false;
    }
    if (purpose === 'test' && this.adPurpose !== 'test' && this.unitId !== ANDROID_TEST_INTERSTITIAL) return false;
    if (this.now() - this.consentFlowEndedAt < CONSENT_OVERLAY_COOLDOWN) {
      if (purpose === 'test') this.record('test interstitial suppressed', 'consent form was recently displayed');
      return false;
    }
    if (this.now() - this.loadedAt >= AD_MAX_AGE) {
      this.releaseAd();
      if (purpose === 'automatic') this.maybeLoad();
      else this.loadInterstitial('test');
      return false;
    }
    if (purpose === 'automatic' && nextAllowedAt(this.shownAt, this.launchedAt, this.now()) > this.now()) {
      this.record('ad suppressed', 'frequency limit'); return false;
    }
    this.showing = true;
    this.adPurpose = purpose;
    this.publish({ ...this.snapshot, ready: false, reason: purpose === 'test' ? 'presenting test interstitial' : 'presenting' });
    try {
      await this.ad.show();
      return true;
    }
    catch {
      this.publish({ ...this.snapshot, lastError: 'AdMob could not display the interstitial', reason: 'display failed' });
      this.record(purpose === 'test' ? 'test interstitial failed to display' : 'interstitial failed to display', 'AdMob could not display the interstitial', true);
      this.showing = false;
      this.releaseAd();
      if (purpose === 'automatic') this.retryLater();
      return false;
    }
  }

  async loadTestInterstitial() {
    if (this.options.internalTestingEnabled !== true || this.unitId !== ANDROID_TEST_INTERSTITIAL || (this.options.testUnitId ?? ANDROID_TEST_INTERSTITIAL) !== ANDROID_TEST_INTERSTITIAL) {
      this.record('test interstitial suppressed', 'internal test build and official test unit are required');
      return false;
    }
    if (this.context.eligibility !== 'free') {
      this.record('test interstitial suppressed', this.context.eligibility === 'premium' ? 'Premium entitlement is active' : 'subscription eligibility is unresolved');
      return false;
    }
    if (!this.context.foreground) {
      this.record('test interstitial suppressed', 'app is not in the foreground');
      return false;
    }
    await this.prepare();
    await this.initializeIfEligible();
    if (!this.canManualTestRequest() || !this.adapter) {
      this.record('test interstitial suppressed', this.snapshot.reason || 'native SDK or consent is not ready');
      return false;
    }
    if (this.ad) {
      this.record(this.snapshot.ready ? 'test interstitial already loaded' : 'test interstitial load already in progress');
      return this.snapshot.ready || this.loading;
    }
    this.clearRetry();
    return this.loadInterstitial('test');
  }

  async showTestInterstitial() {
    if (this.options.internalTestingEnabled !== true || this.unitId !== ANDROID_TEST_INTERSTITIAL || (this.options.testUnitId ?? ANDROID_TEST_INTERSTITIAL) !== ANDROID_TEST_INTERSTITIAL) {
      this.record('test interstitial suppressed', 'internal test build and official test unit are required');
      return false;
    }
    if (this.context.eligibility !== 'free') {
      this.record('test interstitial suppressed', this.context.eligibility === 'premium' ? 'Premium entitlement is active' : 'subscription eligibility is unresolved');
      return false;
    }
    return this.showReady('test');
  }

  async refreshDiagnostics() {
    try {
      if (!this.adapter) {
        this.adapter = await this.getAdapter();
        this.publish({ ...this.snapshot, nativeAvailable: Boolean(this.adapter) });
        this.record(this.adapter ? 'native SDK available' : 'native SDK unavailable');
      }
      if (!this.adapter) {
        this.publish({ ...this.snapshot, reason: 'native AdMob module unavailable' });
        return;
      }
      let consent: ConsentResult;
      let refreshError: string | null = null;
      try {
        // UMP refreshes its information and presents a form when required.
        // This is explicit user action on the diagnostics screen; no ad is
        // requested by refreshing consent.
        consent = await this.adapter.gatherConsent();
      } catch (error) {
        refreshError = sanitizedConsentError(error);
        consent = await this.adapter.cachedConsent();
      }
      this.consentAllowed = consent.canRequestAds;
      this.publish({
        ...this.snapshot,
        canRequestAds: consent.canRequestAds,
        privacyOptionsRequired: consent.privacyOptionsRequired,
        consentInfoStatus: refreshError ? consent.status ?? 'UNKNOWN' : consent.status ?? 'UNKNOWN',
        consentFormAvailable: consent.consentFormAvailable ?? null,
        consentError: refreshError,
        consentStatus: refreshError ? 'unavailable' : consent.canRequestAds ? 'permitted' : 'denied',
        reason: refreshError ? `${refreshError}; ad requests disabled` : consent.canRequestAds ? 'consent permits ad requests' : consent.status === 'REQUIRED' && consent.consentFormAvailable === false ? 'consent is required but no form is available; check UMP dashboard messages' : 'consent disallows requests',
      });
      const detail = `status ${consent.status ?? 'UNKNOWN'}; form ${consent.consentFormAvailable === undefined ? 'unknown' : consent.consentFormAvailable ? 'available' : 'unavailable'}; privacy options ${consent.privacyOptionsRequired ? 'required' : 'not required'}; requests ${consent.canRequestAds ? 'permitted' : 'not permitted'}${refreshError ? '; refresh failed, cached state used' : ''}`;
      this.record('consent status refreshed', `${detail}${refreshError ? `; ${refreshError}; ad requests disabled` : ''}`, Boolean(refreshError));
    } catch {
      this.publish({ ...this.snapshot, consentStatus: 'unavailable', consentError: 'UMP refresh and cached status lookup failed', canRequestAds: false, reason: 'consent unavailable' });
      this.record('diagnostics refresh failed', 'UMP refresh and cached status lookup failed', true);
    }
  }

  clearDiagnosticHistory() {
    this.events = [];
    this.publish({
      ...this.snapshot,
      eventRevision: this.snapshot.eventRevision + 1,
      lastLoadAttemptAt: null,
      lastLoadedAt: null,
      lastShownAt: null,
      lastDismissedAt: null,
      lastError: null,
    });
  }

  afterWorkoutSaved(completionId: string) {
    if (this.seenCompletions.has(completionId)) return;
    this.seenCompletions.add(completionId);
    if (this.seenCompletions.size > 100) this.seenCompletions.delete(this.seenCompletions.values().next().value!);
    if (this.opportunityTimer) clearTimeout(this.opportunityTimer);
    // The bottom sheet and navigation animation finish before this check.
    this.opportunityTimer = setTimeout(() => { this.opportunityTimer = null; void this.showReady('automatic'); }, 1500);
  }

  async showPrivacyOptions() {
    if (!this.adapter || !this.snapshot.privacyOptionsRequired) return false;
    this.consentAllowed = false;
    this.clearRetry();
    if (!this.showing) this.releaseAd();
    try {
      this.publish({ ...this.snapshot, consentStatus: 'checking', canRequestAds: false, reason: 'opening privacy options' });
      this.record('privacy options opened');
      const consent = await this.adapter.privacyOptions();
      this.consentFlowEndedAt = this.now();
      this.publish({
        ...this.snapshot,
        privacyOptionsRequired: consent.privacyOptionsRequired,
        consentInfoStatus: consent.status ?? 'UNKNOWN',
        consentFormAvailable: consent.consentFormAvailable ?? null,
        consentError: null,
        canRequestAds: consent.canRequestAds,
        consentStatus: consent.canRequestAds ? 'permitted' : 'denied',
        reason: consent.canRequestAds ? 'consent permitted' : 'consent disallows requests',
      });
      this.consentAllowed = consent.canRequestAds;
      this.record('consent status updated', consent.canRequestAds ? 'ad requests permitted' : 'ad requests not permitted');
      await this.initializeIfEligible();
      this.maybeLoad();
      return true;
    } catch {
      this.publish({ ...this.snapshot, consentStatus: 'unavailable', canRequestAds: false, reason: 'privacy options unavailable' });
      this.record('privacy options unavailable', 'consent status could not be updated', true);
      return false;
    }
  }

}
