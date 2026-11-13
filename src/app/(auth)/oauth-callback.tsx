import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthLink, AuthPage } from '../../ui/auth';
import { colors } from '../../ui/theme';
import { authDiagnostic } from '../../core/runtime';

export default function OAuthCallback() {
  useEffect(() => { authDiagnostic('callback route opened'); }, []);
  return <AuthPage title="Finishing sign in" detail="Returning to Cubyfit after authentication.">
    <View style={{ alignItems: 'center', paddingVertical: 20 }}><ActivityIndicator color={colors.accent}/></View>
    <AuthLink href="/(auth)/welcome" title="Return to sign in"/>
  </AuthPage>;
}
