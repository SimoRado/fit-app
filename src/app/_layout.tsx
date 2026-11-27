import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexHttpClient } from 'convex/browser';
import { ConvexReactClient, useConvexAuth, useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/app';
import { removeLocalAccountData, setLocalAccount } from '../data/db';
import { setActiveLanguage } from '../core/i18n';
import { AppFonts } from '../ui/fonts';
import { MotionProvider } from '../ui/motion';
import { SubscriptionProvider } from '../state/subscriptions';
import { AdEligibilityBridge } from '../state/AdEligibilityBridge';
import { SyncProvider } from '../state/sync';
import { clearAccountReminders } from '../services/reminders';
import { useVoltTheme, VoltThemeProvider } from '../ui/VoltThemeProvider';
import { authDiagnostic } from '../core/runtime';
import { clerkGateState } from '../core/googleSession';
import { api } from '../../convex/_generated/api';
import { pendingDeletions, forgetDeletion, rememberDeletion } from '../data/pendingDeletion';
import { accountDeletionView, blockAccountForDeletion, unblockAccountAfterRejectedDeletion, useAccountDeletionBlocked } from '../data/deletionLifecycle';
import { DeletionProgress } from '../ui/DeletionProgress';
import { clearMonitoringUser, reportFailure } from '../core/monitoring';
import { accessDestination } from '../core/accessGate';
import { allowsClerkPublishableKey, usesExpectedConvexDeployment, validateCubyfitAuthConfiguration } from '../core/productionConfig';
import { dayKey } from '../core/date';
import { TERMS_VERSION } from '../../shared/legalVersions';

function RenderError({ retry }: { error: Error; retry: () => Promise<void> }) {
  const { palette } = useVoltTheme();
  return <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ color: palette.text, fontSize: 28, fontWeight: '700' }}>Something went wrong</Text>
    <Text style={{ color: palette.muted }}>Your data is still on this device. Please try this screen again.</Text>
    <Pressable accessibilityRole="button" onPress={() => { void retry(); }} style={{ alignSelf: 'flex-start', backgroundColor: palette.accent, padding: 16, borderRadius: 18 }}>
      <Text style={{ color: palette.accentText, fontWeight: '700' }}>Try again</Text>
    </Pressable>
  </View>;
}
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(RenderError);

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!convexUrl || !publishableKey) throw new Error('Missing Clerk or Convex configuration');
// Do this before Clerk can restore a cached session or Convex can make a
// protected request. A development Convex deployment with a production Clerk
// key (or the reverse) must never look like a recoverable auth failure.
validateCubyfitAuthConfiguration(convexUrl, publishableKey);
// Internal development/preview binaries may intentionally use Clerk's test
// instance. A distributable production binary must fail closed instead of
// silently authenticating against that instance.
const internalBuild = Constants.expoConfig?.extra?.admob?.internalBuild === true;
const productionBuild = Constants.expoConfig?.extra?.admob?.productionBuild === true;
if (!allowsClerkPublishableKey(publishableKey, __DEV__, internalBuild)) {
  throw new Error('Production builds require a live Clerk publishable key');
}
if (productionBuild && !usesExpectedConvexDeployment(convexUrl, 'production')) {
  throw new Error('Production builds must use the existing Cubyfit production Convex deployment');
}
if (internalBuild && !usesExpectedConvexDeployment(convexUrl, 'development')) {
  throw new Error('Cubyfit internal builds must use the development Convex deployment');
}
const convex = new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });
// The Clerk identity is deleted before the device can observe completion.
// This client sends no Clerk token and calls only the minimal completion query.
const deletionCompletionClient = new ConvexHttpClient(convexUrl);

function Loading() { const { palette } = useVoltTheme(); return <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: 'center' }}><ActivityIndicator color={palette.accent}/></View>; }

function LocalAccount({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { palette } = useVoltTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLocalAccount(userId); setReady(false); setError(false);
    authDiagnostic('local account preparation started', {}, 'NAVIGATION');
    void clearAccountReminders().then(() => { if (active) { authDiagnostic('local account preparation complete', {}, 'NAVIGATION'); setReady(true); } }).catch(cause => { if (active) { reportFailure('account-reminders', cause); authDiagnostic('local account preparation failed', {}, 'NAVIGATION'); setError(true); } });
    return () => { active = false; setLocalAccount(null); };
  }, [userId, retry]);
  if (error) return <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 24 }}><Text style={{ color: palette.text, textAlign: 'center' }}>Could not clear reminders from the previous account.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={{ color: palette.accent }}>Retry</Text></Pressable></View>;
  return ready ? <AppProvider key={userId}><SyncProvider><AdEligibilityBridge>{children}</AdEligibilityBridge></SyncProvider></AppProvider> : <Loading/>;
}

