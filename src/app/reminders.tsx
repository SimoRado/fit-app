import React, { useEffect, useState } from 'react';
import { Text } from '../ui/LocalizedText';
import { repo } from '../data/db';
import { requestReminderPermission, reconcileReminders } from '../services/reminders';
import { useApp } from '../state/app';
import { Button, Card, Field, message, Page, styles } from '../ui/components';

export default function Reminders() {
  const { changed, language } = useApp();
  const [prefs, setPrefs] = useState<Record<string, string>>({ habit_reminders: 'off', workout_reminders: 'off', motivation_reminders: 'off', workout_time: '18:00', motivation_time: '08:00' });
  useEffect(() => { repo.preferences().then(rows => setPrefs(previous => ({ ...previous, ...Object.fromEntries(rows.map(row => [row.key, row.value])) }))).catch(message); }, []);
  async function toggle(kind: string) {
    const key = `${kind}_reminders`;
    const previous = prefs[key] ?? 'off';
    const next = previous === 'on' ? 'off' : 'on';
    try {
      if (next === 'on' && !(await requestReminderPermission(language))) throw Error('Notification permission was not granted.');
      await repo.setPreference(key, next);
      try { await reconcileReminders(); }
      catch (cause) { await repo.setPreference(key, previous); throw cause; }
      setPrefs(values => ({ ...values, [key]: next }));
      changed();
    } catch (cause) { message(cause); }
  }
  async function saveTime(kind: string) {
    const key = `${kind}_time`;
    const time = prefs[key];
    try {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Use HH:MM in local time.');
      const previous = (await repo.preferences()).find(row => row.key === key)?.value;
      await repo.setPreference(key, time);
      try { await reconcileReminders(); }
      catch (cause) { if (previous) await repo.setPreference(key, previous); throw cause; }
      changed();
    } catch (cause) { message(cause); }
  }
  return <Page title="Reminders">
    <Text style={styles.subtitle}>Reminders use your device&apos;s local time. Permission is requested only when you enable one.</Text>
    {['habit', 'workout', 'motivation'].map(kind => <Card key={kind}>
      <Text style={styles.text}>{kind[0].toUpperCase() + kind.slice(1)} reminders</Text>
      <Button title={prefs[`${kind}_reminders`] === 'on' ? 'Disable' : 'Enable'} kind={prefs[`${kind}_reminders`] === 'on' ? 'primary' : 'ghost'} onPress={() => toggle(kind)}/>
      {kind !== 'habit' && <><Field label="Time (HH:MM)" value={prefs[`${kind}_time`]} onChangeText={value => setPrefs(values => ({ ...values, [`${kind}_time`]: value }))}/><Button title="Save time" kind="ghost" onPress={() => saveTime(kind)}/></>}
      {kind === 'habit' && <Text style={styles.muted}>Set each habit&apos;s time in its edit screen.</Text>}
    </Card>)}
  </Page>;
}
