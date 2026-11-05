import React, { useState } from 'react';
import { useSignUp } from '@clerk/expo';
import { AuthAction, AuthError, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';
import { OtpField } from '../../ui/OtpField';
import { Text } from '../../ui/LocalizedText';
import { styles } from '../../ui/components';

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
    if (busy) return;
    setBusy(true);
    setError(''); setNotice('');
    try { const result = await signUp.verifications.sendEmailCode(); if (result.error) setError(clerkMessage(result.error)); else setNotice('A new code was sent.'); }
    catch (cause) { setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  return <AuthPage title="Verify your email" detail="We've sent a verification code to your email address.">
    <Text style={styles.muted}>{signUp.emailAddress ?? ''}</Text>
    <OtpField value={code} onChangeText={setCode}/>
    <AuthError message={error}/>{notice ? <Text style={styles.muted}>{notice}</Text> : null}
    <AuthAction title={busy ? 'Verifying…' : 'Verify email'} onPress={verify} disabled={busy}/>
    <AuthAction title="Resend code" onPress={resend} disabled={busy}/>
    <AuthLink href="/(auth)/sign-up" title="Start registration again"/>
  </AuthPage>;
}
