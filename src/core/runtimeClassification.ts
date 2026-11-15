import { cubyfitVariant } from './appVariant';

export type ExpoRuntimeKind = 'expo-go' | 'development-client' | 'standalone' | 'native-build';

export type ExpoRuntimeInput = {
  appOwnership: string | null;
  executionEnvironment: string | null;
  hasExpoGoConfig: boolean;
  isRunningInExpoGo?: boolean;
  expoVersion?: string | null;
  debugMode?: boolean;
  // expo-application's applicationId: the package that is actually installed
  // and running. This is the primary signal.
  nativeApplicationId?: string | null;
  // Package from the served Expo config. Diagnostic only: a development client
  // and Expo Go both receive it from Metro, so it never identifies the host.
  expectedApplicationId?: string | null;
  // Diagnostic only. Development clients expose an ExpoGo module too.
  expoGoModule?: boolean;
  legacyPurchasesBridgeModule?: boolean;
};

export function classifyExpoRuntime(input: ExpoRuntimeInput): ExpoRuntimeKind {
  // 1. The installed application identity decides whenever it is known.
  const variant = cubyfitVariant(input.nativeApplicationId);
  if (variant === 'dev') return 'development-client';
  if (variant === 'preview') {
    if (input.executionEnvironment === 'standalone') return 'standalone';
    // A same-package debug build (the pre-split dev APK) runs a Metro bundle.
    return input.debugMode === false ? 'standalone' : 'development-client';
  }
  // Any other host package (Expo Go, or an unknown wrapper) cannot receive
  // Cubyfit's OAuth callback. Fail closed so social sign-in is disabled.
  // (EXPO_GO_APP_IDS documents the expected case; any foreign host is treated alike.)
  if (input.nativeApplicationId) return 'expo-go';

  // 2. Identity unavailable (web, tests, very old native modules): use
  // documented Expo signals. `bare` / ownership `none` alone are never treated
  // as proof of a Cubyfit build except as the final fallback.
  if (input.executionEnvironment === 'standalone') return 'standalone';
  if (input.isRunningInExpoGo) return 'expo-go';
  if (input.appOwnership === 'expo') return 'expo-go';
  if (input.executionEnvironment === 'storeClient') return 'expo-go';
  return 'native-build';
}

export function isNativeRuntime(runtime: ExpoRuntimeKind) {
  return runtime !== 'expo-go';
}

export function canStartGoogleOAuth(runtime: ExpoRuntimeKind, busy: boolean, clerkConfigured = true) {
  return isNativeRuntime(runtime) && clerkConfigured && !busy;
}
