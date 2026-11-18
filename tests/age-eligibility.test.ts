import { describe, expect, it } from 'vitest';
import { ageOnDay, adultOnDay } from '../shared/ageEligibility';
import { dayInZone } from '../convex/security';
import { accessDestination } from '../src/core/accessGate';
import { accountAdEligible } from '../src/services/adAgeEligibility';
import { TERMS_VERSION } from '../shared/legalVersions';

describe('18+ calendar eligibility', () => {
  it('rejects 17, one day before 18, invalid, future and missing dates', () => {
    const today = '2026-11-18';
    for (const birth of ['2009-01-01', '2008-11-19', '2027-01-01', '2000-02-30', '', undefined]) {
      expect(adultOnDay(birth, today)).toBe(false);
    }
  });
  it('accepts the exact 18th birthday and older adults', () => {
    expect(ageOnDay('2008-11-18', '2026-11-18')).toBe(18);
    expect(adultOnDay('2008-11-18', '2026-11-18')).toBe(true);
    expect(adultOnDay('1980-01-01', '2026-11-18')).toBe(true);
  });
  it('handles leap days conservatively', () => {
    expect(adultOnDay('2008-02-29', '2026-02-28')).toBe(false);
    expect(adultOnDay('2008-02-29', '2026-03-01')).toBe(true);
    expect(adultOnDay('2004-02-29', '2022-02-28')).toBe(false);
  });
  it('uses calendar dates in the declared local time zone at midnight boundaries', () => {
    const now = new Date('2026-11-17T23:30:00.000Z');
    expect(dayInZone('Africa/Casablanca', now)).toBe('2026-11-18');
    expect(dayInZone('America/New_York', now)).toBe('2026-11-17');
  });
  it('routes missing, rejected and unagreed accounts away from fitness screens', () => {
    const base = { birthDate: '1990-01-01', hasProfile: true, ageRejected: false, legalAccepted: true, serverRecorded: true, serverAdult: true, serverTermsAccepted: true, serverRejected: false, today: '2026-11-18' };
    expect(accessDestination({ ...base, hasProfile: false })).toBe('/onboarding');
    expect(accessDestination({ ...base, ageRejected: true })).toBe('/age-hold');
    expect(accessDestination({ ...base, birthDate: '2009-01-01' })).toBe('/age-hold');
    expect(accessDestination({ ...base, birthDate: '' })).toBe('/age-hold');
    expect(accessDestination({ ...base, legalAccepted: false })).toBe('/legal-agreements');
    expect(accessDestination({ ...base, serverRecorded: false, serverAdult: false, serverTermsAccepted: false })).toBe('/legal-agreements');
    expect(accessDestination({ ...base, serverRecorded: true, serverAdult: false })).toBe('/age-hold');
    expect(accessDestination({ ...base, serverTermsAccepted: false })).toBe('/legal-agreements');
    expect(accessDestination(base)).toBe('/(tabs)');
  });
  it('keeps ads disabled until both local and server adult and Terms checks pass', () => {
    const base = { authenticated: true, birthDate: '1990-01-01', legalAccepted: true, ageRejected: false, serverAdult: true, serverTermsVersion: TERMS_VERSION };
    expect(accountAdEligible(base, new Date('2026-11-18T12:00:00Z'))).toBe(true);
    expect(accountAdEligible({ ...base, authenticated: false }, new Date('2026-11-18T12:00:00Z'))).toBe(false);
    expect(accountAdEligible({ ...base, ageRejected: true }, new Date('2026-11-18T12:00:00Z'))).toBe(false);
    expect(accountAdEligible({ ...base, serverAdult: false }, new Date('2026-11-18T12:00:00Z'))).toBe(false);
    expect(accountAdEligible({ ...base, serverTermsVersion: 'old' }, new Date('2026-11-18T12:00:00Z'))).toBe(false);
  });
});
