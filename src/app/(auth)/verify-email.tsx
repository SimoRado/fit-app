import React, { useState } from 'react';
import { useSignUp } from '@clerk/expo';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';

export default function VerifyEmail() {
  const { signUp } = useSignUp();
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function verify() {
    if (!code.trim()) { setError('Enter the code from your email.'); return; }
    setBusy(true); setError('');
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (result.error) { setError(clerkMessage(result.error)); return; }
      const final = await signUp.finalize();
      if (final.error) setError(clerkMessage(final.error));
    } catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function resend() {
    setError(''); setNotice('');
    try { const result = await signUp.verifications.sendEmailCode(); if (result.error) setError(clerkMessage(result.error)); else setNotice('A new code was sent.'); }
    catch (cause) { setError(clerkMessage(cause)); }
  }
  return <AuthPage title="Verify email" detail="Enter the verification code we sent to your inbox.">
    <AuthField label="Verification code" value={code} onChangeText={setCode} code/>
    <AuthError message={error}/>{notice ? <AuthError message={notice}/> : null}
    <AuthAction title={busy ? 'Verifying…' : 'Verify email'} onPress={verify} disabled={busy}/>
    <AuthAction title="Resend code" onPress={resend} disabled={busy}/>
    <AuthLink href="/(auth)/sign-up" title="Start registration again"/>
  </AuthPage>;
}
