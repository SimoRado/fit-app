export type ExpoRuntimeKind = 'expo-go' | 'development-client' | 'standalone' | 'native-build';

export type ExpoRuntimeInput = {
  appOwnership: string | null;
  executionEnvironment: string | null;
  hasExpoGoConfig: boolean;
  // These legacy observations are diagnostic-only. They are intentionally not
  // used for classification because a development client can expose both.
  expoGoModule?: boolean;
  legacyPurchasesBridgeModule?: boolean;
};

export function classifyExpoRuntime(input: ExpoRuntimeInput): ExpoRuntimeKind {
  // Expo Constants documents these as Expo Go-specific. `storeClient` alone is
  // ambiguous, because both Expo Go and expo-dev-client use it.
  if (input.appOwnership === 'expo' || input.hasExpoGoConfig) return 'expo-go';
  if (input.executionEnvironment === 'storeClient') return 'development-client';
  if (input.executionEnvironment === 'standalone') return 'standalone';
  return 'native-build';
}

export function isNativeRuntime(runtime: ExpoRuntimeKind) {
  return runtime !== 'expo-go';
}

export function canStartGoogleOAuth(runtime: ExpoRuntimeKind, busy: boolean) {
  return isNativeRuntime(runtime) && !busy;
}
