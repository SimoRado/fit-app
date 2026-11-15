import { describe, expect, it } from 'vitest';
import { canStartGoogleOAuth, classifyExpoRuntime } from '../src/core/runtimeClassification';
import { CUBYFIT_APP_ID, CUBYFIT_DEV_APP_ID, oauthScheme } from '../src/core/appVariant';

// Expo Go and the dev client both receive the Cubyfit package from Metro's
// manifest, so expectedApplicationId never distinguishes them; the installed
// application ID does.
const served = { expectedApplicationId: CUBYFIT_APP_ID };

describe('Expo runtime classification', () => {
  it('Expo Go: the previously misclassified Redmi log (bare, expoGoModule, app ID mismatch)', () => {
    expect(classifyExpoRuntime({
      ...served,
      appOwnership: null,
      executionEnvironment: 'bare',
      hasExpoGoConfig: true,
      isRunningInExpoGo: false,
      nativeApplicationId: 'host.exp.exponent',
      expoGoModule: true,
    })).toBe('expo-go');
  });

  it('Expo Go: documented Go-only signals', () => {
    expect(classifyExpoRuntime({ ...served, appOwnership: 'expo', executionEnvironment: 'storeClient', hasExpoGoConfig: true, nativeApplicationId: 'host.exp.exponent' })).toBe('expo-go');
    expect(classifyExpoRuntime({ appOwnership: 'expo', executionEnvironment: 'storeClient', hasExpoGoConfig: false })).toBe('expo-go');
    expect(classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'bare', hasExpoGoConfig: true, isRunningInExpoGo: true })).toBe('expo-go');
  });

  it('any foreign host package fails closed as Expo Go', () => {
    expect(classifyExpoRuntime({ ...served, appOwnership: null, executionEnvironment: 'bare', hasExpoGoConfig: false, nativeApplicationId: 'com.example.wrapper' })).toBe('expo-go');
  });

  it('Cubyfit Dev client (.dev package) regardless of Expo Go-shaped metadata', () => {
    for (const executionEnvironment of ['bare', 'storeClient', null]) {
      expect(classifyExpoRuntime({
        ...served,
        appOwnership: null,
        executionEnvironment,
        hasExpoGoConfig: true,
        isRunningInExpoGo: true,
        debugMode: true,
        nativeApplicationId: CUBYFIT_DEV_APP_ID,
        expoGoModule: true,
      })).toBe('development-client');
    }
  });

  it('same-package debug build (pre-split dev APK) is a development client', () => {
    expect(classifyExpoRuntime({ ...served, appOwnership: null, executionEnvironment: 'bare', hasExpoGoConfig: false, debugMode: true, nativeApplicationId: CUBYFIT_APP_ID })).toBe('development-client');
  });

  it('standalone preview APK (release, embedded bundle)', () => {
    expect(classifyExpoRuntime({ ...served, appOwnership: null, executionEnvironment: 'standalone', hasExpoGoConfig: true, debugMode: false, nativeApplicationId: CUBYFIT_APP_ID, expoGoModule: true })).toBe('standalone');
    expect(classifyExpoRuntime({ ...served, appOwnership: null, executionEnvironment: 'bare', hasExpoGoConfig: false, debugMode: false, nativeApplicationId: CUBYFIT_APP_ID })).toBe('standalone');
  });

  it('identity unavailable: bare or ownership none alone is only the last fallback', () => {
    expect(classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'storeClient', hasExpoGoConfig: false })).toBe('expo-go');
    expect(classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'standalone', hasExpoGoConfig: false })).toBe('standalone');
    expect(classifyExpoRuntime({ appOwnership: null, executionEnvironment: 'bare', hasExpoGoConfig: false })).toBe('native-build');
  });

  it('enables Google in every idle native runtime only', () => {
    expect(canStartGoogleOAuth('expo-go', false)).toBe(false);
    expect(canStartGoogleOAuth('development-client', false)).toBe(true);
    expect(canStartGoogleOAuth('standalone', false)).toBe(true);
    expect(canStartGoogleOAuth('native-build', true)).toBe(false);
    expect(canStartGoogleOAuth('standalone', false, false)).toBe(false);
  });
});

describe('OAuth callback scheme follows the installed binary', () => {
  it('preview keeps the verified betterday:// callback', () => {
    expect(oauthScheme(CUBYFIT_APP_ID, 'betterday')).toBe('betterday');
  });
  it('dev client uses betterday-dev:// even though Metro serves the base scheme', () => {
    expect(oauthScheme(CUBYFIT_DEV_APP_ID, 'betterday')).toBe('betterday-dev');
  });
  it('unknown hosts and missing config pass through to the existing guard', () => {
    expect(oauthScheme('host.exp.exponent', 'betterday')).toBe('betterday');
    expect(oauthScheme(CUBYFIT_DEV_APP_ID, undefined)).toBeUndefined();
  });
});