function AuthenticatedStack({ signedIn }: { signedIn: boolean }) {
  const { palette } = useVoltTheme();
  const { ready, profile, legalAccepted, ageRejected } = useApp();
  const { isAuthenticated } = useConvexAuth();
  const remoteEligibility = useQuery(api.eligibility.current, isAuthenticated ? {} : 'skip');
  if (!ready) return <Loading/>;
  if (!isAuthenticated || remoteEligibility === undefined) return <Loading/>;
  const destination = accessDestination({ birthDate: profile?.birth_date, hasProfile: Boolean(profile), ageRejected, legalAccepted, serverRecorded: remoteEligibility.acceptedAt !== null, serverAdult: remoteEligibility.adult, serverTermsAccepted: remoteEligibility.termsVersion === TERMS_VERSION, serverRejected: remoteEligibility.rejected, today: dayKey() });
  const hold = destination === '/age-hold';
  const needsAgreement = destination === '/legal-agreements';
  const appAllowed = destination === '/(tabs)';
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
    <Stack.Protected guard={false}><Stack.Screen name="(auth)"/></Stack.Protected>
    <Stack.Protected guard={signedIn}><Stack.Screen name="index"/><Stack.Screen name="cloud-sync"/><Stack.Screen name="delete-account"/></Stack.Protected>
    <Stack.Protected guard={destination === '/onboarding'} redirectTo={destination}><Stack.Screen name="onboarding"/></Stack.Protected>
    <Stack.Protected guard={hold} redirectTo={destination}><Stack.Screen name="age-hold"/></Stack.Protected>
    <Stack.Protected guard={needsAgreement} redirectTo={destination}><Stack.Screen name="legal-agreements"/></Stack.Protected>
    <Stack.Protected guard={appAllowed} redirectTo={destination}>
      <Stack.Screen name="(tabs)"/>
      <Stack.Screen name="habit-form"/><Stack.Screen name="habit-history"/><Stack.Screen name="workout-form"/>
      <Stack.Screen name="routine-form"/><Stack.Screen name="weight"/><Stack.Screen name="weight-form"/>
      <Stack.Screen name="measurement-form"/><Stack.Screen name="mission-form"/><Stack.Screen name="missions"/>
      <Stack.Screen name="motivation"/><Stack.Screen name="reminders"/><Stack.Screen name="account"/><Stack.Screen name="premium-test"/><Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}/><Stack.Screen name="admob-testing"/>
    </Stack.Protected>
  </Stack>;
}

function AuthStack() {
  const { palette } = useVoltTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
    <Stack.Protected guard><Stack.Screen name="(auth)"/></Stack.Protected>
    <Stack.Protected guard={false} redirectTo="/(auth)/welcome">
      <Stack.Screen name="index"/><Stack.Screen name="(tabs)"/><Stack.Screen name="onboarding"/><Stack.Screen name="age-hold"/><Stack.Screen name="legal-agreements"/>
      <Stack.Screen name="habit-form"/><Stack.Screen name="habit-history"/><Stack.Screen name="workout-form"/>
      <Stack.Screen name="routine-form"/><Stack.Screen name="weight"/><Stack.Screen name="weight-form"/>
      <Stack.Screen name="measurement-form"/><Stack.Screen name="mission-form"/><Stack.Screen name="missions"/>
      <Stack.Screen name="motivation"/><Stack.Screen name="reminders"/><Stack.Screen name="account"/><Stack.Screen name="premium-test"/><Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}/><Stack.Screen name="cloud-sync"/><Stack.Screen name="delete-account"/><Stack.Screen name="admob-testing"/>
    </Stack.Protected>
  </Stack>;
}

