import React from 'react';
import { AuthAction, AuthLink, AuthPage } from '../../ui/auth';
import { router } from 'expo-router';

export default function Welcome() { return <AuthPage title="Start here" detail="Your training and growth, kept private on this device until you choose to sync.">
  <AuthAction title="Sign in" onPress={() => router.push('/(auth)/sign-in')}/>
  <AuthLink href="/(auth)/sign-up" title="Create an account"/>
</AuthPage>; }
