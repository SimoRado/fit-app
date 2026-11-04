import React, { useState } from 'react';
import { router } from 'expo-router';
import { useSignUp } from '@clerk/expo';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';
import { Text } from '../../ui/LocalizedText';
import { styles } from '../../ui/components';

export default function SignUp() {
  const { signUp } = useSignUp();
  const [name, setName] = useState(''), [lastName, setLastName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim() || !lastName.trim() || !email.trim() || !password) { setError('Enter your first and last name, email and password.'); return; }
    setBusy(true); setError('');
    try {
      const result = await signUp.password({ firstName: name.trim(), lastName: lastName.trim(), emailAddress: email.trim(), password });
      if (result.error) { setError(clerkMessage(result.error)); return; }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) { setError(clerkMessage(sent.error)); return; }
      router.push('/(auth)/verify-email');
    } catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  return <AuthPage title="Create account" detail="Sign up with email and a password. Your fitness profile comes next.">
    <AuthField label="First name" value={name} onChangeText={setName}/>
    <AuthField label="Last name" value={lastName} onChangeText={setLastName}/>
    <AuthField label="Email" value={email} onChangeText={setEmail} email/>
    <AuthField label="Password" value={password} onChangeText={setPassword} secure/>
    <Text style={styles.muted}>Use at least 15 characters for your password.</Text>
    <AuthError message={error}/><AuthAction title={busy ? 'Creating…' : 'Create account'} onPress={submit} disabled={busy}/>
    <AuthLink href="/(auth)/sign-in" title="Already have an account? Sign in"/>
  </AuthPage>;
}
