import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { loadAdMobNative } from './adMobNative';
import { InterstitialManager } from './interstitialManager';
import { androidInterstitialUnit } from './adUnit';
import { canExposeAdMobTesting } from './adTestingPolicy';

export const admobTestingEnabled = canExposeAdMobTesting({
  debugBuild: __DEV__,
  // This config is embedded in the native manifest at build time. A release
  // bundle therefore does not depend on an environment variable from Metro or
  // the developer's PC after installation.
  internalBuild: Constants.expoConfig?.extra?.admob?.internalBuild === true,
  productionAdsEnabled: process.env.EXPO_PUBLIC_ADMOB_PRODUCTION_ADS_ENABLED,
  productionBuild: Constants.expoConfig?.extra?.admob?.productionBuild === true,
});

const unitId = androidInterstitialUnit(
  Constants.expoConfig?.extra?.admob?.androidInterstitialUnitId,
  __DEV__,
  process.env.EXPO_PUBLIC_ADMOB_PRODUCTION_ADS_ENABLED === 'true',
  Constants.expoConfig?.extra?.admob?.productionBuild === true,
);

export const interstitialManager = new InterstitialManager(
  Storage,
  unitId ? loadAdMobNative : async () => null,
  unitId ?? '',
  Date.now,
  Date.now(),
  event => { if (__DEV__) console.info('[Cubyfit ads]', event); },
  { internalTestingEnabled: admobTestingEnabled },
);
