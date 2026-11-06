import React from 'react';
import { AuthAction, AuthLink, AuthPage } from '../../ui/auth';
import { Link, router } from 'expo-router';
import { SocialAuth } from '../../ui/SocialAuth';
import { Text } from '../../ui/LocalizedText';
import { colors, fonts } from '../../ui/theme';
import { View } from 'react-native';

export default function Welcome() { return <AuthPage title={'Grow a little,\nevery day'} detail="Habits, training and progress that adapt to your goals.">
  <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.card2 }}><Link href="/(auth)/sign-up" accessibilityRole="button" style={{ flex: 1, minHeight: 44, paddingTop: 13, borderRadius: 999, backgroundColor: colors.card, color: colors.ink, fontFamily: fonts.bold, textAlign: 'center' }}>Sign up</Link><Link href="/(auth)/sign-in" accessibilityRole="button" style={{ flex: 1, minHeight: 44, paddingTop: 13, color: colors.muted, fontFamily: fonts.bold, textAlign: 'center' }}>Log in</Link></View>
  <SocialAuth/>
  <Text style={{ textAlign: 'center', color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .7 }}>OR USE EMAIL</Text>
  <AuthAction title="Continue with Email" onPress={() => router.push('/(auth)/sign-up')}/>
  <AuthLink href="/(auth)/sign-in" title="Already have an account? Sign in"/>
</AuthPage>; }
