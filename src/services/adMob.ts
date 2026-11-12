import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { loadAdMobNative } from './adMobNative';
import { InterstitialManager } from './interstitialManager';
import { androidInterstitialUnit } from './adUnit';

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
);
