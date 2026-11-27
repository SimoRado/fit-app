import type { Language } from './types';

/** Welcome-screen mode. It only chooses which existing Clerk screen the buttons lead to. */
export type AuthMode = 'signup' | 'login';

export const parseAuthMode = (value: unknown): AuthMode => (value === 'login' ? 'login' : 'signup');
export const authModeRoute = (mode: AuthMode) => (mode === 'login' ? '/(auth)/sign-in' : '/(auth)/sign-up') as '/(auth)/sign-in' | '/(auth)/sign-up';
export const emailActionLabel = (mode: AuthMode) => (mode === 'login' ? 'Log in with email' : 'Sign up with email');
export const authModeMessage = (mode: AuthMode) => (mode === 'login' ? 'Welcome back. Log in the way you signed up.' : 'Create your free account in about a minute.');

export const languageOptions: readonly { code: Language; short: string; label: string }[] = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'fr', short: 'FR', label: 'Français' },
  { code: 'ar', short: 'AR', label: 'العربية' },
];
export const languageShortCode = (language: Language) => languageOptions.find(option => option.code === language)?.short ?? 'EN';

/** Onboarding steps (0-based) that the review page's Edit controls jump back to. */
export const reviewEditStep = { about: 0, body: 1, goals: 2 } as const;
/** Final onboarding action: needs the legal acknowledgment and is blocked while saving. */
export const canBeginProfile = (legalAccepted: boolean, busy: boolean) => legalAccepted && !busy;

export type BirthEligibility = 'incomplete' | 'invalid' | 'underage' | 'adult';
export const MINIMUM_AGE = 18;
/**
 * Client-side age gate for the first onboarding step (UX only; the Convex `eligibility.accept`
 * mutation still enforces 18+). `today` is the device's local calendar day (`YYYY-MM-DD`).
 * Calendar comparison, so leap-day births and "turns 18 today/tomorrow" are exact.
 */
export function birthEligibility(birth: string, today: string, age: (birth: string, today: string) => number | null): BirthEligibility {
  const [year = '', month = '', day = ''] = birth.split('-');
  if (!year || !month || !day || year.length < 4) return 'incomplete';
  const years = age(birth, today);
  if (years === null) return 'invalid';
  return years >= MINIMUM_AGE ? 'adult' : 'underage';
}
