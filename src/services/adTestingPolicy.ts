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
