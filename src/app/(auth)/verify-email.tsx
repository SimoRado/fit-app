import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { AuthAction, AuthError, AuthField, AuthLink, AuthPage, clerkMessage } from '../../ui/auth';
import { OtpField } from '../../ui/OtpField';
import { Text } from '../../ui/LocalizedText';
import { styles } from '../../ui/components';
import { authDiagnostic } from '../../core/runtime';
import { isCompleteEmailCode } from '../../core/emailCode';
import { canFinalizeSignUp, signupRequirements } from '../../core/signupRequirements';
import { colors } from '../../ui/theme';

export default function VerifyEmail() {
  const { signUp } = useSignUp();
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [verified, setVerified] = useState(false);
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState(''), [username, setUsername] = useState(''), [legalAccepted, setLegalAccepted] = useState(false);
  const requirements = signupRequirements(signUp.missingFields ?? [], signUp.unverifiedFields ?? []);
  const needsDetails = verified || (signUp.status === 'missing_requirements' && !requirements.unverified.includes('email_address') && requirements.missing.length > 0);

  async function finishIfComplete() {
    authDiagnostic('signup state before activation', { status: signUp.status ?? null, missingFields: (signUp.missingFields ?? []).join(','), unverifiedFields: (signUp.unverifiedFields ?? []).join(','), hasSession: Boolean(signUp.createdSessionId) }, 'EMAIL');
    if (!canFinalizeSignUp(signUp.status, signUp.missingFields ?? [], signUp.unverifiedFields ?? [])) return false;
    authDiagnostic('session activation started', { hasSession: Boolean(signUp.createdSessionId) }, 'EMAIL');
    const final = await signUp.finalize();
    authDiagnostic('session activation result', { success: !final.error }, 'EMAIL');
    if (final.error) { setError(clerkMessage(final.error)); return false; }
    return true;
  }
  async function verify() {
    if (!isCompleteEmailCode(code)) { setError('Enter all six digits from your email.'); return; }
    if (!signUp.emailAddress) { setError('Your registration is no longer available. Start registration again.'); return; }
    setBusy(true); setError('');
    authDiagnostic('verification submitted', { digits: code.length, attemptAvailable: Boolean(signUp.emailAddress) }, 'EMAIL');
    try {
      const result = await signUp.verifications.verifyEmailCode({ code });
      authDiagnostic('verification result', { success: !result.error, status: signUp.status ?? null, missingFields: (signUp.missingFields ?? []).join(','), unverifiedFields: (signUp.unverifiedFields ?? []).join(','), hasSession: Boolean(signUp.createdSessionId) }, 'EMAIL');
      if (result.error) { setError(clerkMessage(result.error)); return; }
      if (signUp.status === 'complete') { await finishIfComplete(); return; }
      if (signUp.status === 'missing_requirements') { setVerified(true); return; }
      setError('Email verified, but registration is not ready to finish. Please try again.');
    } catch (cause) { authDiagnostic('verification request failed', { stage: 'verification_or_activation' }, 'EMAIL'); setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function completeRequirements() {
    if (busy) return;
    if (requirements.unsupported.length || requirements.unverified.length) { setError('Clerk requires another verification step. Please contact support with the requirement names shown below.'); return; }
    if (requirements.firstName && !firstName.trim()) { setError('Enter your first name.'); return; }
    if (requirements.lastName && !lastName.trim()) { setError('Enter your last name.'); return; }
    if (requirements.username && !username.trim()) { setError('Enter a username.'); return; }
    if (requirements.legalAccepted && !legalAccepted) { setError('Accept the required terms to continue.'); return; }
    setBusy(true); setError('');
    try {
      const result = await signUp.update({
        ...(requirements.firstName ? { firstName: firstName.trim() } : {}),
        ...(requirements.lastName ? { lastName: lastName.trim() } : {}),
        ...(requirements.username ? { username: username.trim() } : {}),
        ...(requirements.legalAccepted ? { legalAccepted: true } : {}),
      });
      authDiagnostic('requirements update result', { success: !result.error, status: signUp.status ?? null, missingFields: (signUp.missingFields ?? []).join(','), unverifiedFields: (signUp.unverifiedFields ?? []).join(','), hasSession: Boolean(signUp.createdSessionId) }, 'EMAIL');
      if (result.error) { setError(clerkMessage(result.error)); return; }
      if (signUp.status === 'complete') { await finishIfComplete(); return; }
      setError('Clerk still requires more information. See the remaining requirements below.');
    } catch (cause) { authDiagnostic('requirements update failed', {}, 'EMAIL'); setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  async function resend() {
    if (busy || !signUp.emailAddress) return;
    setBusy(true);
    setError(''); setNotice('');
    try { const result = await signUp.verifications.sendEmailCode(); authDiagnostic('verification resend result', { success: !result.error }, 'EMAIL'); if (result.error) setError(clerkMessage(result.error)); else setNotice('A new code was sent.'); }
    catch (cause) { authDiagnostic('verification resend failed', {}, 'EMAIL'); setError(clerkMessage(cause)); } finally { setBusy(false); }
  }
  return <AuthPage title={needsDetails ? 'Complete your account' : 'Verify your email'} detail={needsDetails ? 'One more account step before your fitness profile.' : "We've sent a verification code to your email address."}>
    <Text style={styles.muted}>{signUp.emailAddress ?? ''}</Text>
    {needsDetails ? <>
      {requirements.firstName && <AuthField label="First name" value={firstName} onChangeText={setFirstName}/>}
      {requirements.lastName && <AuthField label="Last name" value={lastName} onChangeText={setLastName}/>}
      {requirements.username && <AuthField label="Username" value={username} onChangeText={setUsername}/>}
      {requirements.legalAccepted && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: legalAccepted }} onPress={() => setLegalAccepted(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.text }}>{legalAccepted ? '☑' : '☐'} I accept the required terms</Text></Pressable>}
      {requirements.unsupported.length > 0 && <Text style={styles.muted}>Additional required fields: {requirements.unsupported.join(', ')}</Text>}
      {requirements.unverified.length > 0 && <Text style={styles.muted}>Fields still awaiting verification: {requirements.unverified.join(', ')}</Text>}
      <AuthError message={error}/>
      <AuthAction title={busy ? 'Completing…' : 'Continue'} onPress={completeRequirements} disabled={busy || requirements.unsupported.length > 0 || requirements.unverified.length > 0}/>
    </> : <>
      <OtpField value={code} onChangeText={setCode}/>
      <AuthError message={error}/>{notice ? <Text style={styles.muted}>{notice}</Text> : null}
      <AuthAction title={busy ? 'Verifying…' : 'Verify email'} onPress={verify} disabled={busy}/>
      <AuthAction title="Resend code" onPress={resend} disabled={busy || !signUp.emailAddress}/>
    </>}
    <AuthLink href="/(auth)/sign-up" title="Start registration again"/>
  </AuthPage>;
}
