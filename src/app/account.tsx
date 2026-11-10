import React, { useState } from 'react';
import { useAuth, useUser } from '@clerk/expo';
import { useConvexAuth, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { api } from '../../convex/_generated/api';
import { clearAccountReminders } from '../services/reminders';
import { Button, Card, Field, message, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';

export default function Account() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const identity = useQuery(api.identity.current, isAuthenticated ? {} : 'skip');
  const [name, setName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  async function save() { try { if (!user || !name.trim() || !lastName.trim()) throw new Error('Enter your first and last name.'); await user.update({ firstName: name.trim(), lastName: lastName.trim() }); } catch (error) { message(error); } }
  const connected = isAuthenticated && identity?.subject === user?.id;
  return <Page title="Account">
    <Card><Text style={styles.label}>Email</Text><Text style={styles.text}>{user?.primaryEmailAddress?.emailAddress ?? '—'}</Text>
      <Text style={styles.label}>Account name</Text><Field label="First name" value={name} onChangeText={setName}/><Field label="Last name" value={lastName} onChangeText={setLastName}/><Button title="Save account name" onPress={save}/>
    </Card>
    <Card><Text style={styles.label}>Cloud connection</Text><Text style={styles.text}>{connected ? 'Connected to your account' : isLoading ? 'Connecting…' : 'Offline or awaiting authentication'}</Text>
      <Text style={styles.muted}>Your existing local fitness history stays on this device. Cloud upload is not enabled.</Text></Card>
    <Card><Text style={styles.label}>Account settings</Text>
      <Button title="Fitness profile" kind="ghost" onPress={() => router.push('/(tabs)/profile')}/>
      <Button title="Premium — Test Subscriptions" kind="ghost" onPress={() => router.push('/premium-test')}/>
      <Button title="Data & Privacy" kind="ghost" onPress={() => router.push('/cloud-sync')}/>
      <Button title="Sign out" kind="ghost" onPress={async () => { try { await signOut(); await clearAccountReminders(); } catch (error) { message(error); } }}/>
    </Card>
  </Page>;
}
