import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSSO } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { Text } from './LocalizedText';
import { AuthError } from './auth';
import { colors } from './theme';
import { appleOAuthMessage, googleOAuthMessage, googleOAuthOutcome, oauthOutcome } from '../core/oauthErrors';
import { authDiagnostic, runtimeSignals } from '../core/runtime';
import { canStartGoogleOAuth } from '../core/runtimeClassification';
import { googleRedirect } from '../core/googleRedirect';
import { activateClerkSession } from '../core/googleSession';
import { appleAuthMode, appleAuthUnavailableMessage, appleAvailabilityReason, appleButtonPresentation } from '../core/appleAuth';

WebBrowser.maybeCompleteAuthSession();

function SocialButton({ provider, enabled, busy, onPress }: { provider: 'google' | 'apple'; enabled: boolean; busy: boolean; onPress: () => void }) {
  const label = `Continue with ${provider === 'google' ? 'Google' : 'Apple'}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy || !enabled }} disabled={busy || !enabled} onPress={onPress} style={{ minHeight: 56, borderWidth: provider === 'google' ? 1.5 : 0, borderColor: colors.borderStrong, borderRadius: 999, backgroundColor: provider === 'apple' ? colors.ink : colors.card, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : .5 }}>
    <Ionicons name={provider === 'google' ? 'logo-google' : 'logo-apple'} size={22} color={provider === 'google' ? '#4285F4' : '#fff'}/><Text style={{ color: provider === 'google' ? '#202124' : '#fff', fontSize: 16, fontWeight: '600' }}>{busy ? 'Connecting…' : label}</Text>
  </Pressable>;
}

export function SocialAuth() {
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleAvailabilityChecked, setAppleAvailabilityChecked] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const runtime = runtimeSignals();
  const nativeBuild = runtime.kind === 'native-build';
  const appleNativeConfigured = process.env.EXPO_PUBLIC_CLERK_APPLE_IOS_NATIVE_ENABLED === 'true';
  const appleBrowserConfigured = process.env.EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED === 'true';
  const appleMode = appleAuthMode({ platform: Platform.OS, runtime: runtime.kind, nativeEnabled: appleNativeConfigured, browserEnabled: appleBrowserConfigured, systemAvailable: appleAvailable });
  const applePresentation = appleButtonPresentation(Platform.OS, appleMode, appleBrowserConfigured);
  const appleUnavailableMessage = appleAuthUnavailableMessage({ platform: Platform.OS, runtime: runtime.kind, nativeEnabled: appleNativeConfigured, browserEnabled: appleBrowserConfigured, systemAvailable: appleAvailable, availabilityChecked: appleAvailabilityChecked });
  const appleReason = appleAvailabilityReason({ platform: Platform.OS, runtime: runtime.kind, nativeEnabled: appleNativeConfigured, browserEnabled: appleBrowserConfigured, systemAvailable: appleAvailable, availabilityChecked: appleAvailabilityChecked });
  useEffect(() => {
    authDiagnostic('runtime', {
      kind: runtime.kind,
      appOwnership: runtime.appOwnership,
      expoGoModule: runtime.expoGoModule,
      purchasesModule: runtime.purchasesModule,
    });
  }, [runtime.kind, runtime.appOwnership, runtime.expoGoModule, runtime.purchasesModule]);
  useEffect(() => {
    authDiagnostic('availability', { platform: Platform.OS, runtime: runtime.kind, androidFlag: appleBrowserConfigured, iosFlag: appleNativeConfigured, button: applePresentation ?? 'hidden', reason: appleReason }, 'APPLE');
  }, [runtime.kind, appleBrowserConfigured, appleNativeConfigured, applePresentation, appleReason]);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !nativeBuild || !appleNativeConfigured) { setAppleAvailabilityChecked(true); return; }
    let active = true;
    AppleAuthentication.isAvailableAsync().then(available => { if (active) { setAppleAvailable(available); setAppleAvailabilityChecked(true); } }).catch(() => { if (active) { setAppleAvailable(false); setAppleAvailabilityChecked(true); } });
    return () => { active = false; };
  }, [nativeBuild, appleNativeConfigured]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync().catch(() => undefined);
    return () => { void WebBrowser.coolDownAsync().catch(() => undefined); };
  }, []);

  async function start(provider: 'google' | 'apple') {
    const logCategory = provider === 'google' ? 'GOOGLE' : 'APPLE';
    if (provider === 'google') authDiagnostic('button press', { runtime: runtime.kind, busy: inFlight.current }, logCategory);
    if (inFlight.current) return;
    inFlight.current = true; setBusy(provider); setError('');
    let stage: 'initiation' | 'browser' | 'activation' = 'initiation';
    try {
      if (provider === 'apple' && !appleMode) return;
      const usesBrowser = provider === 'google' || appleMode === 'browser';
      const redirect = usesBrowser ? googleRedirect(Constants.expoConfig?.scheme, AuthSession.makeRedirectUri) : null;
      if (redirect) authDiagnostic('initiation', { runtime: runtime.kind, redirectScheme: Constants.expoConfig?.scheme as string, callbackPath: 'oauth-callback', generatedMatches: redirect.generatedMatches }, logCategory);
      let result;
      if (usesBrowser) {
        stage = 'browser';
        const oauthResult = await startSSOFlow({ strategy: provider === 'google' ? 'oauth_google' : 'oauth_apple', redirectUrl: redirect!.url });
        const browserResult = oauthResult.authSessionResult?.type ?? null;
        const outcome = provider === 'google' ? googleOAuthOutcome(browserResult, Boolean(oauthResult.createdSessionId)) : oauthOutcome(browserResult, Boolean(oauthResult.createdSessionId));
        authDiagnostic('browser completion', { browserResult, outcome, createdSession: Boolean(oauthResult.createdSessionId), hasActivation: Boolean(oauthResult.setActive), signInStatus: oauthResult.signIn?.status ?? null, signUpStatus: oauthResult.signUp?.status ?? null }, logCategory);
        if (outcome === 'cancelled') return;
        if (outcome === 'browser-closed') { setError(`The ${provider === 'google' ? 'Google' : 'Apple'} browser closed before sign-in finished. Please try again.`); return; }
        result = oauthResult;
      } else result = await startAppleAuthenticationFlow();
      if (result.createdSessionId && result.setActive) {
        stage = 'activation';
        authDiagnostic('session activation started', {}, logCategory);
        await activateClerkSession(result);
        authDiagnostic('session activation completed', {}, logCategory);
        authDiagnostic('navigation handed to protected router', {}, logCategory);
        router.replace('/');
      } else if (result.signIn?.status === 'needs_second_factor' || result.signIn?.status === 'needs_client_trust' || result.signUp?.status === 'missing_requirements') {
        setError(`${provider === 'google' ? 'Google' : 'Apple'} sign-in needs another account step. Please try email sign-in or contact support.`);
      } else if (provider === 'google' || appleMode === 'browser') {
        setError(`${provider === 'google' ? 'Google' : 'Apple'} sign-in did not finish. Check the Clerk connection and try again.`);
      }
    } catch (cause) {
      if (provider === 'google') {
        const message = googleOAuthMessage(cause);
        authDiagnostic('error', { stage, category: message === null ? 'cancelled' : message.includes('Connection') ? 'network' : message.includes('redirect') ? 'redirect' : 'other' }, logCategory);
        if (message) setError(stage === 'activation' ? 'Google connected, but Fitapp could not activate the session. Please try again.' : message);
      }
      else {
        const message = appleOAuthMessage(cause);
        authDiagnostic('error', { stage, category: message === null ? 'cancelled' : message.includes('Connection') ? 'network' : message.includes('return') ? 'redirect' : 'other' }, logCategory);
        if (message) setError(stage === 'activation' ? 'Apple connected, but Fitapp could not activate the session. Please try again.' : message);
      }
    } finally { inFlight.current = false; setBusy(null); }
  }
  return <View style={{ gap: 10 }}>
    {(Platform.OS === 'android' || Platform.OS === 'ios') && <SocialButton provider="google" enabled={canStartGoogleOAuth(runtime.kind, busy !== null)} busy={busy === 'google'} onPress={() => void start('google')}/>}
    {applePresentation === 'browser' && <SocialButton provider="apple" enabled={busy === null} busy={busy === 'apple'} onPress={() => void start('apple')}/>}
    {applePresentation === 'native' && <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={28} style={{ height: 56, width: '100%' }} onPress={() => void start('apple')}/>}
    {applePresentation === 'unavailable' && <SocialButton provider="apple" enabled={false} busy={false} onPress={() => void start('apple')}/>}
    {appleUnavailableMessage && <Text style={{ color: colors.muted, fontSize: 12 }}>{appleUnavailableMessage}</Text>}
    {!nativeBuild && <Text style={{ color: colors.muted, fontSize: 12 }}>Google sign-in needs the Fitapp development build. Email sign-in works in Expo Go.</Text>}
    <AuthError message={error}/>
  </View>;
}
