import React from 'react';
import { AuthAction, AuthLink, AuthPage } from '../../ui/auth';
import { router } from 'expo-router';
import { SocialAuth } from '../../ui/SocialAuth';
import { Text } from '../../ui/LocalizedText';
import { colors } from '../../ui/theme';

export default function Welcome() { return <AuthPage title="Welcome to Fitapp" detail="Progress over perfection.">
  <SocialAuth/>
  <Text style={{ textAlign: 'center', color: colors.muted }}>OR</Text>
  <AuthAction title="Continue with Email" onPress={() => router.push('/(auth)/sign-up')}/>
  <AuthLink href="/(auth)/sign-in" title="Already have an account? Sign in"/>
</AuthPage>; }
