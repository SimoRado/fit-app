import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useAuth, useUser } from '@clerk/expo';
import { api } from '../../convex/_generated/api';
import { dayKey, uid } from '../core/date';
import { ageOnDay } from '../../shared/ageEligibility';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legalVersions';
import { validateProfileValues } from '../core/validation';
import { Language, Profile } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Field, message, MultiChoices, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { MotionPressable } from '../ui/MotionPressable';
import { colors, fonts } from '../ui/theme';
import { BirthDateField } from '../ui/BirthDateField';
import { LegalAgreementChoice } from '../ui/LegalAgreements';

export default function Onboarding() {
  const { refresh, profile: existingProfile, setLanguage: applyLanguage } = useApp();
  const { user } = useUser();
  const { signOut } = useAuth();
  const acceptEligibility = useMutation(api.eligibility.accept);
  const rejectEligibility = useMutation(api.eligibility.reject);
  const [name, setName] = useState(''), [birth, setBirth] = useState(''), [height, setHeight] = useState(''), [weight, setWeight] = useState(''), [target, setTarget] = useState('');
  const [experience, setExperience] = useState('Beginner'), [goal, setGoal] = useState('Improve general fitness'), [growth, setGrowth] = useState<string[]>(['Build discipline']), [language, setLanguage] = useState<Language>('en');
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false), [underage, setUnderage] = useState(false);
  useEffect(() => { if (!name && user?.fullName) setName(user.fullName); }, [name, user?.fullName]);
  useEffect(() => { if (existingProfile) router.replace('/(tabs)'); }, [existingProfile]);

  function values() {
    return validateProfileValues({ name, birth_date: birth, height_cm: Number(height), start_weight: Number(weight), target_weight: target ? Number(target) : null });
  }
  async function next() {
    if (busy) return;
    try {
      if (step === 0 && (!name.trim() || !birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth))) throw Error('Enter your full name and date of birth.');
      if (step === 0) {
        const age = ageOnDay(birth, dayKey());
        if (age !== null && age < 18) {
          setBusy(true);
          try { await repo.setPreference('age_rejected', 'true'); } catch (error) { message(error); }
          try { await rejectEligibility({}); } catch { /* The account-local rejection remains in place while offline. */ }
          try { await refresh(); } catch { /* Keep the rejection screen available if profile refresh fails. */ }
          setUnderage(true);
          setBusy(false);
          return;
        }
        validateProfileValues({ name, birth_date: birth, height_cm: 170, start_weight: 70, target_weight: null });
      }
      if (step === 1) values();
      if (step === 2 && !growth.length) throw Error('Select at least one personal growth goal.');
      setStep(value => Math.min(3, value + 1));
    } catch (error) { message(error); }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      if (!legalAccepted) throw Error('Agree to the Terms of Use before continuing.');
      if (await repo.profile()) { await refresh(); router.replace('/(tabs)'); return; }
      const valid = values();
      if (!growth.length) throw Error('Select at least one personal growth goal.');
      await acceptEligibility({ birthDate: valid.birth_date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true });
      const profile: Profile = { id: uid(), ...valid, experience, fitness_goal: goal, growth_goals: growth.join(','), language, completed_at: new Date().toISOString() };
      await repo.createProfile(profile); await repo.setPreference('terms_accepted_version', TERMS_VERSION); await refresh(); router.replace('/(tabs)');
    } catch (error) { message(error); } finally { setBusy(false); }
  }

  if (underage) return <Page title="Age eligibility"><Card>
    <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 23 }}>Cubyfit is for adults aged 18 and older.</Text>
    <Text style={styles.muted}>You’re not eligible to create a Cubyfit account at this time.</Text>
    <Button title="Return to welcome" onPress={() => { void signOut().then(() => router.replace('/(auth)/welcome')).catch(message); }}/>
  </Card></Page>;

  return <Page key={step} title={step === 0 ? "Let's get to know you" : step === 3 ? 'Review your details' : 'Your starting point'}>
    {/* Volt onboarding: segmented step bar + eyebrow */}
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: step + 1 }} style={{ flexDirection: 'row', gap: 6 }}>{[0, 1, 2, 3].map(index => <View key={index} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: index <= step ? colors.g1 : colors.qTrack }}/>)}</View>
    <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>{'STEP ' + (step + 1) + ' OF 4'}</Text>
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
      <Choices label="Experience" options={['Beginner', 'Intermediate', 'Advanced']} value={experience} onChange={setExperience} equalRow/>
      <Text style={styles.label}>Fitness goal</Text>
      <View style={{ gap: 8 }}>{([['Lose weight', 'scale-outline', 'A gentle, sustainable deficit'], ['Gain muscle', 'barbell-outline', 'Build strength with a small surplus'], ['Improve general fitness', 'pulse-outline', 'Train regularly, recover well'], ['Maintain current fitness', 'shield-checkmark-outline', 'Stay steady and balanced']] as const).map(([option, icon, detail]) => {
        const on = goal === option;
        return <MotionPressable key={option} selected={on} pressScale={0.98} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setGoal(option)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.c8, borderWidth: 1.5, borderColor: on ? colors.text : colors.c8Line }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light ? colors.paleBlue : colors.soft1 }}><Ionicons name={icon} size={18} color={colors.accent}/></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{option}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{detail}</Text></View>
          {on && <Ionicons name="checkmark" size={20} color={colors.text}/>}
        </MotionPressable>;
      })}</View>
      <MultiChoices label="Personal growth goals" options={['Build discipline', 'Improve consistency', 'Build healthier habits', 'Improve productivity']} value={growth} onChange={setGrowth} columns/>
    </Card>}
    {step === 3 && <Card>
      <Text style={styles.label}>Full name</Text><Text style={styles.text}>{name}</Text><Text style={styles.label}>Date of birth</Text><Text style={styles.text}>{birth}</Text>
      <Text style={styles.label}>Height (cm)</Text><Text style={styles.text}>{height} cm</Text>
      <Text style={styles.label}>Current weight (kg)</Text><Text style={styles.text}>{weight} kg</Text>
      <Text style={styles.label}>Target weight (kg, optional)</Text><Text style={styles.text}>{target || 'Not set'}</Text>
      <Text style={styles.label}>Fitness goal</Text><Text style={styles.text}>{goal}</Text>
      <Text style={styles.label}>Personal growth goals</Text>{growth.map(item => <Text key={item} style={styles.text}>· {item}</Text>)}
    </Card>}
    {step === 3 && <Card><Text style={styles.label}>Legal agreements</Text><LegalAgreementChoice checked={legalAccepted} onChange={setLegalAccepted}/></Card>}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>{step > 0 && <Button title="Back" kind="ghost" onPress={() => setStep(value => value - 1)}/>}<View style={{ flex: 1 }}><Button title={step === 3 ? busy ? 'Saving…' : "Let's Begin" : 'Continue  →'} onPress={step === 3 ? save : next} disabled={busy || (step === 3 && !legalAccepted)}/></View></View>
  </Page>;
}