function Navigator() {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const blocked = useAccountDeletionBlocked(userId);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof pendingDeletions>> | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const cleanupBusy = useRef(false);
  const currentDeletion = useQuery(api.accountDeletion.current, isLoaded && isSignedIn && isAuthenticated && userId && pending !== null && !blocked ? {} : 'skip');
  useEffect(() => {
    if (blocked && userId) void clearAccountReminders().catch(cause => reportFailure('deletion-reminders', cause));
  }, [blocked, userId]);
  useEffect(() => {
    void pendingDeletions().then(setPending).catch(() => { setCleanupError('Could not read the saved deletion receipt. Restart the app and try again.'); setPending([]); });
  }, [blocked, userId]);
  useEffect(() => {
    if (!userId || !currentDeletion?.receipt) return;
    blockAccountForDeletion(userId);
    void rememberDeletion({ userId, receipt: currentDeletion.receipt }).then(() => pendingDeletions()).then(setPending).catch(() => setCleanupError('Could not save the deletion receipt on this device.'));
  }, [userId, currentDeletion?.receipt]);
  useEffect(() => {
    if (pending === null) return;
    let active = true;
    const reconcile = async () => {
      if (cleanupBusy.current) return;
      cleanupBusy.current = true;
      let step: 'receipt' | 'completion' | 'reminders' | 'sqlite' | 'signout' | 'securestore' = 'receipt';
      try {
        const saved = await pendingDeletions();
        for (const pending of saved) {
          if (!active) return;
          step = 'completion';
          const state = await deletionCompletionClient.query(api.accountDeletion.completionStatus, { receipt: pending.receipt });
          if (!active) return;
          if (!state?.completed) continue;
          step = 'reminders';
          if (userId === pending.userId) await clearAccountReminders();
          step = 'sqlite';
          await removeLocalAccountData(pending.userId);
          step = 'signout';
          if (userId === pending.userId && isSignedIn) await signOut();
          step = 'securestore';
          await forgetDeletion(pending.userId);
          if (userId !== pending.userId) unblockAccountAfterRejectedDeletion(pending.userId);
          setPending(await pendingDeletions());
          setCleanupError(null);
        }
        if (saved.length) setCleanupError(null);
      } catch (cause) {
        reportFailure(`deletion-${step}`, cause);
        if (__DEV__) console.warn('Deletion cleanup retry', step, cause instanceof Error ? cause.name : typeof cause);
        setCleanupError(step === 'completion' ? 'Could not check deletion completion. This device will retry when connected.'
          : step === 'receipt' || step === 'securestore' ? 'Could not read or update the saved deletion receipt on this device. This device will retry.'
            : step === 'reminders' ? 'Cloud deletion is complete. This device could not cancel reminders yet and will retry.'
              : step === 'sqlite' ? 'Cloud deletion is complete. This device could not remove local account data yet and will retry.'
                : 'Cloud deletion and local data removal are complete. Sign-out needs another attempt.');
      }
      finally { cleanupBusy.current = false; }
    };
    void reconcile();
    const timer = setInterval(() => { void reconcile(); }, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [userId, isSignedIn, signOut, pending]);
  useEffect(() => { authDiagnostic('Clerk auth state', { loaded: isLoaded, signedIn: Boolean(isSignedIn), hasUser: Boolean(userId) }, 'NAVIGATION'); }, [isLoaded, isSignedIn, userId]);
  // Keep the root appearance alive across Clerk transitions. The signed-in
  // AppProvider restores the account's persisted selection after local data is
  // ready; resetting here used to race that hydration and flash a different UI.
  useEffect(() => { if (isLoaded && !isSignedIn) { clearMonitoringUser(); setLocalAccount(null); setActiveLanguage('en'); clearAccountReminders().catch(() => undefined); } }, [isLoaded, isSignedIn]);
  const gate = clerkGateState(isLoaded, isSignedIn, userId);
  useEffect(() => { authDiagnostic('protected route gate', { gate }, 'NAVIGATION'); }, [gate]);
  if (gate === 'loading') return <Loading/>;
  const signedIn = gate === 'signed-in';
  const view = accountDeletionView({ signedIn, userId, authenticated: isAuthenticated, pending, current: currentDeletion, blocked });
  if (view === 'loading') return <Loading/>;
  const accountReceipt = pending?.find(item => item.userId === userId)?.receipt ?? currentDeletion?.receipt ?? null;
  if (view === 'progress') return <DeletionProgress receipt={signedIn ? accountReceipt : pending?.[0]?.receipt ?? null} signedIn={signedIn} cleanupError={cleanupError}/>;
  return signedIn && userId ? <LocalAccount key={userId} userId={userId}><AuthenticatedStack signedIn={signedIn}/></LocalAccount> : <AuthStack/>;
}

export default function Root() {
  return <SafeAreaProvider><VoltThemeProvider><AppFonts><MotionProvider><ClerkProvider publishableKey={publishableKey!} tokenCache={tokenCache}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}><SubscriptionProvider><Navigator/></SubscriptionProvider></ConvexProviderWithClerk>
  </ClerkProvider></MotionProvider></AppFonts></VoltThemeProvider></SafeAreaProvider>;
}
