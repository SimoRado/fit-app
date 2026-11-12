import { describe, expect, it } from 'vitest';
import { canStartGoogleOAuth, classifyExpoRuntime } from '../src/core/runtimeClassification';

describe('Expo runtime classification', () => {
  it('recognizes Expo Go from its documented Go-only signals', () => {
    expect(classifyExpoRuntime({ appOwnership: 'expo', executionEnvironment: 'storeClient', hasExpoGoConfig: false })).toBe('expo-go');
    expect(classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'storeClient', hasExpoGoConfig: true })).toBe('expo-go');
  });
  it('classifies a native development client even if optional modules are absent', () => {
    expect(classifyExpoRuntime({
      appOwnership: null,
      executionEnvironment: 'storeClient',
      hasExpoGoConfig: false,
      expoGoModule: true,
      legacyPurchasesBridgeModule: false,
    })).toBe('development-client');
  });
  it('classifies a standalone Android APK without optional native modules as native', () => {
    expect(classifyExpoRuntime({
      appOwnership: null,
      executionEnvironment: 'standalone',
      hasExpoGoConfig: false,
      expoGoModule: true,
      legacyPurchasesBridgeModule: false,
    })).toBe('standalone');
  });
  it('does not treat app ownership none or an ExpoGo module as Expo Go evidence', () => {
    expect(classifyExpoRuntime({
      appOwnership: null,
      executionEnvironment: 'bare',
      hasExpoGoConfig: false,
      expoGoModule: true,
      legacyPurchasesBridgeModule: false,
    })).toBe('native-build');
  });
  it('enables Google in every idle native runtime', () => {
    expect(canStartGoogleOAuth('expo-go', false)).toBe(false);
    expect(canStartGoogleOAuth('development-client', false)).toBe(true);
    expect(canStartGoogleOAuth('standalone', false)).toBe(true);
    expect(canStartGoogleOAuth('native-build', true)).toBe(false);
  });
});
