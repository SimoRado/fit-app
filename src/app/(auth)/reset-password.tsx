import React, { useState } from 'react';
import { useSignIn } from '@clerk/expo';
import { router } from 'expo-router';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';

export default function ResetPassword() {
  const { signIn } = useSignIn();
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [verified, setVerified] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function verify() {
    if (!code.trim()) { setError('Enter the reset code.'); return; }
    setBusy(true); setError('');
    try { const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }); if (result.error) setError(clerkMessage(result.error)); else setVerified(true); }
    catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function submit() {
    if (!password) { setError('Enter a new password.'); return; }
    setBusy(true); setError('');
    try {
      const result = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (result.error) { setError(clerkMessage(result.error)); return; }
      await signIn.reset();
      router.replace('/(auth)/sign-in');
    } catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function resend() { try { const result = await signIn.resetPasswordEmailCode.sendCode(); if (result.error) setError(clerkMessage(result.error)); else setError(''); } catch (cause) { setError(clerkMessage(cause)); } }
  return <AuthPage title={verified ? 'New password' : 'Check your email'} detail={verified ? 'Choose a new password for your account.' : 'Enter the code we sent to your email.'}>
    {verified ? <><AuthField label="New password" value={password} onChangeText={setPassword} secure/><AuthError message={error}/><AuthAction title="Set new password" onPress={submit} disabled={busy}/></> : <><AuthField label="Reset code" value={code} onChangeText={setCode} code/><AuthError message={error}/><AuthAction title="Verify code" onPress={verify} disabled={busy}/><AuthAction title="Resend code" onPress={resend} disabled={busy}/></>}
    <AuthLink href="/(auth)/sign-in" title="Return to sign in"/>
  </AuthPage>;
}
