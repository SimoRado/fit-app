import type { AdDiagnostics } from './interstitialManager';

export type AdDiagnosticReportInput = {
  buildType: string;
  platform: string;
  runtime: {
    kind: string;
    executionEnvironment: string | null;
    appOwnership: string;
    hasExpoGoConfig: boolean;
    expoVersionPresent: boolean;
    appIdMatches: boolean;
  };
  testingEnabled: boolean;
  diagnostics: AdDiagnostics;
};

function safeText(value: string): string {
  return value
    .replace(/pk_(?:test|live)_[A-Za-z0-9_-]+/gi, '[redacted-key]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,}){2}\b/g, '[redacted-token]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .slice(0, 160);
}

function stamp(value: number | null): string {
  return value === null ? 'never' : new Date(value).toISOString();
}

export function buildAdDiagnosticReport(input: AdDiagnosticReportInput): string {
  const state = input.diagnostics;
  const recent = state.events.slice(-8).map(item => {
    const detail = item.detail ? ` — ${safeText(item.detail)}` : '';
    return `- ${stamp(item.at)} ${safeText(item.event)}${detail}`;
  });
  return [
    'Cubyfit AdMob diagnostics',
    `Build: ${safeText(input.buildType)}`,
    `Platform: ${safeText(input.platform)}`,
    `Runtime: ${safeText(input.runtime.kind)} (${safeText(input.runtime.executionEnvironment ?? 'unknown')})`,
    `Runtime evidence: ownership=${safeText(input.runtime.appOwnership)}, expoGoConfig=${input.runtime.hasExpoGoConfig}, expoVersion=${input.runtime.expoVersionPresent ? 'present' : 'absent'}, appIdMatches=${input.runtime.appIdMatches}`,
    `Native AdMob module: ${state.nativeAvailable === null ? 'unknown' : state.nativeAvailable ? 'available' : 'missing'}`,
    `SDK initialized: ${state.initialized}`,
    `Internal test controls: ${input.testingEnabled && state.testControlsEnabled}`,
    `Official test unit active: ${state.testUnitActive}`,
    `Interstitial: ${state.loading ? 'loading' : state.ready ? 'loaded' : 'not loaded'}`,
    `Last load attempt: ${stamp(state.lastLoadAttemptAt)}`,
    `Last loaded: ${stamp(state.lastLoadedAt)}`,
    `Last displayed: ${stamp(state.lastShownAt)}`,
    `Last dismissed: ${stamp(state.lastDismissedAt)}`,
    `Last error: ${state.lastError ? safeText(state.lastError) : 'none'}`,
    `UMP: ${safeText(state.consentStatus)}, canRequestAds=${state.canRequestAds}, privacyOptionsRequired=${state.privacyOptionsRequired}`,
    `RevenueCat ad eligibility: ${state.eligibility}`,
    `Ads suppressed/available reason: ${safeText(state.reason)}`,
    `Elapsed since launch: ${Math.floor(state.elapsedSinceLaunch / 1000)}s`,
    `Time since last automatic display: ${state.lastAutomaticShownAt === null ? 'never' : `${Math.floor((state.now - state.lastAutomaticShownAt) / 1000)}s`}`,
    `Automatic displays in rolling 24h: ${state.shownInRolling24Hours}`,
    `Daily allowance remaining: ${state.remainingDailyAllowance}`,
    `Next automatic eligibility: ${stamp(state.nextEligibleAt)}`,
    'Recent events:',
    ...(recent.length ? recent : ['- none']),
  ].join('\n');
}
