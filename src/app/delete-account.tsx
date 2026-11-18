import React, { useEffect, useState } from 'react';
import { Alert, Linking, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useSession } from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import { useAction, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { api } from '../../convex/_generated/api';
import { removeLocalAccountData } from '../data/db';
import { forgetDeletion, pendingDeletions, rememberDeletion } from '../data/pendingDeletion';
import { deletionFailure } from '../core/accountDeletionErrors';
import { clearAccountReminders } from '../services/reminders';
import { useSubscription } from '../state/subscriptions';
import { Button, Card, Field, message, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { colors, fonts } from '../ui/theme';

/** What the person must type. The server keeps its own fixed confirmation token. */
const DELETE_PHRASE = 'DELETE-ACCOUNT';
const SERVER_CONFIRMATION = 'DELETE';

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
    if (!userId || !verified || confirmation !== DELETE_PHRASE) return;
    setBusy(true);
    try {
      const sessionToken = await getToken({ skipCache: true });
      if (!sessionToken) throw Error('Sign in again before deleting your account.');
      const requestReceipt = receipt ?? Crypto.randomUUID() + Crypto.randomUUID();
      await rememberDeletion({ userId, receipt: requestReceipt });
      const job = await request({ confirmation: SERVER_CONFIRMATION, sessionToken, receipt: requestReceipt });
      setReceipt(job.receipt);
      setNotice('Deletion requested. Cloud cleanup will continue even if you close the app.');
    } catch (error) {
      const failure = deletionFailure(error);
      // The server rejected the request before creating a job: drop the receipt saved above,
      // otherwise this page would later report "deletion request not found".
      if (!failure.jobMayExist) { await forgetDeletion(userId).catch(() => undefined); setReceipt(null); }
      if (failure.reverify) { setVerified(false); setVerificationReady(false); setCode(''); }
      setNotice(failure.message);
      Alert.alert(failure.title, failure.message);
    }
    finally { setBusy(false); }
  }
  const phraseOk = confirmation === DELETE_PHRASE;
  const managementURL = subscription.info?.managementURL;
  return <Page title="Delete Account">
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 22, backgroundColor: colors.bg === '#F5F9FF' ? '#FDECEA' : 'rgba(255,138,138,0.12)', borderWidth: 1, borderColor: colors.danger }}>
      <Ionicons name="warning-outline" size={22} color={colors.danger}/>
      <Text style={{ flex: 1, color: colors.danger, fontFamily: fonts.bold, fontSize: 13.5, lineHeight: 19 }}>Permanently delete your account? This action cannot be undone.</Text>
    </View>
    <Card><Text style={styles.text}>Deleting your account permanently removes your Cubyfit profile and account-associated personal data from our active systems, including saved habits and historical progress, workouts and routines, nutrition logs and saved foods, weight and body measurements, goals, preferences, and account-linked fitness statistics. We do not keep identifiable fitness statistics solely for our own analytics after deletion.</Text>
      <Text style={styles.muted}>Cleanup runs after you confirm and may take time. Data for this account on this device is removed when the process completes. Offline devices cannot be erased remotely and may retain a copy that requires local removal, especially if they reconnect after deletion tracking expires. Separately saved guest data is not part of this account.</Text>
      <Text style={styles.muted}>A limited deletion-status record is kept temporarily to finish device cleanup. Diagnostic and advertising records held by third parties, app-store billing records, and backups may remain under their retention rules or legal obligations.</Text>
      <Text style={styles.muted}>Deleting your account does not cancel an App Store or Google Play subscription. Cancel any active subscription through your store.</Text>
      {!!managementURL && <Button title="Manage subscription" kind="ghost" onPress={() => { if (managementURL.startsWith('https://')) void Linking.openURL(managementURL).catch(message); }}/>}
    </Card>
    {receipt ? <Card><Text style={styles.label}>Deletion status</Text><Text style={styles.text}>{status?.stage === 'completed' ? 'Finishing cleanup on this device…' : status?.stage === 'retry_required' ? 'A service needs another attempt. Your account is locked against new cloud writes.' : status === null ? 'The deletion request was not found. Reconnect and submit it again.' : 'Deletion is in progress. Keep the app connected to finish local cleanup.'}</Text>
      {status?.errorCategory && <Text style={styles.muted}>Service status: {status.errorCategory.replace(/_/g, ' ')}</Text>}
      {status?.stage === 'retry_required' && <Button title="Retry now" onPress={async () => { await retry({}); }}/>}
      {status === null && <Button title="Start request again" kind="ghost" onPress={async () => { if (userId) await forgetDeletion(userId); setReceipt(null); setVerified(false); }}/>}
    </Card> : <Card>
      <Text style={styles.label}>1 · Type the confirmation phrase</Text>
      <Text style={styles.muted}>{`To continue, type ${DELETE_PHRASE} exactly as shown, in capital letters.`}</Text>
      <TextInput accessibilityLabel={`Type ${DELETE_PHRASE} to confirm`} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} autoComplete="off" spellCheck={false} placeholder={DELETE_PHRASE} placeholderTextColor={colors.line3}
        style={{ minHeight: 52, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: phraseOk ? colors.danger : colors.borderStrong, color: colors.text, backgroundColor: colors.c8, fontFamily: fonts.bold, fontSize: 16, letterSpacing: 1 }}/>
      {confirmation.length > 0 && !phraseOk && <Text style={[styles.muted, { color: colors.danger }]}>{`The phrase must match ${DELETE_PHRASE} exactly.`}</Text>}
      <Text style={[styles.label, { marginTop: 8 }]}>2 · Confirm it is you</Text>
      {!verified && <Button title={busy ? 'Please wait…' : verificationReady ? 'Send a new code' : 'Send verification code'} disabled={busy || !phraseOk} onPress={sendCode}/>}
      {verificationReady && !verified && <><Field label="Email verification code" value={code} onChangeText={setCode} keyboardType="numeric"/><Button title="Verify code" disabled={busy || !code.trim()} onPress={verifyCode}/></>}
      {verified && <Text style={styles.muted}>Identity verified.</Text>}
      <Text style={[styles.label, { marginTop: 8 }]}>3 · Delete</Text>
      <Button title="Permanently delete account" kind="danger" disabled={busy || !verified || !phraseOk} onPress={submit}/>
    </Card>}
    {!!notice && <Text style={styles.muted}>{notice}</Text>}
    <View><Button title="Keep my account" kind="ghost" onPress={() => router.back()}/></View>
  </Page>;
}
