import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { NativeModules, Platform } from 'react-native';
import { classifyExpoRuntime } from './runtimeClassification';

export function runtimeSignals() {
  const expoModules = (globalThis as unknown as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  const expoGoModule = Boolean(expoModules?.ExpoGo);
  const legacyPurchasesBridgeModule = Boolean(NativeModules.RNPurchases);
  const appOwnership = Constants.appOwnership ?? null;
  const executionEnvironment = Constants.executionEnvironment ?? null;
  const hasExpoGoConfig = Boolean(Constants.expoGoConfig);
  const nativeApplicationId = Application.applicationId ?? null;
  const expectedApplicationId = PlatformApplicationId();
  const expoVersion = Constants.expoVersion ?? null;
  const debugMode = Constants.debugMode;
  return {
    kind: classifyExpoRuntime({
      appOwnership,
      executionEnvironment,
      hasExpoGoConfig,
      expoVersion,
      debugMode,
      nativeApplicationId,
      expectedApplicationId,
      expoGoModule,
      legacyPurchasesBridgeModule,
    }),
    executionEnvironment,
    appOwnership: appOwnership ?? 'none',
    hasExpoGoConfig,
    expoVersion,
    debugMode,
    nativeApplicationId,
    expectedApplicationId,
    appIdMatches: Boolean(nativeApplicationId && expectedApplicationId && nativeApplicationId === expectedApplicationId),
    expoGoModule,
    legacyPurchasesBridgeModule,
  };
}

function PlatformApplicationId() {
  return Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.bundleIdentifier ?? null
    : Platform.OS === 'android'
      ? Constants.expoConfig?.android?.package ?? null
      : null;
}

export function authDiagnostic(event: string, details: Record<string, string | boolean | null | number> = {}, category: 'GOOGLE' | 'APPLE' | 'EMAIL' | 'NAVIGATION' = 'GOOGLE') {
  if (__DEV__) console.info(`[Fitapp auth][${category}]`, event, details);
}
