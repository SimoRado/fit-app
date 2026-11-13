export type ExpoRuntimeKind = 'expo-go' | 'development-client' | 'standalone' | 'native-build';

export type ExpoRuntimeInput = {
  appOwnership: string | null;
  executionEnvironment: string | null;
  hasExpoGoConfig: boolean;
  expoVersion?: string | null;
  debugMode?: boolean;
  nativeApplicationId?: string | null;
  expectedApplicationId?: string | null;
  // These legacy observations are diagnostic-only. They are intentionally not
  // used for classification because a development client can expose both.
  expoGoModule?: boolean;
  legacyPurchasesBridgeModule?: boolean;
};

export function classifyExpoRuntime(input: ExpoRuntimeInput): ExpoRuntimeKind {
  // The native execution environment wins over manifest-shaped fields. In
  // SDK 58, expo-constants can expose the embedded manifest through
  // `expoGoConfig` for a standalone binary, so its presence is diagnostic only.
  if (input.executionEnvironment === 'standalone') return 'standalone';
  if (input.executionEnvironment === 'bare') return 'native-build';
  if (input.appOwnership === 'expo') return 'expo-go';
  if (input.executionEnvironment === 'storeClient') {
    if (input.expoVersion) return 'expo-go';
    const appIdMatches = Boolean(
      input.nativeApplicationId &&
      input.expectedApplicationId &&
      input.nativeApplicationId === input.expectedApplicationId,
    );
    if (appIdMatches) return input.debugMode === false ? 'standalone' : 'development-client';
    // StoreClient means Expo Go or expo-dev-client. With no Cubyfit package
    // identity, fail closed as Expo Go instead of starting a broken callback.
    return 'expo-go';
  }
  return 'native-build';
}

export function isNativeRuntime(runtime: ExpoRuntimeKind) {
  return runtime !== 'expo-go';
}

export function canStartGoogleOAuth(runtime: ExpoRuntimeKind, busy: boolean, clerkConfigured = true) {
  return isNativeRuntime(runtime) && clerkConfigured && !busy;
}
