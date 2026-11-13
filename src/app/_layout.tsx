import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/app';
import { removeLocalAccountData, setLocalAccount } from '../data/db';
import { setActiveLanguage } from '../core/i18n';
import { AppFonts } from '../ui/fonts';
import { MotionProvider } from '../ui/motion';
import { SubscriptionProvider } from '../state/subscriptions';
import { AdEligibilityBridge } from '../state/AdEligibilityBridge';
import { SyncProvider } from '../state/sync';
import { clearAccountReminders } from '../services/reminders';
import { colors } from '../ui/theme';
import { authDiagnostic } from '../core/runtime';
import { clerkGateState } from '../core/googleSession';
import { api } from '../../convex/_generated/api';
import { pendingDeletions, forgetDeletion } from '../data/pendingDeletion';
import { clearMonitoringUser, reportFailure } from '../core/monitoring';

function RenderError({ retry }: { error: Error; retry: () => Promise<void> }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>Something went wrong</Text>
    <Text style={{ color: colors.muted }}>Your data is still on this device. Please try this screen again.</Text>
    <Pressable accessibilityRole="button" onPress={() => { void retry(); }} style={{ alignSelf: 'flex-start', backgroundColor: colors.accent, padding: 16, borderRadius: 18 }}>
      <Text style={{ color: colors.accentText, fontWeight: '700' }}>Try again</Text>
    </Pressable>
  </View>;
}
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(RenderError);

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!convexUrl || !publishableKey) throw new Error('Missing Clerk or Convex development configuration');
const convex = new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });

function Loading() { return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.accent}/></View>; }

function LocalAccount({ userId, children }: { userId: string; children: React.ReactNode }) {
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
  if (error) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 24 }}><Text style={{ color: colors.text, textAlign: 'center' }}>Could not clear reminders from the previous account.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={{ color: colors.accent }}>Retry</Text></Pressable></View>;
  return ready ? <AppProvider key={userId}><SyncProvider><AdEligibilityBridge>{children}</AdEligibilityBridge></SyncProvider></AppProvider> : <Loading/>;
}

function Navigator() {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  useEffect(() => {
    let active = true;
    let busy = false;
    const reconcile = async () => {
      if (busy) return;
      busy = true;
      try {
        for (const pending of await pendingDeletions()) {
          if (!active) return;
          const state = await convex.query(api.accountDeletion.status, { receipt: pending.receipt });
          if (state?.stage !== 'completed') continue;
          if (userId === pending.userId) await clearAccountReminders();
          await removeLocalAccountData(pending.userId);
          await forgetDeletion(pending.userId);
          if (userId === pending.userId) { try { await signOut(); } catch { /* Clerk may already have ended the session. */ } }
        }
      } catch { /* An offline device will try again when it reconnects. */ }
      finally { busy = false; }
    };
    void reconcile();
    const timer = setInterval(() => { void reconcile(); }, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [userId, signOut]);
  useEffect(() => { authDiagnostic('Clerk auth state', { loaded: isLoaded, signedIn: Boolean(isSignedIn), hasUser: Boolean(userId) }, 'NAVIGATION'); }, [isLoaded, isSignedIn, userId]);
  useEffect(() => { if (isLoaded && !isSignedIn) { clearMonitoringUser(); setLocalAccount(null); setActiveLanguage('en'); clearAccountReminders().catch(() => undefined); } }, [isLoaded, isSignedIn]);
  const gate = clerkGateState(isLoaded, isSignedIn, userId);
  useEffect(() => { authDiagnostic('protected route gate', { gate }, 'NAVIGATION'); }, [gate]);
  if (gate === 'loading') return <Loading/>;
  const signedIn = gate === 'signed-in';
  const stack = <><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Protected guard={!signedIn}><Stack.Screen name="(auth)"/></Stack.Protected>
    <Stack.Protected guard={signedIn} redirectTo="/(auth)/welcome">
      <Stack.Screen name="index"/><Stack.Screen name="(tabs)"/><Stack.Screen name="onboarding"/>
      <Stack.Screen name="habit-form"/><Stack.Screen name="habit-history"/><Stack.Screen name="workout-form"/>
      <Stack.Screen name="routine-form"/><Stack.Screen name="weight"/><Stack.Screen name="weight-form"/>
      <Stack.Screen name="measurement-form"/><Stack.Screen name="mission-form"/><Stack.Screen name="missions"/>
      <Stack.Screen name="motivation"/><Stack.Screen name="reminders"/><Stack.Screen name="account"/><Stack.Screen name="premium-test"/><Stack.Screen name="cloud-sync"/><Stack.Screen name="delete-account"/><Stack.Screen name="admob-testing"/>
    </Stack.Protected>
  </Stack></>;
  return signedIn && userId ? <LocalAccount key={userId} userId={userId}>{stack}</LocalAccount> : stack;
}

export default function Root() {
  return <SafeAreaProvider><AppFonts><MotionProvider><ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}><SubscriptionProvider><Navigator/></SubscriptionProvider></ConvexProviderWithClerk>
  </ClerkProvider></MotionProvider></AppFonts></SafeAreaProvider>;
}
