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
import { AuthError, clerkMessage } from './auth';
import { colors } from './theme';
import { googleOAuthMessage, googleOAuthOutcome } from '../core/oauthErrors';
import { authDiagnostic, runtimeSignals } from '../core/runtime';
import { canStartGoogleOAuth } from '../core/runtimeClassification';
import { googleRedirect } from '../core/googleRedirect';
import { activateGoogleSession } from '../core/googleSession';

WebBrowser.maybeCompleteAuthSession();

export function SocialAuth() {
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const runtime = runtimeSignals();
  const nativeBuild = runtime.kind === 'native-build';
  useEffect(() => {
    authDiagnostic('runtime', {
      kind: runtime.kind,
      appOwnership: runtime.appOwnership,
      expoGoModule: runtime.expoGoModule,
      purchasesModule: runtime.purchasesModule,
    });
  }, [runtime.kind, runtime.appOwnership, runtime.expoGoModule, runtime.purchasesModule]);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !nativeBuild) return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, [nativeBuild]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync().catch(() => undefined);
    return () => { void WebBrowser.coolDownAsync().catch(() => undefined); };
  }, []);

  async function start(provider: 'google' | 'apple') {
    if (provider === 'google') authDiagnostic('button press', { runtime: runtime.kind, busy: inFlight.current });
    if (inFlight.current) return;
    inFlight.current = true; setBusy(provider); setError('');
    let stage: 'initiation' | 'browser' | 'activation' = 'initiation';
    try {
      const redirect = provider === 'google' ? googleRedirect(Constants.expoConfig?.scheme, AuthSession.makeRedirectUri) : null;
      if (redirect) authDiagnostic('initiation', { runtime: runtime.kind, redirectScheme: Constants.expoConfig?.scheme as string, callbackPath: 'oauth-callback', generatedMatches: redirect.generatedMatches });
      let result;
      if (provider === 'google') {
        stage = 'browser';
        const googleResult = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: redirect!.url });
        const browserResult = googleResult.authSessionResult?.type ?? null;
        const outcome = googleOAuthOutcome(browserResult, Boolean(googleResult.createdSessionId));
        authDiagnostic('browser completion', { browserResult, outcome, createdSession: Boolean(googleResult.createdSessionId), hasActivation: Boolean(googleResult.setActive), signInStatus: googleResult.signIn?.status ?? null, signUpStatus: googleResult.signUp?.status ?? null });
        if (outcome === 'cancelled') return;
        if (outcome === 'browser-closed') { setError('The Google browser closed before sign-in finished. Please try again.'); return; }
        result = googleResult;
      } else result = await startAppleAuthenticationFlow();
      if (result.createdSessionId && result.setActive) {
        if (provider === 'google') authDiagnostic('session activation started');
        stage = 'activation';
        if (provider === 'google') await activateGoogleSession(result);
        else await result.setActive({ session: result.createdSessionId });
        if (provider === 'google') authDiagnostic('session activation completed');
        if (provider === 'google') authDiagnostic('navigation handed to protected router');
        else router.replace('/');
      } else if (result.signIn?.status === 'needs_second_factor' || result.signIn?.status === 'needs_client_trust' || result.signUp?.status === 'missing_requirements') {
        setError('Additional account verification is required. Please use email sign-in or contact support.');
      } else if (provider === 'google') {
        setError('Google sign-in needs another account step. Please try email sign-in or contact support.');
      }
    } catch (cause) {
      if (provider === 'google') {
        const message = googleOAuthMessage(cause);
        authDiagnostic('error', { stage, category: message === null ? 'cancelled' : message.includes('Connection') ? 'network' : message.includes('redirect') ? 'redirect' : 'other' });
        if (message) setError(stage === 'activation' ? 'Google connected, but Fitapp could not activate the session. Please try again.' : message);
      }
      else {
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        if (code !== 'ERR_REQUEST_CANCELED') setError(clerkMessage(cause));
      }
    } finally { inFlight.current = false; setBusy(null); }
  }
  const button = (provider: 'google' | 'apple', enabled: boolean) => <Pressable key={provider} accessibilityRole="button" accessibilityLabel={`Continue with ${provider === 'google' ? 'Google' : 'Apple'}`} accessibilityState={{ disabled: busy !== null || !enabled }} disabled={busy !== null || !enabled} onPress={() => void start(provider)} style={{ minHeight: 56, borderWidth: provider === 'google' ? 1.5 : 0, borderColor: colors.borderStrong, borderRadius: 999, backgroundColor: provider === 'apple' ? colors.ink : colors.card, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : .5 }}>
    <Ionicons name={provider === 'google' ? 'logo-google' : 'logo-apple'} size={22} color={provider === 'google' ? '#4285F4' : '#fff'}/><Text style={{ color: provider === 'google' ? '#202124' : '#fff', fontSize: 16, fontWeight: '600' }}>{busy === provider ? 'Connecting…' : `Continue with ${provider === 'google' ? 'Google' : 'Apple'}`}</Text>
  </Pressable>;
  return <View style={{ gap: 10 }}>
    {(Platform.OS === 'android' || Platform.OS === 'ios') && button('google', canStartGoogleOAuth(runtime.kind, busy !== null))}
    {Platform.OS === 'ios' && appleAvailable && <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={28} style={{ height: 56, width: '100%' }} onPress={() => void start('apple')}/>}
    {!nativeBuild && <Text style={{ color: colors.muted, fontSize: 12 }}>Google sign-in needs the Fitapp development build. Email sign-in works in Expo Go.</Text>}
    <AuthError message={error}/>
  </View>;
}
