import type { ExpoRuntimeKind } from '../core/runtimeClassification';

export function canUseAdMobNative(runtime: ExpoRuntimeKind, platform: string, modulesPresent: boolean) {
  return platform === 'android' && runtime !== 'expo-go' && modulesPresent;
}
