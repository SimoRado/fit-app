import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appleAuthMode, appleAuthUnavailableMessage, appleAvailabilityReason, appleButtonPresentation } from '../src/core/appleAuth';
import { appleOAuthMessage, oauthOutcome } from '../src/core/oauthErrors';
import { activateClerkSession, clerkGateState } from '../src/core/googleSession';
import { localDatabaseName } from '../src/data/account';
import { profileDestination } from '../src/core/profileDestination';
import { googleRedirect } from '../src/core/googleRedirect';

describe('Clerk Apple authentication readiness', () => {
  it('shows Apple on iOS, but disables it until native authentication is ready', () => {
    expect(appleButtonPresentation('ios', null)).toBe('unavailable');
    expect(appleButtonPresentation('ios', 'native')).toBe('native');
    expect(appleButtonPresentation('android', null)).toBeNull();
    expect(appleButtonPresentation('android', 'browser')).toBe('browser');
    expect(appleButtonPresentation('android', null, true)).toBe('unavailable');
    expect(appleButtonPresentation('web', null)).toBeNull();
    const socialAuth = readFileSync(join(process.cwd(), 'src/ui/SocialAuth.tsx'), 'utf8');
    expect(socialAuth).toContain("applePresentation === 'native' && <AppleAuthentication.AppleAuthenticationButton");
    expect(socialAuth).toContain("applePresentation === 'unavailable' && <SocialButton provider=\"apple\" enabled={false}");
    for (const screen of ['sign-in.tsx', 'sign-up.tsx']) {
      expect(readFileSync(join(process.cwd(), 'src/app/(auth)', screen), 'utf8')).toContain('<SocialAuth/>');
    }
  });
  it('uses native Apple auth only on configured iOS development builds', () => {
    const options = { platform: 'ios', runtime: 'native-build' as const, nativeEnabled: true, browserEnabled: false, systemAvailable: true };
    expect(appleAuthMode(options)).toBe('native');
    expect(appleAuthMode({ ...options, runtime: 'expo-go' })).toBeNull();
    expect(appleAuthMode({ ...options, nativeEnabled: false })).toBeNull();
    expect(appleAuthMode({ ...options, systemAvailable: false })).toBeNull();
  });

  it('uses Clerk browser OAuth only on configured Android development builds', () => {
    const options = { platform: 'android', runtime: 'native-build' as const, nativeEnabled: false, browserEnabled: true, systemAvailable: false };
    expect(appleAuthMode(options)).toBe('browser');
    expect(appleAuthMode({ ...options, browserEnabled: false })).toBeNull();
    expect(appleAuthMode({ ...options, runtime: 'expo-go' })).toBeNull();
    expect(appleAuthMode({ ...options, platform: 'web' })).toBeNull();
    expect(appleAuthUnavailableMessage({ ...options, availabilityChecked: true })).toBeNull();
    const expoGo = { ...options, runtime: 'expo-go' as const };
    expect(appleButtonPresentation('android', appleAuthMode(expoGo), true)).toBe('unavailable');
    expect(appleAuthUnavailableMessage({ ...expoGo, availabilityChecked: true })).toMatch(/development build/);
    expect(appleAvailabilityReason({ ...expoGo, availabilityChecked: true })).toBe('expo-go-cannot-handle-custom-oauth-scheme');
    expect(appleAvailabilityReason({ ...options, availabilityChecked: true })).toBe('android-browser-ready');
    expect(appleAvailabilityReason({ ...options, browserEnabled: false, availabilityChecked: true })).toBe('android-flag-disabled');
  });

  it('reads the Expo public flag statically and reports only safe Apple availability fields', () => {
    const socialAuth = readFileSync(join(process.cwd(), 'src/ui/SocialAuth.tsx'), 'utf8');
    expect(socialAuth).toContain("process.env.EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED === 'true'");
    expect(socialAuth).toContain("authDiagnostic('availability', { platform: Platform.OS, runtime: runtime.kind, androidFlag: appleBrowserConfigured, iosFlag: appleNativeConfigured, button: applePresentation ?? 'hidden', reason: appleReason }, 'APPLE')");
  });

  it('uses the installed SSO strategy and registered callback without changing Google', () => {
    const socialAuth = readFileSync(join(process.cwd(), 'src/ui/SocialAuth.tsx'), 'utf8');
    expect(socialAuth).toContain("provider === 'google' ? 'oauth_google' : 'oauth_apple'");
    expect(socialAuth).toContain('startSSOFlow({ strategy:');
    expect(socialAuth).toContain('redirectUrl: redirect!.url');
    expect(googleRedirect('betterday', options => options.native).url).toBe('betterday://oauth-callback');
    for (const screen of ['sign-in.tsx', 'sign-up.tsx']) {
      expect(readFileSync(join(process.cwd(), 'src/app/(auth)', screen), 'utf8')).toContain('OR USE EMAIL');
    }
  });

  it('explains unavailable setup and hides transient iOS availability checks', () => {
    expect(appleAuthUnavailableMessage({ platform: 'ios', runtime: 'native-build', nativeEnabled: true, browserEnabled: false, systemAvailable: false, availabilityChecked: false })).toBeNull();
    expect(appleAuthUnavailableMessage({ platform: 'ios', runtime: 'native-build', nativeEnabled: false, browserEnabled: false, systemAvailable: false, availabilityChecked: true })).toMatch(/not configured/);
    expect(appleAuthUnavailableMessage({ platform: 'android', runtime: 'native-build', nativeEnabled: false, browserEnabled: false, systemAvailable: false, availabilityChecked: true })).toMatch(/not configured/);
    expect(appleAuthUnavailableMessage({ platform: 'android', runtime: 'expo-go', nativeEnabled: false, browserEnabled: false, systemAvailable: false, availabilityChecked: true })).toMatch(/development build/);
  });

  it('handles browser cancellation and incomplete returns without exposing error details', () => {
    expect(oauthOutcome('cancel', false)).toBe('cancelled');
    expect(oauthOutcome('dismiss', false)).toBe('cancelled');
    expect(oauthOutcome('success', false)).toBe('incomplete');
    expect(oauthOutcome('success', true)).toBe('session-created');
    expect(appleOAuthMessage({ code: 'ERR_REQUEST_CANCELED' })).toBeNull();
    expect(appleOAuthMessage(new Error('network unavailable: private-token-value'))).toMatch(/Connection unavailable/);
    expect(appleOAuthMessage(new Error('private-token-value'))).not.toContain('private-token-value');
  });
});

describe('Clerk identity follows the existing Fitapp account flow', () => {
  it('activates only the Clerk-created session and waits for Clerk before protected routing', async () => {
    const setActive = vi.fn(async () => undefined);
    expect(await activateClerkSession({ createdSessionId: 'clerk-session', setActive })).toBe(true);
    expect(setActive).toHaveBeenCalledExactlyOnceWith({ session: 'clerk-session' });
    expect(clerkGateState(false, true, 'user_a')).toBe('loading');
    expect(clerkGateState(true, true, 'user_a')).toBe('signed-in');
  });

  it('sends a new Clerk account through onboarding and a returning profile to the dashboard', () => {
    expect(profileDestination(false)).toBe('/onboarding');
    expect(profileDestination(true)).toBe('/(tabs)');
  });

  it('reuses local data by Clerk user ID and isolates different Clerk users regardless of email', () => {
    expect(localDatabaseName('user_Apple123')).toBe(localDatabaseName('user_Apple123'));
    expect(localDatabaseName('user_Apple123')).not.toBe(localDatabaseName('user_Google456'));
    expect(() => localDatabaseName('same@example.com')).toThrow(/Invalid account identifier/);
  });
});
