import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { birthEligibility, authModeMessage, authModeRoute, canBeginProfile, emailActionLabel, languageOptions, languageShortCode, parseAuthMode, reviewEditStep } from '../src/core/authMode';
import { localize } from '../src/core/i18n';
import { ageOnDay } from '../shared/ageEligibility';

const read = (path: string) => readFileSync(path, 'utf8');

describe('welcome mode switching', () => {
  it('defaults to sign up and only accepts login explicitly', () => {
    expect(parseAuthMode(undefined)).toBe('signup');
    expect(parseAuthMode('anything')).toBe('signup');
    expect(parseAuthMode('login')).toBe('login');
  });
  it('routes each mode into the existing Clerk screens with the matching email label', () => {
    expect(authModeRoute('signup')).toBe('/(auth)/sign-up');
    expect(authModeRoute('login')).toBe('/(auth)/sign-in');
    expect(emailActionLabel('signup')).toBe('Sign up with email');
    expect(emailActionLabel('login')).toBe('Log in with email');
    expect(authModeMessage('signup')).not.toBe(authModeMessage('login'));
  });
  it('removes the prototype chips, motivational block and extra stripes from the Welcome screen', () => {
    const source = read('src/app/(auth)/welcome.tsx');
    for (const removed of ['>Habits<', '>Training<', '>Nutrition<', 'Built one day at a time', 'Your progress starts with showing up']) expect(source).not.toContain(removed);
    expect(source).not.toContain('<Svg');
    expect(read('src/ui/auth.tsx').match(/<Svg/g)?.length).toBe(1);
  });
});

describe('language selector', () => {
  it('offers English, French and Arabic with short codes', () => {
    expect(languageOptions.map(option => [option.code, option.short, option.label])).toEqual([['en', 'EN', 'English'], ['fr', 'FR', 'Français'], ['ar', 'AR', 'العربية']]);
    expect(languageShortCode('fr')).toBe('FR');
  });
  it('reuses the app language state instead of a second translation system', () => {
    const source = read('src/ui/auth.tsx');
    expect(source).toContain('setLanguage');
    expect(source).toContain('chevron-down');
    expect(source).toContain('BottomSheet');
  });
  it('translates the new Welcome strings and falls back to English elsewhere', () => {
    expect(localize('Sign up', 'fr')).toBe('Créer un compte');
    expect(localize('Log in with email', 'ar')).toBeTruthy();
    expect(localize('A string with no translation yet', 'fr')).toBe('A string with no translation yet');
  });
});

describe('legal acknowledgment and onboarding gates', () => {
  it('keeps both document links clickable and the box unchecked by default', () => {
    const legal = read('src/ui/LegalAgreements.tsx');
    expect(legal).toContain('https://cubyfit.app/terms');
    expect(legal).toContain('https://cubyfit.app/privacy');
    expect(read('src/app/(auth)/welcome.tsx')).toContain("useState(params.legal === '1')");
  });
  it('still records acceptance server-side with the policy versions at the final step', () => {
    const onboarding = read('src/app/onboarding.tsx');
    expect(onboarding).toContain('acceptEligibility');
    expect(onboarding).toContain('termsVersion: TERMS_VERSION');
    expect(onboarding).toContain('birthEligibility(birth, dayKey(), ageOnDay)');
  });
  it('blocks Let’s Begin until the legal box is checked and while saving', () => {
    expect(canBeginProfile(false, false)).toBe(false);
    expect(canBeginProfile(true, true)).toBe(false);
    expect(canBeginProfile(true, false)).toBe(true);
  });
  it('review Edit controls return to the matching step', () => {
    expect(reviewEditStep).toEqual({ about: 0, body: 1, goals: 2 });
  });
  it('underage birthdays remain ineligible', () => {
    expect(ageOnDay('2015-01-01', '2026-11-27')).toBeLessThan(18);
    expect(ageOnDay('2000-01-01', '2026-11-27')).toBeGreaterThanOrEqual(18);
  });
});

describe('dedicated email screens', () => {
  it('no longer repeat Google/Apple or the OR divider, and offer a Back button to Welcome with the mode', () => {
    for (const file of ['sign-in.tsx', 'sign-up.tsx']) {
      const source = read('src/app/(auth)/' + file);
      expect(source).not.toContain('SocialAuth');
      expect(source).not.toContain('OrDivider');
      expect(source).toContain("pathname: '/(auth)/welcome'");
      expect(source).toContain('onBack');
    }
    expect(read('src/app/(auth)/sign-up.tsx')).toContain("mode: 'signup'");
    expect(read('src/app/(auth)/sign-in.tsx')).toContain("mode: 'login'");
  });
  it('keeps Terms acknowledgment enforced for email sign-up', () => {
    expect(read('src/app/(auth)/welcome.tsx')).toContain('!legalAccepted');
    expect(read('src/app/(auth)/sign-up.tsx')).toContain('disabled={busy || !legalAccepted}');
  });
});

describe('under-18 birthday gate on onboarding step 1', () => {
  const today = '2026-11-27';
  const status = (birth: string) => birthEligibility(birth, today, ageOnDay);
  it('blocks 17, permits 18, permits turning 18 today, blocks turning 18 tomorrow', () => {
    expect(status('2009-06-01')).toBe('underage');
    expect(status('2008-01-15')).toBe('adult');
    expect(status('2008-11-27')).toBe('adult');
    expect(status('2008-11-28')).toBe('underage');
  });
  it('handles leap-day births', () => {
    expect(birthEligibility('2008-02-29', '2026-02-28', ageOnDay)).toBe('underage');
    expect(birthEligibility('2008-02-29', '2026-03-01', ageOnDay)).toBe('adult');
  });
  it('blocks invalid, future and incomplete dates', () => {
    expect(status('2003-02-30')).toBe('invalid');
    expect(status('2003-13-01')).toBe('invalid');
    expect(status('2030-01-01')).toBe('invalid');
    expect(status('2003--')).toBe('incomplete');
    expect(status('--')).toBe('incomplete');
    expect(status('20-01-01')).toBe('incomplete');
    expect(status('')).toBe('incomplete');
  });
  it('re-enables Continue once the birthday is corrected', () => {
    expect(status('2015-05-05')).not.toBe('adult');
    expect(status('2000-05-05')).toBe('adult');
  });
  it('shows the warning, disables Continue, and never calls the eligibility endpoints before the final step', () => {
    const source = read('src/app/onboarding.tsx');
    expect(source).toContain('You must be at least 18 years old to continue.');
    expect(source).toContain('busy || ageBlocked');
    expect(source).not.toContain('eligibility.reject');
    const beforeSave = source.slice(0, source.indexOf('async function save()'));
    expect(beforeSave).not.toContain('acceptEligibility(');
    expect(beforeSave).not.toContain('repo.createProfile');
  });
  it('keeps server and local restricted-account enforcement independent of client edits', () => {
    expect(read('convex/eligibility.ts')).toContain('if (!adultOnDay(args.birthDate, today)) throw new Error');
    expect(read('convex/eligibility.ts')).toContain("'ageRejections'");
    expect(read('src/app/onboarding.tsx')).toContain('acceptEligibility({ birthDate: valid.birth_date');
  });
});
