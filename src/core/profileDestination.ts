export function profileDestination(hasProfile: boolean): '/(tabs)' | '/onboarding' {
  return hasProfile ? '/(tabs)' : '/onboarding';
}
