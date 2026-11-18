import { adultOnDay } from '../../shared/ageEligibility';

export type AccessDestination = '/onboarding' | '/age-hold' | '/legal-agreements' | '/(tabs)';
export function accessDestination(input: { birthDate?: string | null; hasProfile: boolean; ageRejected: boolean; legalAccepted: boolean; serverRecorded: boolean; serverAdult: boolean; serverTermsAccepted: boolean; serverRejected: boolean; today: string }): AccessDestination {
  if (input.ageRejected || input.serverRejected || (input.hasProfile && !adultOnDay(input.birthDate, input.today)) || (input.serverRecorded && !input.serverAdult)) return '/age-hold';
  if (!input.hasProfile) return '/onboarding';
  if (!input.legalAccepted || !input.serverAdult || !input.serverTermsAccepted) return '/legal-agreements';
  return '/(tabs)';
}
