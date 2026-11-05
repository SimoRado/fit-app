import { describe, expect, it } from 'vitest';
import { canStartGoogleOAuth, classifyExpoRuntime } from '../src/core/runtimeClassification';

describe('Expo runtime classification', () => {
  it('does not mistake a development build for Expo Go', () => {
    expect(classifyExpoRuntime(null, false, true)).toBe('native-build');
    expect(classifyExpoRuntime('expo', true, true)).toBe('native-build');
  });
  it('recognizes Expo Go from either independent runtime signal', () => {
    expect(classifyExpoRuntime('expo', false, false)).toBe('expo-go');
    expect(classifyExpoRuntime(null, true, false)).toBe('expo-go');
  });
  it('enables Google only in an idle native build', () => {
    expect(canStartGoogleOAuth('expo-go', false)).toBe(false);
    expect(canStartGoogleOAuth('native-build', false)).toBe(true);
    expect(canStartGoogleOAuth('native-build', true)).toBe(false);
  });
});
