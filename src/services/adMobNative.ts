import { Platform, TurboModuleRegistry } from 'react-native';
import type { AdsAdapter, ConsentResult, InterstitialHandle, AdEvent } from './interstitialManager';
import { runtimeSignals } from '../core/runtime';
import { canUseAdMobNative } from './adRuntime';

export async function loadAdMobNative(): Promise<AdsAdapter | null> {
  const names = ['RNGoogleMobileAdsModule', 'RNGoogleMobileAdsConsentModule', 'RNGoogleMobileAdsInterstitialModule'];
  const runtime = runtimeSignals().kind;
  if (runtime === 'expo-go' || Platform.OS !== 'android') return null;
  let modulesPresent = false;
  try { modulesPresent = names.every(name => Boolean(TurboModuleRegistry.get(name))); }
  catch { return null; }
  if (!canUseAdMobNative(runtime, Platform.OS, modulesPresent)) return null;
  try {
    const ads = await import('react-native-google-mobile-ads');
    const consentResult = (info: { canRequestAds: boolean; privacyOptionsRequirementStatus: string; status: string; isConsentFormAvailable: boolean }): ConsentResult => ({
      canRequestAds: info.canRequestAds,
      privacyOptionsRequired: info.privacyOptionsRequirementStatus === ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      status: info.status,
      consentFormAvailable: info.isConsentFormAvailable,
    });
    return {
      gatherConsent: async () => consentResult(await ads.AdsConsent.gatherConsent()),
      cachedConsent: async () => consentResult(await ads.AdsConsent.getConsentInfo()),
      privacyOptions: async () => consentResult(await ads.AdsConsent.showPrivacyOptionsForm()),
      initialize: async () => { await ads.default().initialize(); },
      createInterstitial: (unitId): InterstitialHandle => {
        const ad = ads.InterstitialAd.createForAdRequest(unitId);
        const events = { loaded: ads.AdEventType.LOADED, opened: ads.AdEventType.OPENED, closed: ads.AdEventType.CLOSED, error: ads.AdEventType.ERROR };
        return {
          on: (event: AdEvent, listener: (detail?: unknown) => void) => ad.addAdEventListener(events[event], detail => listener(detail)),
          load: () => ad.load(),
          show: () => ad.show(),
          destroy: () => ad.destroy(),
        };
      },
    };
  } catch {
    return null;
  }
}
