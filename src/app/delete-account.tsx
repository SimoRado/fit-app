import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useAuth, useSession } from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import { useAction, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { api } from '../../convex/_generated/api';
import { removeLocalAccountData } from '../data/db';
import { forgetDeletion, pendingDeletions, rememberDeletion } from '../data/pendingDeletion';
import { clearAccountReminders } from '../services/reminders';
import { useSubscription } from '../state/subscriptions';
import { Button, Card, Field, message, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';

export default function DeleteAccount() {
  const { userId, getToken, signOut } = useAuth();
  const { session } = useSession();
  const subscription = useSubscription();
  const request = useAction(api.accountDeletionActions.request);
  const retry = useMutation(api.accountDeletion.retry);
  const current = useQuery(api.accountDeletion.current, userId ? {} : 'skip');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [verificationReady, setVerificationReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localDone, setLocalDone] = useState(false);
  const status = useQuery(api.accountDeletion.status, receipt ? { receipt } : 'skip');
  useEffect(() => { if (!userId) return; pendingDeletions().then(items => { const pending = items.find(item => item.userId === userId); if (pending) setReceipt(pending.receipt); }).catch(message); }, [userId]);
  useEffect(() => { if (userId && current?.receipt && !receipt) { setReceipt(current.receipt); void rememberDeletion({ userId, receipt: current.receipt }).catch(message); } }, [userId, current, receipt]);
  useEffect(() => {
    if (!userId || !receipt || status?.stage !== 'completed' || localDone) return;
    setLocalDone(true);
    void (async () => {
      await clearAccountReminders();
      await removeLocalAccountData(userId);
      await forgetDeletion(userId);
      try { await signOut(); } catch { /* Clerk may have already invalidated this session. */ }
      router.replace('/(auth)/welcome');
    })().catch(error => { setLocalDone(false); message(error); });
  }, [userId, receipt, status?.stage, localDone, signOut]);
  async function sendCode() {
    if (!session) throw Error('Sign in again before deleting your account.');
    setBusy(true); setNotice('');
    try {
      const verification = await session.startVerification({ level: 'first_factor' });
      const factor = verification.supportedFirstFactors?.find(item => item.strategy === 'email_code');
      if (!factor || factor.strategy !== 'email_code') throw Error('Email code verification is unavailable for this account.');
      await session.prepareFirstFactorVerification({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      setVerificationReady(true);
      setNotice('A verification code was sent to your account email.');
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  async function verifyCode() {
    if (!session || !code.trim()) return;
    setBusy(true);
    try {
      const result = await session.attemptFirstFactorVerification({ strategy: 'email_code', code: code.trim() });
      if (result.status !== 'complete') throw Error('Verification is not complete.');
      setVerified(true); setNotice('Identity verified. You can submit the deletion request.');
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!userId || !verified || confirmation !== 'DELETE') return;
    setBusy(true);
    try {
      const sessionToken = await getToken({ skipCache: true });
      if (!sessionToken) throw Error('Sign in again before deleting your account.');
      const requestReceipt = receipt ?? Crypto.randomUUID() + Crypto.randomUUID();
      await rememberDeletion({ userId, receipt: requestReceipt });
      const job = await request({ confirmation, sessionToken, receipt: requestReceipt });
      setReceipt(job.receipt);
      setNotice('Deletion requested. Cloud cleanup will continue even if you close the app.');
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  const managementURL = subscription.info?.managementURL;
  return <Page title="Delete Account">
    <Card><Text style={styles.text}>Deleting your Fitapp account is permanent. It removes your cloud data, workout history, habits, nutrition records, preferences, and this account’s local data on this device. RevenueCat customer data is removed where supported, followed by your Clerk identity.</Text>
      <Text style={styles.muted}>Deleting your account does not cancel an App Store or Google Play subscription. Manage any active subscription through your store.</Text>
      {!!managementURL && <Button title="Manage subscription" kind="ghost" onPress={() => { if (managementURL.startsWith('https://')) void Linking.openURL(managementURL).catch(message); }}/>}
    </Card>
    {receipt ? <Card><Text style={styles.label}>Deletion status</Text><Text style={styles.text}>{status?.stage === 'completed' ? 'Finishing cleanup on this device…' : status?.stage === 'retry_required' ? 'A service needs another attempt. Your account is locked against new cloud writes.' : status === null ? 'The deletion request was not found. Reconnect and submit it again.' : 'Deletion is in progress. Keep the app connected to finish local cleanup.'}</Text>
      {status?.errorCategory && <Text style={styles.muted}>Service status: {status.errorCategory.replace(/_/g, ' ')}</Text>}
      {status?.stage === 'retry_required' && <Button title="Retry now" onPress={async () => { await retry({}); }}/>}
      {status === null && <Button title="Start request again" kind="ghost" onPress={async () => { if (userId) await forgetDeletion(userId); setReceipt(null); setVerified(false); }}/>}
    </Card> : <Card>
      <Text style={styles.label}>Confirm identity</Text>
      <Button title={busy ? 'Please wait…' : 'Send verification code'} disabled={busy} onPress={sendCode}/>
      {verificationReady && !verified && <><Field label="Email verification code" value={code} onChangeText={setCode} keyboardType="numeric"/><Button title="Verify code" disabled={busy || !code.trim()} onPress={verifyCode}/></>}
      {verified && <><Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation}/><Button title="Permanently delete account" kind="danger" disabled={busy || confirmation !== 'DELETE'} onPress={submit}/></>}
    </Card>}
    {!!notice && <Text style={styles.muted}>{notice}</Text>}
    <View><Button title="Back to Data & Privacy" kind="ghost" onPress={() => router.back()}/></View>
  </Page>;
}
