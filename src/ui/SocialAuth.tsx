import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSSO } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Text } from './LocalizedText';
import { AuthError } from './auth';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts } from './theme';
import { useVoltTheme } from './VoltThemeProvider';
import { appleOAuthMessage, googleOAuthMessage, googleOAuthOutcome, oauthOutcome } from '../core/oauthErrors';
import { authDiagnostic, runtimeSignals } from '../core/runtime';
import { canStartGoogleOAuth, isNativeRuntime } from '../core/runtimeClassification';
import { googleRedirect } from '../core/googleRedirect';
import { oauthScheme } from '../core/appVariant';
import { activateClerkSession } from '../core/googleSession';
import { SignupLegalChoice } from './LegalAgreements';
import { appleAuthMode, appleAuthUnavailableMessage, appleAvailabilityReason, appleButtonPresentation } from '../core/appleAuth';

WebBrowser.maybeCompleteAuthSession();

function SocialButton({ provider, enabled, busy, onPress }: { provider: 'google' | 'apple'; enabled: boolean; busy: boolean; onPress: () => void }) {
  const label = `Continue with ${provider === 'google' ? 'Google' : 'Apple'}`;
  // Brand-recognisable buttons in every theme: white Google pill, black Apple pill.
  const googleInk = '#1F2937';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy || !enabled }} disabled={busy || !enabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 54, borderWidth: provider === 'google' ? 1.5 : 1, borderColor: provider === 'google' ? colors.borderStrong : colors.light ? '#000000' : colors.borderStrong, borderRadius: 999, backgroundColor: provider === 'apple' ? '#000000' : '#FFFFFF', flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : .5, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
    {provider === 'google' ? <GoogleLogo/> : <Ionicons name="logo-apple" size={21} color="#FFFFFF"/>}<Text style={{ color: provider === 'google' ? googleInk : '#FFFFFF', fontSize: 15.5, fontFamily: fonts.bold }}>{busy ? 'Connecting…' : label}</Text>
  </Pressable>;
}

function GoogleLogo() {
  return <Svg width={20} height={20} viewBox="0 0 48 48" accessible={false}>
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </Svg>;
}

