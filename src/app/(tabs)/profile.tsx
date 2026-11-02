import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Language } from '../../core/types';
import { validateProfileValues } from '../../core/validation';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Choices, Field, message, MultiChoices, Page, styles, notify, confirm } from '../../ui/components';
import { Text } from '../../ui/LocalizedText';

export default function ProfileScreen() {
  const { profile, refresh, setLanguage: setAppLanguage } = useApp();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [height, setHeight] = useState('');
  const [target, setTarget] = useState('');
  const [experience, setExperience] = useState('Beginner');
  const [goal, setGoal] = useState('Improve general fitness');
  const [growth, setGrowth] = useState<string[]>(['Build discipline']);
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    if (!profile) return;
    setName(profile.name); setBirth(profile.birth_date); setHeight(String(profile.height_cm));
    setTarget(String(profile.target_weight ?? '')); setExperience(profile.experience);
    setGoal(profile.fitness_goal); setGrowth(profile.growth_goals.split(',').filter(Boolean)); setLanguage(profile.language);
  }, [profile]);

  async function save() {
    try {
      if (!profile || growth.length === 0) throw Error('Check name, birth date, height and target weight.');
      const values = validateProfileValues({ name, birth_date: birth, height_cm: Number(height), start_weight: profile.start_weight, target_weight: target ? Number(target) : null });
      await repo.saveProfile({ ...profile, ...values, experience, fitness_goal: goal, growth_goals: growth.join(','), language });
      await refresh(); notify('Saved', 'Profile updated.');
    } catch (error) { message(error); }
  }

  function clear() {
    confirm('Delete all local data?', async () => {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); await repo.clear(); await refresh(); router.replace('/onboarding'); }
      catch (error) { message(error); }
    }, 'This removes your profile and all tracking records from this device.', 'Delete all data');
  }

  return <Page title="Profile & settings">
    <Card>
      <Text style={styles.muted}>Local profile · no account required</Text>
      <Field label="Display name" value={name} onChangeText={setName}/>
      <Field label="Date of birth (YYYY-MM-DD)" value={birth} onChangeText={setBirth}/>
      <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad"/>
      <Field label="Target weight (kg, optional)" value={target} onChangeText={setTarget} keyboardType="decimal-pad"/>
      <Choices label="Experience" options={['Beginner', 'Intermediate', 'Advanced']} value={experience} onChange={setExperience}/>
      <Choices label="Fitness goal" options={['Lose weight', 'Gain muscle', 'Improve general fitness', 'Maintain current fitness']} value={goal} onChange={setGoal}/>
      <MultiChoices label="Personal growth goals" options={['Build discipline', 'Improve consistency', 'Build healthier habits', 'Improve productivity']} value={growth} onChange={setGrowth}/>
      <Choices label="Language" options={['en', 'fr', 'ar'] as const} value={language} onChange={next => { setLanguage(next); setAppLanguage(next); }}/>
      <Button title="Save profile" onPress={save}/>
    </Card>
    <Button title="Reminder settings" kind="ghost" onPress={() => router.push('/reminders')}/>
    <Button title="Delete all local data" kind="danger" onPress={clear}/>
  </Page>;
}
