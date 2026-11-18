import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { loadAdMobNative } from './adMobNative';
import { InterstitialManager } from './interstitialManager';
import { androidInterstitialUnit } from './adUnit';
import { canExposeAdMobTesting, umpDebugEeaDeviceId } from './adTestingPolicy';

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

// JS-only UMP debug geography for an explicitly allowlisted device in the
// Cubyfit Dev build. Release bundles never pass these options to UMP.
const debugDeviceId = process.env.EXPO_PUBLIC_UMP_TEST_DEVICE_ID;
const debugEeaTestDeviceId = umpDebugEeaDeviceId({
  debugBuild: __DEV__,
  testingEnabled: admobTestingEnabled,
  activeUnit: unitId,
  enabled: process.env.EXPO_PUBLIC_UMP_DEBUG_EEA,
  deviceId: debugDeviceId,
});

export const interstitialManager = new InterstitialManager(
  Storage,
  unitId ? () => loadAdMobNative(debugEeaTestDeviceId) : async () => null,
  unitId ?? '',
  Date.now,
  Date.now(),
  event => { if (__DEV__) console.info('[Cubyfit ads]', event); },
  { internalTestingEnabled: admobTestingEnabled, umpDebugTestDevice: Boolean(debugEeaTestDeviceId) },
);
