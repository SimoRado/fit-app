import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { useApp } from '../state/app';
import { useSync } from '../state/sync';
import { adoptGuestData, localRecordCount } from '../data/syncLocal';

export default function CloudSync() {
  const sync = useSync();
  const { profile, refresh } = useApp();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { localRecordCount().then(setCount).catch(() => setCount(null)); }, [profile]);
  function importGuest() {
    Alert.alert('Import preserved guest history?', 'Only continue if the guest records on this device are yours. They will be copied into this signed-in account and the original guest file will remain. Cloud upload will not start from this import.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy my guest data', onPress: () => { void adoptGuestData().then(async () => { await refresh(); Alert.alert('Import complete', 'Your guest records were copied. Choose cloud backup separately if you want them uploaded.'); }).catch(error => Alert.alert('Import not completed', error instanceof Error ? error.message : 'Please try again.')); } },
    ]);
  }
  const status = sync.choice !== 'enabled' ? 'Stored on this device' : sync.phase === 'synced' ? 'Synced' : sync.phase === 'syncing' ? 'Syncing' : sync.phase === 'offline' ? 'Offline — changes remain on this device' : sync.phase === 'waiting' ? 'Waiting for authenticated cloud connection' : sync.phase === 'conflict' ? 'Conflict requires attention' : sync.phase === 'error' ? 'Sync error' : 'Pending changes';
  return <Page title="Data & Privacy">
    <Card><Text style={styles.label}>Cloud Sync</Text><Text style={styles.text}>{status}</Text><Text style={styles.muted}>Local records: {count ?? 'checking…'} · Pending changes: {sync.pending} · Conflicts: {sync.conflicts}</Text>
      <Text style={styles.muted}>Fitapp saves activity on this device first. Cloud backup uses your signed-in account. It does not move or delete local records.</Text>
      {sync.choice !== 'enabled' && <>
        <Button title="Back up my data" onPress={sync.enable}/>
        <Button title="Keep it on this device" kind="ghost" onPress={sync.keepLocal}/>
        <Button title="Decide later" kind="ghost" onPress={() => router.back()}/>
      </>}
      {sync.choice === 'enabled' && <><Button title="Retry sync" kind="ghost" onPress={sync.retry}/><Button title="Pause cloud sync" kind="ghost" onPress={sync.keepLocal}/></>}
      {!!sync.error && <Text style={styles.muted}>{sync.error}</Text>}
      {sync.conflicts > 0 && <Text style={styles.muted}>Conflicting local changes are preserved. Cloud changes have not overwritten them. Keep both copies until a manual resolution flow is available.</Text>}
    </Card>
    <Card><Text style={styles.label}>Manage Local Data</Text><Text style={styles.muted}>This account has a separate SQLite file. The original guest file and other signed-in accounts remain separate. Local deletion is available on Profile and is blocked while unsynced changes or conflicts remain. Deleting local records does not delete the cloud copy.</Text></Card>
    {!profile && sync.choice !== 'enabled' && <Button title="Import preserved guest history" kind="ghost" onPress={importGuest}/>}
    <Card><Text style={styles.label}>Delete Account</Text><Text style={styles.muted}>Permanently remove this account and its personal data. Subscription cancellation is handled separately by your app store.</Text><Button title="Delete Account" kind="danger" onPress={() => router.push('/delete-account')}/></Card>
    <Button title={profile ? 'Open Fitapp' : 'Continue to fitness onboarding'} kind="ghost" onPress={() => router.replace(profile ? '/(tabs)' : '/onboarding')}/>
  </Page>;
}
