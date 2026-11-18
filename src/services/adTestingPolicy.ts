import { ANDROID_TEST_INTERSTITIAL } from './adUnit';

export type AdTestingBuildSignals = {
  debugBuild: boolean;
  internalBuild: boolean;
  productionAdsEnabled: string | undefined;
  productionBuild: boolean;
};

export function canExposeAdMobTesting(signals: AdTestingBuildSignals): boolean {
  const explicitlyInternal = signals.debugBuild || signals.internalBuild;
  return explicitlyInternal &&
    signals.productionAdsEnabled !== 'true' &&
    !signals.productionBuild;
}

export function umpDebugEeaDeviceId(options: {
  debugBuild: boolean;
  testingEnabled: boolean;
  activeUnit: string | null;
  enabled: string | undefined;
  deviceId: string | undefined;
}): string | undefined {
  return options.debugBuild && options.testingEnabled &&
    options.activeUnit === ANDROID_TEST_INTERSTITIAL &&
    options.enabled === 'true' && /^[A-Fa-f0-9]{32}$/.test(options.deviceId ?? '')
    ? options.deviceId : undefined;
}

export function canUseManualTestInterstitial(options: {
  testingEnabled: boolean;
  requestedUnit: string;
  activeUnit: string;
  consentPermitsRequests: boolean;
  entitlement: 'free' | 'premium' | 'unresolved';
  foreground: boolean;
}): boolean {
  return options.testingEnabled &&
    options.requestedUnit === 'ca-app-pub-3940256099942544/1033173712' &&
    options.activeUnit === options.requestedUnit &&
    options.consentPermitsRequests &&
    options.entitlement === 'free' &&
    options.foreground;
}
