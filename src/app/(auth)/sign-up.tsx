import React, { useState } from 'react';
import { router } from 'expo-router';
import { useSignUp } from '@clerk/expo';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';
import { Text } from '../../ui/LocalizedText';
import { styles } from '../../ui/components';
import { SocialAuth } from '../../ui/SocialAuth';
import { authDiagnostic } from '../../core/runtime';

export default function SignUp() {
  const { signUp } = useSignUp();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter a password.'); return; }
    setBusy(true); setError('');
    authDiagnostic('signup initiated', { method: 'email_password' }, 'EMAIL');
    try {
      const result = await signUp.password({ emailAddress: email.trim(), password });
      authDiagnostic('signup attempt result', { success: !result.error, status: signUp.status ?? null, missingFields: (signUp.missingFields ?? []).join(','), unverifiedFields: (signUp.unverifiedFields ?? []).join(','), hasSession: Boolean(signUp.createdSessionId) }, 'EMAIL');
      if (result.error) { setError(clerkMessage(result.error)); return; }
      const sent = await signUp.verifications.sendEmailCode();
      authDiagnostic('verification code send result', { success: !sent.error }, 'EMAIL');
      if (sent.error) { setError(clerkMessage(sent.error)); return; }
      router.push('/(auth)/verify-email');
    } catch (cause) { authDiagnostic('signup request failed', { stage: 'initiation' }, 'EMAIL'); setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  return <AuthPage title="Create your account" detail="Your fitness profile comes after email verification.">
    <SocialAuth/><Text style={[styles.muted, { textAlign: 'center' }]}>OR USE EMAIL</Text>
    <AuthField label="Email address" value={email} onChangeText={setEmail} email/>
    <AuthField label="Password" value={password} onChangeText={setPassword} secure/>
    <Text style={styles.muted}>Choose a password that meets your account’s security requirements.</Text>
    <AuthError message={error}/><AuthAction title={busy ? 'Creating…' : 'Continue'} onPress={submit} disabled={busy}/>
    <AuthLink href="/(auth)/sign-in" title="Already have an account? Sign in"/>
  </AuthPage>;
}
