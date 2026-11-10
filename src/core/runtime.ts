import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import { classifyExpoRuntime } from './runtimeClassification';

export function runtimeSignals() {
  const expoModules = (globalThis as unknown as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  const expoGoModule = Boolean(expoModules?.ExpoGo);
  const purchasesModule = Boolean(NativeModules.RNPurchases);
  return {
    kind: classifyExpoRuntime(Constants.appOwnership, expoGoModule, purchasesModule),
    executionEnvironment: Constants.executionEnvironment,
    appOwnership: Constants.appOwnership ?? 'none',
    expoGoModule,
    purchasesModule,
  };
}

export function authDiagnostic(event: string, details: Record<string, string | boolean | null | number> = {}, category: 'GOOGLE' | 'APPLE' | 'EMAIL' | 'NAVIGATION' = 'GOOGLE') {
  if (__DEV__) console.info(`[Fitapp auth][${category}]`, event, details);
}
