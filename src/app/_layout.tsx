import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/app';
import { setLocalAccount } from '../data/db';
import { setActiveLanguage } from '../core/i18n';
import { AppFonts } from '../ui/fonts';
import { MotionProvider } from '../ui/motion';
import { SubscriptionProvider } from '../state/subscriptions';
import { SyncProvider } from '../state/sync';
import { clearAccountReminders } from '../services/reminders';
import { colors } from '../ui/theme';
import { authDiagnostic } from '../core/runtime';
import { clerkGateState } from '../core/googleSession';

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
    void clearAccountReminders().then(() => { if (active) setReady(true); }).catch(() => { if (active) setError(true); });
    return () => { active = false; setLocalAccount(null); };
  }, [userId, retry]);
  if (error) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 24 }}><Text style={{ color: colors.text, textAlign: 'center' }}>Could not clear reminders from the previous account.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={{ color: colors.accent }}>Retry</Text></Pressable></View>;
  return ready ? <AppProvider key={userId}><SyncProvider>{children}</SyncProvider></AppProvider> : <Loading/>;
}

function Navigator() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => { authDiagnostic('Clerk auth state', { loaded: isLoaded, signedIn: Boolean(isSignedIn), hasUser: Boolean(userId) }); }, [isLoaded, isSignedIn, userId]);
  useEffect(() => { if (isLoaded && !isSignedIn) { setLocalAccount(null); setActiveLanguage('en'); clearAccountReminders().catch(() => undefined); } }, [isLoaded, isSignedIn]);
  const gate = clerkGateState(isLoaded, isSignedIn, userId);
  if (gate === 'loading') return <Loading/>;
  const signedIn = gate === 'signed-in';
  const stack = <><StatusBar style="light"/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Protected guard={!signedIn}><Stack.Screen name="(auth)"/></Stack.Protected>
    <Stack.Protected guard={signedIn} redirectTo="/(auth)/welcome">
      <Stack.Screen name="index"/><Stack.Screen name="(tabs)"/><Stack.Screen name="onboarding"/>
      <Stack.Screen name="habit-form"/><Stack.Screen name="habit-history"/><Stack.Screen name="workout-form"/>
      <Stack.Screen name="routine-form"/><Stack.Screen name="weight"/><Stack.Screen name="weight-form"/>
      <Stack.Screen name="measurement-form"/><Stack.Screen name="mission-form"/><Stack.Screen name="missions"/>
      <Stack.Screen name="motivation"/><Stack.Screen name="reminders"/><Stack.Screen name="account"/><Stack.Screen name="premium-test"/><Stack.Screen name="cloud-sync"/>
    </Stack.Protected>
  </Stack></>;
  return signedIn && userId ? <LocalAccount key={userId} userId={userId}>{stack}</LocalAccount> : stack;
}

export default function Root() {
  return <SafeAreaProvider><AppFonts><MotionProvider><ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}><SubscriptionProvider><Navigator/></SubscriptionProvider></ConvexProviderWithClerk>
  </ClerkProvider></MotionProvider></AppFonts></SafeAreaProvider>;
}
