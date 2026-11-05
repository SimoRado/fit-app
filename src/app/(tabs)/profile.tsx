import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Language } from '../../core/types';
import { validateProfileValues } from '../../core/validation';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Choices, Field, message, MultiChoices, Page, styles, notify, confirm } from '../../ui/components';
import { Text } from '../../ui/LocalizedText';
import { colors, fonts } from '../../ui/theme';
import { weightSummary } from '../../core/logic';
import { DisplayMetric } from '../../ui/DisplayMetric';
import { SectionHeader } from '../../ui/visuals';
import { useAuth, useUser } from '@clerk/expo';
import { clearAccountReminders } from '../../services/reminders';
import { ensureNoPendingBeforeLocalDelete } from '../../data/syncLocal';
import { BirthDateField } from '../../ui/BirthDateField';

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { profile, revision, refresh } = useApp();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [height, setHeight] = useState('');
  const [target, setTarget] = useState('');
  const [experience, setExperience] = useState('Beginner');
  const [goal, setGoal] = useState('Improve general fitness');
  const [growth, setGrowth] = useState<string[]>(['Build discipline']);
  const [language, setLanguage] = useState<Language>('en');
  const [summary, setSummary] = useState<{ weight: number | null; workouts: number; habits: number }>({ weight: null, workouts: 0, habits: 0 });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name); setBirth(profile.birth_date); setHeight(String(profile.height_cm));
    setTarget(String(profile.target_weight ?? '')); setExperience(profile.experience);
    setGoal(profile.fitness_goal); setGrowth(profile.growth_goals.split(',').filter(Boolean)); setLanguage(profile.language);
  }, [profile]);
  useEffect(() => {
    Promise.all([repo.weights(), repo.trainingWorkouts(), repo.habits()]).then(([weights, workouts, habits]) => setSummary({ weight: weightSummary(weights).latest?.kg ?? null, workouts: workouts.length, habits: habits.filter(habit => !habit.archived).length })).catch(message);
  }, [revision]);

  async function save() {
    try {
      if (!profile || growth.length === 0) throw Error('Check name, birth date, height and target weight.');
      const values = validateProfileValues({ name, birth_date: birth, height_cm: Number(height), start_weight: profile.start_weight, target_weight: target ? Number(target) : null });
      await repo.saveProfile({ ...profile, ...values, experience, fitness_goal: goal, growth_goals: growth.join(','), language });
      await refresh(); setEditing(false); notify('Saved', 'Profile updated.');
    } catch (error) { message(error); }
  }

  function clear() {
    confirm('Delete this account’s local data?', async () => {
      try { await ensureNoPendingBeforeLocalDelete(); await clearAccountReminders(); await repo.clear(); await refresh(); router.replace('/onboarding'); }
      catch (error) { message(error); }
    }, 'This permanently removes this account’s fitness profile and history from this device. It does not delete cloud records, your Clerk account, or cancel a RevenueCat subscription. Guest and other signed-in accounts’ local files remain.', 'Delete local data');
  }

  return <Page title="Profile">
    <View style={{ alignItems: 'center', gap: 9, paddingVertical: 12 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.card2, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 47 }}>{profile?.name?.slice(0, 1).toUpperCase() ?? '×'}</Text></View>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 45, lineHeight: 48, textAlign: 'center', textTransform: 'uppercase' }}>{profile?.name}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{profile?.fitness_goal} · {profile?.experience}</Text>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
      ['Weight', summary.weight ?? '—', 'KG'], ['Height (cm)', profile?.height_cm ?? '—', 'CM'], ['Workouts', summary.workouts, ''], ['Habits', summary.habits, ''],
    ].map(([label, value, unit]) => <View key={label} style={{ width: '48.5%', minHeight: 110, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 5 }}><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase' }}>{label}</Text><DisplayMetric value={value} label={String(unit)} size={48}/></View>)}</View>
    <SectionHeader title="Settings"/>
    <Card><Text style={styles.label}>Signed-in account</Text><Text style={styles.text}>{user?.fullName || user?.firstName || 'Account'}</Text><Text style={styles.muted}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text><Button title="Manage account" kind="ghost" onPress={() => router.push('/account')}/><Button title="Sign out" kind="ghost" onPress={async () => { try { await signOut(); await clearAccountReminders(); } catch (error) { message(error); } }}/></Card>
    {[
      { label: 'Edit profile', detail: profile?.name ?? '', icon: 'person-outline' as const, action: () => setEditing(value => !value) },
      { label: 'Personal growth goals', detail: growth.join(' · '), icon: 'flag-outline' as const, action: () => setEditing(true) },
      { label: 'Language', detail: language === 'fr' ? 'Français' : language === 'ar' ? 'العربية' : 'English', icon: 'language-outline' as const, action: () => setEditing(true) },
      { label: 'Reminder settings', detail: '', icon: 'notifications-outline' as const, action: () => router.push('/reminders') },
      { label: 'Premium — Test Subscriptions', detail: 'RevenueCat Test Store', icon: 'diamond-outline' as const, action: () => router.push('/premium-test') },
      { label: 'Data & Privacy', detail: 'Cloud sync and local data', icon: 'shield-checkmark-outline' as const, action: () => router.push('/cloud-sync') },
    ].map(item => <Pressable key={item.label} accessibilityRole="button" onPress={item.action} style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}><Ionicons name={item.icon} size={22} color={colors.accent}/><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{item.label}</Text>{!!item.detail && <Text numberOfLines={1} style={styles.muted}>{item.detail}</Text>}</View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}
    {editing && <Card>
      <Text style={styles.muted}>Fitness profile · stored on this device</Text>
      <Field label="Display name" value={name} onChangeText={setName}/>
      <BirthDateField value={birth} onChangeText={setBirth}/>
      <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad"/>
      <Field label="Target weight (kg, optional)" value={target} onChangeText={setTarget} keyboardType="decimal-pad"/>
      <Choices label="Experience" options={['Beginner', 'Intermediate', 'Advanced']} value={experience} onChange={setExperience}/>
      <Choices label="Fitness goal" options={['Lose weight', 'Gain muscle', 'Improve general fitness', 'Maintain current fitness']} value={goal} onChange={setGoal}/>
      <MultiChoices label="Personal growth goals" options={['Build discipline', 'Improve consistency', 'Build healthier habits', 'Improve productivity']} value={growth} onChange={setGrowth}/>
      <Choices label="Language" options={['en', 'fr', 'ar'] as const} value={language} onChange={setLanguage}/>
      <Button title="Save profile" onPress={save}/>
    </Card>}
    <Button title="Delete this account’s local data" kind="danger" onPress={clear}/>
  </Page>;
}
