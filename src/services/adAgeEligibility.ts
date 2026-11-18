import { dayKey } from '../core/date';
import { adultOnDay } from '../../shared/ageEligibility';
import { TERMS_VERSION } from '../../shared/legalVersions';

/** Suppress ads until an account has a valid birth date showing an adult user. */
export function adultAdEligible(birthDate: string | null | undefined, now = new Date()): boolean {
  return adultOnDay(birthDate, dayKey(now));
}

export function accountAdEligible(input: {
  authenticated: boolean;
  birthDate?: string | null;
  legalAccepted: boolean;
  ageRejected: boolean;
  serverAdult: boolean;
  serverTermsVersion?: string | null;
}, now = new Date()): boolean {
  return input.authenticated && input.legalAccepted && !input.ageRejected && input.serverAdult &&
    input.serverTermsVersion === TERMS_VERSION && adultAdEligible(input.birthDate, now);
}
