import React, { useState } from 'react';
import { useSignIn } from '@clerk/expo';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';
import { SocialAuth } from '../../ui/SocialAuth';
import { Text } from '../../ui/LocalizedText';
import { styles } from '../../ui/components';
import { authDiagnostic } from '../../core/runtime';

export default function SignIn() {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(''), [needsCode, setNeedsCode] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) { setError('Enter a valid email address and password.'); return; }
    setBusy(true); setError('');
    authDiagnostic('sign-in initiated', { method: 'email_password' }, 'EMAIL');
    try {
      const result = await signIn.password({ emailAddress: email.trim(), password });
      authDiagnostic('sign-in result', { success: !result.error, status: signIn.status ?? null }, 'EMAIL');
      if (result.error) { setError(clerkMessage(result.error)); return; }
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const sent = await signIn.mfa.sendEmailCode();
        if (sent.error) setError(clerkMessage(sent.error)); else setNeedsCode(true);
        return;
      }
      if (signIn.status !== 'complete') { setError('More verification is required for this account.'); return; }
      const final = await signIn.finalize();
      authDiagnostic('sign-in activation result', { success: !final.error }, 'EMAIL');
      if (final.error) setError(clerkMessage(final.error));
    } catch (cause) { authDiagnostic('sign-in failed', {}, 'EMAIL'); setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function verify() {
    if (!code.trim()) { setError('Enter the verification code.'); return; }
    setBusy(true); setError('');
    authDiagnostic('sign-in verification submitted', { digits: code.trim().length }, 'EMAIL');
    try {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      authDiagnostic('sign-in verification result', { success: !result.error }, 'EMAIL');
      if (result.error) { setError(clerkMessage(result.error)); return; }
      const final = await signIn.finalize(); authDiagnostic('sign-in verification activation result', { success: !final.error }, 'EMAIL'); if (final.error) setError(clerkMessage(final.error));
    } catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function resend() { try { const result = await signIn.mfa.sendEmailCode(); if (result.error) setError(clerkMessage(result.error)); else setError(''); } catch (cause) { setError(clerkMessage(cause)); } }
  return <AuthPage title={needsCode ? 'Confirm sign in' : 'Welcome back'} detail={needsCode ? 'Enter the email code for this device.' : 'Sign in to your account. Local workout data stays on this phone.'}>
    {needsCode ? <><AuthField label="Email code" value={code} onChangeText={setCode} code/><AuthError message={error}/><AuthAction title="Verify and sign in" onPress={verify} disabled={busy}/><AuthAction title="Resend code" onPress={resend} disabled={busy}/></> : <>
      <SocialAuth/><Text style={[styles.muted, { textAlign: 'center' }]}>OR USE EMAIL</Text>
      <AuthField label="Email" value={email} onChangeText={setEmail} email/>
      <AuthField label="Password" value={password} onChangeText={setPassword} secure/>
      <AuthError message={error}/><AuthAction title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy}/>
      <AuthLink href="/(auth)/forgot-password" title="Forgot password?"/>
      <AuthLink href="/(auth)/sign-up" title="Don't have an account? Sign up"/>
    </>}
  </AuthPage>;
}
