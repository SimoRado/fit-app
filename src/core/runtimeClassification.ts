export function classifyExpoRuntime(appOwnership: string | null, expoGoModule: boolean, purchasesModule: boolean): 'expo-go' | 'native-build' {
  return !purchasesModule && (appOwnership === 'expo' || expoGoModule) ? 'expo-go' : 'native-build';
}

export function canStartGoogleOAuth(runtime: 'expo-go' | 'native-build', busy: boolean) {
  return runtime === 'native-build' && !busy;
}