export function SocialAuth({ legalAccepted: externalLegal, onLegalChange, showLegal = true }: { legalAccepted?: boolean; onLegalChange?: (checked: boolean) => void; showLegal?: boolean } = {}) {
  useVoltTheme();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleAvailabilityChecked, setAppleAvailabilityChecked] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const [internalLegal, setInternalLegal] = useState(false);
  const legalAccepted = externalLegal ?? internalLegal;
  const setLegalAccepted = onLegalChange ?? setInternalLegal;
  const inFlight = useRef(false);
  const runtime = runtimeSignals();
  const nativeBuild = isNativeRuntime(runtime.kind);
  const clerkConfigured = /^pk_(test|live)_/.test(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '');
  const appleNativeConfigured = clerkConfigured && process.env.EXPO_PUBLIC_CLERK_APPLE_IOS_NATIVE_ENABLED === 'true';
  const appleBrowserConfigured = clerkConfigured && process.env.EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED === 'true';
  const appleMode = appleAuthMode({ platform: Platform.OS, runtime: runtime.kind, nativeEnabled: appleNativeConfigured, browserEnabled: appleBrowserConfigured, systemAvailable: appleAvailable });
  const applePresentation = appleButtonPresentation(Platform.OS, appleMode, appleBrowserConfigured);
  const appleUnavailableMessage = appleAuthUnavailableMessage({ platform: Platform.OS, runtime: runtime.kind, nativeEnabled: appleNativeConfigured, browserEnabled: appleBrowserConfigured, systemAvailable: appleAvailable, availabilityChecked: appleAvailabilityChecked });
  const appleReason = appleAvailabilityReason({ platform: Platform.OS, runtime: runtime.kind, nativeEnabled: appleNativeConfigured, browserEnabled: appleBrowserConfigured, systemAvailable: appleAvailable, availabilityChecked: appleAvailabilityChecked });
  useEffect(() => {
    authDiagnostic('runtime', {
      kind: runtime.kind,
      executionEnvironment: runtime.executionEnvironment,
      appOwnership: runtime.appOwnership,
      hasExpoGoConfig: runtime.hasExpoGoConfig,
      isRunningInExpoGo: runtime.isRunningInExpoGo,
      expoVersionPresent: Boolean(runtime.expoVersion),
      debugMode: runtime.debugMode,
      appIdMatches: runtime.appIdMatches,
      expoGoModule: runtime.expoGoModule,
      legacyPurchasesBridgeModule: runtime.legacyPurchasesBridgeModule,
    });
  }, [runtime.kind, runtime.executionEnvironment, runtime.appOwnership, runtime.hasExpoGoConfig, runtime.isRunningInExpoGo, runtime.expoVersion, runtime.debugMode, runtime.appIdMatches, runtime.expoGoModule, runtime.legacyPurchasesBridgeModule]);
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
    if (!legalAccepted) { setError('Agree to the Terms of Use before continuing.'); return; }
    inFlight.current = true; setBusy(provider); setError('');
    let stage: 'initiation' | 'browser' | 'activation' = 'initiation';
    try {
      if (!clerkConfigured) {
        setError('Social sign-in is not configured in this build. Please use email sign-in.');
        return;
      }
      if (provider === 'apple' && !appleMode) return;
      const usesBrowser = provider === 'google' || appleMode === 'browser';
      // The installed binary decides the callback scheme (preview: betterday, dev client: betterday-dev).
      const scheme = oauthScheme(runtime.nativeApplicationId, Constants.expoConfig?.scheme);
      const redirect = usesBrowser ? googleRedirect(scheme, AuthSession.makeRedirectUri) : null;
      if (redirect) authDiagnostic('initiation', { runtime: runtime.kind, redirectScheme: typeof scheme === 'string' ? scheme : null, callbackPath: 'oauth-callback', generatedMatches: redirect.generatedMatches }, logCategory);
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
        // The root Clerk gate switches from the auth stack to the protected
        // stack after activation. An immediate replace can race that switch.
        authDiagnostic('navigation handed to protected router', {}, logCategory);
      } else if (result.signIn?.status === 'needs_second_factor' || result.signIn?.status === 'needs_client_trust' || result.signUp?.status === 'missing_requirements') {
        setError(`${provider === 'google' ? 'Google' : 'Apple'} sign-in needs another account step. Please try email sign-in or contact support.`);
      } else if (provider === 'google' || appleMode === 'browser') {
        setError(`${provider === 'google' ? 'Google' : 'Apple'} sign-in did not finish. Check the Clerk connection and try again.`);
      }
    } catch (cause) {
      if (provider === 'google') {
        const message = googleOAuthMessage(cause);
        authDiagnostic('error', { stage, category: message === null ? 'cancelled' : message.includes('Connection') ? 'network' : message.includes('redirect') ? 'redirect' : 'other' }, logCategory);
        if (message) setError(stage === 'activation' ? 'Google connected, but Cubyfit could not activate the session. Please try again.' : message);
      }
      else {
        const message = appleOAuthMessage(cause);
        authDiagnostic('error', { stage, category: message === null ? 'cancelled' : message.includes('Connection') ? 'network' : message.includes('return') ? 'redirect' : 'other' }, logCategory);
        if (message) setError(stage === 'activation' ? 'Apple connected, but Cubyfit could not activate the session. Please try again.' : message);
      }
    } finally { inFlight.current = false; setBusy(null); }
  }
  return <View style={{ gap: 10 }}>
    {showLegal && <SignupLegalChoice checked={legalAccepted} onChange={setLegalAccepted}/>}
    {(Platform.OS === 'android' || Platform.OS === 'ios') && <SocialButton provider="google" enabled={legalAccepted && canStartGoogleOAuth(runtime.kind, busy !== null, clerkConfigured)} busy={busy === 'google'} onPress={() => void start('google')}/>}
    {applePresentation === 'browser' && <SocialButton provider="apple" enabled={legalAccepted && busy === null} busy={busy === 'apple'} onPress={() => void start('apple')}/>}
    {applePresentation === 'native' && <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={28} style={{ height: 56, width: '100%', opacity: legalAccepted ? 1 : .5 }} onPress={() => void start('apple')}/>}
    {applePresentation === 'unavailable' && <SocialButton provider="apple" enabled={false} busy={false} onPress={() => void start('apple')}/>}
    {appleUnavailableMessage && <Text style={{ color: colors.muted, fontSize: 12 }}>{appleUnavailableMessage}</Text>}
    {!clerkConfigured && <Text style={{ color: colors.muted, fontSize: 12 }}>Social sign-in is not configured in this build. Email sign-in remains available.</Text>}
    {!nativeBuild && <Text style={{ color: colors.muted, fontSize: 12 }}>Social sign-in requires a Cubyfit development or standalone build. Email sign-in works in Expo Go.</Text>}
    <AuthError message={error}/>
  </View>;
}
