import { PRIVACY_VERSION, TERMS_VERSION } from '../shared/legalVersions';

export const adultAgreement = (birthDate = '1995-01-01') => ({ birthDate, timeZone: 'UTC', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true });
