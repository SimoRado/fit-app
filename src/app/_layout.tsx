import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/app';
import { setLocalAccount } from '../data/db';
import { setActiveLanguage } from '../core/i18n';
import { AppFonts } from '../ui/fonts';
import { MotionProvider } from '../ui/motion';
import { colors } from '../ui/theme';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!convexUrl || !publishableKey) throw new Error('Missing Clerk or Convex development configuration');
const convex = new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });

function Loading() { return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.accent}/></View>; }

function LocalAccount({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setLocalAccount(userId); setReady(true); return () => setLocalAccount(null); }, [userId]);
  return ready ? <AppProvider key={userId}>{children}</AppProvider> : <Loading/>;
}

function Navigator() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => { if (isLoaded && !isSignedIn) { setLocalAccount(null); setActiveLanguage('en'); Notifications.cancelAllScheduledNotificationsAsync().catch(console.error); } }, [isLoaded, isSignedIn]);
  if (!isLoaded) return <Loading/>;
  const signedIn = Boolean(isSignedIn && userId);
  const stack = <><StatusBar style="light"/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Protected guard={!signedIn}><Stack.Screen name="(auth)"/></Stack.Protected>
    <Stack.Protected guard={signedIn} redirectTo="/(auth)/welcome">
      <Stack.Screen name="index"/><Stack.Screen name="(tabs)"/><Stack.Screen name="onboarding"/>
      <Stack.Screen name="habit-form"/><Stack.Screen name="habit-history"/><Stack.Screen name="workout-form"/>
      <Stack.Screen name="routine-form"/><Stack.Screen name="weight"/><Stack.Screen name="weight-form"/>
      <Stack.Screen name="measurement-form"/><Stack.Screen name="mission-form"/><Stack.Screen name="missions"/>
      <Stack.Screen name="motivation"/><Stack.Screen name="reminders"/><Stack.Screen name="account"/>
    </Stack.Protected>
  </Stack></>;
  return signedIn && userId ? <LocalAccount key={userId} userId={userId}>{stack}</LocalAccount> : stack;
}

export default function Root() {
  return <SafeAreaProvider><AppFonts><MotionProvider><ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}><Navigator/></ConvexProviderWithClerk>
  </ClerkProvider></MotionProvider></AppFonts></SafeAreaProvider>;
}
