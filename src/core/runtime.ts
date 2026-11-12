import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import { classifyExpoRuntime } from './runtimeClassification';

export function runtimeSignals() {
  const expoModules = (globalThis as unknown as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  const expoGoModule = Boolean(expoModules?.ExpoGo);
  const legacyPurchasesBridgeModule = Boolean(NativeModules.RNPurchases);
  const appOwnership = Constants.appOwnership ?? null;
  const executionEnvironment = Constants.executionEnvironment ?? null;
  const hasExpoGoConfig = Boolean(Constants.expoGoConfig);
  return {
    kind: classifyExpoRuntime({ appOwnership, executionEnvironment, hasExpoGoConfig, expoGoModule, legacyPurchasesBridgeModule }),
    executionEnvironment,
    appOwnership: appOwnership ?? 'none',
    hasExpoGoConfig,
    expoGoModule,
    legacyPurchasesBridgeModule,
  };
}

export function authDiagnostic(event: string, details: Record<string, string | boolean | null | number> = {}, category: 'GOOGLE' | 'APPLE' | 'EMAIL' | 'NAVIGATION' = 'GOOGLE') {
  if (__DEV__) console.info(`[Fitapp auth][${category}]`, event, details);
}
