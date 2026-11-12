export const ANDROID_TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712';

export function androidInterstitialUnit(configuredUnit: unknown, development: boolean, productionEnabled: boolean, productionBuild: boolean): string | null {
  if (development || !productionEnabled || !productionBuild) return ANDROID_TEST_INTERSTITIAL;
  return typeof configuredUnit === 'string' && /^ca-app-pub-\d+\/\d+$/.test(configuredUnit)
    ? configuredUnit : null;
}
