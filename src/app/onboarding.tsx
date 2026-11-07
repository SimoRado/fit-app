import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { uid } from '../core/date';
import { validateProfileValues } from '../core/validation';
import { Language, Profile } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Field, message, MultiChoices, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { ProgressBar } from '../ui/visuals';
import { colors, fonts } from '../ui/theme';
import { BirthDateField } from '../ui/BirthDateField';
import { useUser } from '@clerk/expo';

export default function Onboarding() {
  const { refresh, profile: existingProfile, setLanguage: applyLanguage } = useApp();
  const { user } = useUser();
  const [name, setName] = useState(''), [birth, setBirth] = useState(''), [height, setHeight] = useState(''), [weight, setWeight] = useState(''), [target, setTarget] = useState('');
  const [experience, setExperience] = useState('Beginner'), [goal, setGoal] = useState('Improve general fitness'), [growth, setGrowth] = useState<string[]>(['Build discipline']), [language, setLanguage] = useState<Language>('en');
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => { if (!name && user?.fullName) setName(user.fullName); }, [name, user?.fullName]);
  useEffect(() => { if (existingProfile) router.replace('/(tabs)'); }, [existingProfile]);

  function values() {
    return validateProfileValues({ name, birth_date: birth, height_cm: Number(height), start_weight: Number(weight), target_weight: target ? Number(target) : null });
  }
  function next() {
    try {
      if (step === 0 && (!name.trim() || !birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth))) throw Error('Enter your full name and date of birth.');
      if (step === 0) validateProfileValues({ name, birth_date: birth, height_cm: 170, start_weight: 70, target_weight: null });
      if (step === 1) values();
      if (step === 2 && !growth.length) throw Error('Select at least one personal growth goal.');
      setStep(value => Math.min(3, value + 1));
    } catch (error) { message(error); }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      if (await repo.profile()) { await refresh(); router.replace('/(tabs)'); return; }
      const valid = values();
      if (!growth.length) throw Error('Select at least one personal growth goal.');
      const profile: Profile = { id: uid(), ...valid, experience, fitness_goal: goal, growth_goals: growth.join(','), language, completed_at: new Date().toISOString() };
      await repo.createProfile(profile); await refresh(); router.replace('/(tabs)');
    } catch (error) { message(error); } finally { setBusy(false); }
  }

  return <Page key={step} title={step === 0 ? "Let's get to know you" : step === 3 ? 'Review your details' : 'Your starting point'}>
    <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1 }}>{'Step ' + (step + 1) + ' of 4'}</Text>
    <ProgressBar value={(step + 1) / 4}/>
    <Text style={styles.muted}>Progress over perfection. Become better, one day at a time.</Text>
    <Text style={styles.muted}>Any history from before sign-in is preserved separately on this device. It is not added to your account automatically.</Text>
    <Button title="Restore from cloud or manage guest data" kind="ghost" onPress={() => router.push('/cloud-sync')}/>
    {step === 0 && <Card><Field label="Full name" value={name} onChangeText={setName}/><BirthDateField value={birth} onChangeText={setBirth}/></Card>}
    {step === 1 && <Card>
      <Choices label="Language" options={['en', 'fr', 'ar'] as const} value={language} onChange={nextLanguage => { setLanguage(nextLanguage); applyLanguage(nextLanguage); }}/>
      <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad"/>
      <Field label="Current weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad"/>
      <Field label="Target weight (kg, optional)" value={target} onChangeText={setTarget} keyboardType="decimal-pad"/>
    </Card>}
    {step === 2 && <Card>
      <Choices label="Experience" options={['Beginner', 'Intermediate', 'Advanced']} value={experience} onChange={setExperience}/>
      <Choices label="Fitness goal" options={['Lose weight', 'Gain muscle', 'Improve general fitness', 'Maintain current fitness']} value={goal} onChange={setGoal}/>
      <MultiChoices label="Personal growth goals" options={['Build discipline', 'Improve consistency', 'Build healthier habits', 'Improve productivity']} value={growth} onChange={setGrowth}/>
    </Card>}
    {step === 3 && <Card>
      <Text style={styles.label}>Full name</Text><Text style={styles.text}>{name}</Text><Text style={styles.label}>Date of birth</Text><Text style={styles.text}>{birth}</Text>
      <Text style={styles.label}>Height (cm)</Text><Text style={styles.text}>{height} cm</Text>
      <Text style={styles.label}>Current weight (kg)</Text><Text style={styles.text}>{weight} kg</Text>
      <Text style={styles.label}>Target weight (kg, optional)</Text><Text style={styles.text}>{target || 'Not set'}</Text>
      <Text style={styles.label}>Fitness goal</Text><Text style={styles.text}>{goal}</Text>
      <Text style={styles.label}>Personal growth goals</Text>{growth.map(item => <Text key={item} style={styles.text}>· {item}</Text>)}
    </Card>}
    <View style={styles.row}>{step > 0 && <Button title="Back" kind="ghost" onPress={() => setStep(value => value - 1)}/>}<Button title={step === 3 ? busy ? 'Saving…' : "Let's Begin" : 'Continue'} onPress={step === 3 ? save : next} disabled={busy}/></View>
  </Page>;
}
