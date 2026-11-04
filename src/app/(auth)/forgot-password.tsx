import React, { useState } from 'react';
import { router } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';

export default function ForgotPassword() {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function send() {
    if (!email.trim()) { setError('Enter your account email.'); return; }
    setBusy(true); setError('');
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) { setError(clerkMessage(created.error)); return; }
      const result = await signIn.resetPasswordEmailCode.sendCode();
      if (result.error) { setError(clerkMessage(result.error)); return; }
      router.push('/(auth)/reset-password');
    } catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  return <AuthPage title="Reset password" detail="We’ll email a code to confirm this account belongs to you.">
    <AuthField label="Email" value={email} onChangeText={setEmail} email/>
    <AuthError message={error}/><AuthAction title="Send reset code" onPress={send} disabled={busy}/>
    <AuthLink href="/(auth)/sign-in" title="Return to sign in"/>
  </AuthPage>;
}
