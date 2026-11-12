import { isNativeRuntime, type ExpoRuntimeKind } from './runtimeClassification';

export type AppleAuthMode = 'native' | 'browser' | null;
export type AppRuntime = ExpoRuntimeKind;

export function appleButtonPresentation(platform: string, mode: AppleAuthMode, browserConfigured = false): 'native' | 'browser' | 'unavailable' | null {
  if (platform === 'ios') return mode === 'native' ? 'native' : 'unavailable';
  if (platform === 'android') return mode === 'browser' ? 'browser' : browserConfigured ? 'unavailable' : null;
  return null;
}

export function appleAvailabilityReason(options: {
  platform: string;
  runtime: AppRuntime;
  nativeEnabled: boolean;
  browserEnabled: boolean;
  systemAvailable: boolean;
  availabilityChecked: boolean;
}): string {
  if (options.runtime === 'expo-go') return 'expo-go-cannot-handle-custom-oauth-scheme';
  if (options.platform === 'android') return options.browserEnabled ? 'android-browser-ready' : 'android-flag-disabled';
  if (options.platform === 'ios') {
    if (!options.nativeEnabled) return 'ios-native-flag-disabled';
    if (!options.availabilityChecked) return 'ios-device-check-pending';
    return options.systemAvailable ? 'ios-native-ready' : 'ios-device-unavailable';
  }
  return 'unsupported-platform';
}

export function appleAuthMode(options: {
  platform: string;
  runtime: AppRuntime;
  nativeEnabled: boolean;
  browserEnabled: boolean;
  systemAvailable: boolean;
}): AppleAuthMode {
  if (!isNativeRuntime(options.runtime)) return null;
  if (options.platform === 'ios' && options.nativeEnabled && options.systemAvailable) return 'native';
  if (options.platform === 'android' && options.browserEnabled) return 'browser';
  return null;
}

export function appleAuthUnavailableMessage(options: {
  platform: string;
  runtime: AppRuntime;
  nativeEnabled: boolean;
  browserEnabled: boolean;
  systemAvailable: boolean;
  availabilityChecked: boolean;
}): string | null {
  if (options.platform !== 'ios' && options.platform !== 'android') return null;
  if (!isNativeRuntime(options.runtime)) return 'Apple sign-in requires the Fitapp native build.';
  if (options.platform === 'ios') {
    if (!options.nativeEnabled) return 'Apple sign-in is not configured for this iOS app yet.';
    if (!options.availabilityChecked) return null;
    if (!options.systemAvailable) return 'Apple sign-in is not available on this device.';
  }
  if (options.platform === 'android' && !options.browserEnabled) {
    return 'Apple sign-in is not configured in this Android build yet.';
  }
  return null;
}
