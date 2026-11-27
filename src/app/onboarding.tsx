import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useUser } from '@clerk/expo';
import { api } from '../../convex/_generated/api';
import { dayKey, uid } from '../core/date';
import { ageOnDay } from '../../shared/ageEligibility';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legalVersions';
import { validateProfileValues } from '../core/validation';
import { Language, Profile } from '../core/types';
import { repo } from '../data/db';
import { STYLE_MODE_KEY, useApp, usePersonalization } from '../state/app';
import { prefKeys, type Sex } from '../core/nutritionTargets';
import { startingPointComplete, startingPointIssue } from '../core/onboardingProfile';
import { useSegmentThumb } from '../ui/segmentMotion';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useReducedMotion } from '../ui/motion';
import { Button, Card, Choices, Field, message, MultiChoices, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { PageTitle } from '../ui/voltKit';
import { localize } from '../core/i18n';
import { birthEligibility, canBeginProfile, languageOptions, reviewEditStep } from '../core/authMode';
import { Ionicons } from '@expo/vector-icons';
import { MotionPressable, TapPressable as Pressable } from '../ui/MotionPressable';
import { colors, fonts } from '../ui/theme';
import { BirthDateField } from '../ui/BirthDateField';
import { LegalAgreementChoice } from '../ui/LegalAgreements';

export default function Onboarding() {
  const { refresh, profile: existingProfile, language: appLanguage, setLanguage: applyLanguage } = useApp();
  const { user } = useUser();
  const acceptEligibility = useMutation(api.eligibility.accept);
  const [name, setName] = useState(''), [birth, setBirth] = useState(''), [height, setHeight] = useState(''), [weight, setWeight] = useState(''), [target, setTarget] = useState('');
  const [experience, setExperience] = useState('Beginner'), [goal, setGoal] = useState('Improve general fitness'), [growth, setGrowth] = useState<string[]>(['Build discipline']), [language, setLanguage] = useState<Language>(appLanguage);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  // Required, never preselected: the existing body.sex value (calorie estimates only, never colours).
  const [sex, setSex] = useState<Sex | null>(null);
  const { style } = usePersonalization();
  useEffect(() => { if (!name && user?.fullName) setName(user.fullName); }, [name, user?.fullName]);
  useEffect(() => { if (existingProfile) router.replace('/(tabs)'); }, [existingProfile]);

  function values() {
    return validateProfileValues({ name, birth_date: birth, height_cm: Number(height), start_weight: Number(weight), target_weight: target ? Number(target) : null });
  }
  const birthStatus = birthEligibility(birth, dayKey(), ageOnDay);
  async function next() {
    if (busy) return;
    try {
      if (step === 0 && (!name.trim() || !birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth))) throw Error('Enter your full name and date of birth.');
      if (step === 0) {
        // Underage or invalid birthdays never advance and nothing is submitted to eligibility endpoints;
        // the server still enforces 18+ when `eligibility.accept` runs at the final step.
        if (birthStatus !== 'adult') return;
        validateProfileValues({ name, birth_date: birth, height_cm: 170, start_weight: 70, target_weight: null });
      }
      if (step === 1) { const issue = startingPointIssue({ sex, height, weight, target }); if (issue) throw Error(issue); values(); }
      if (step === 2 && !growth.length) throw Error('Select at least one personal growth goal.');
      setStep(value => Math.min(3, value + 1));
    } catch (error) { message(error); }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      if (!canBeginProfile(legalAccepted, false)) throw Error('Agree to the Terms of Use before continuing.');
      if (await repo.profile()) { await refresh(); router.replace('/(tabs)'); return; }
      const valid = values();
      if (!growth.length) throw Error('Select at least one personal growth goal.');
      await acceptEligibility({ birthDate: valid.birth_date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true });
      const profile: Profile = { id: uid(), ...valid, experience, fitness_goal: goal, growth_goals: growth.join(','), language, completed_at: new Date().toISOString() };
      if (!sex || !valid.target_weight) throw Error(startingPointIssue({ sex, height, weight, target }) ?? 'Enter your target weight.');
      await repo.createProfile(profile); await repo.setPreference('terms_accepted_version', TERMS_VERSION);
      await repo.setPreference(prefKeys.sex, sex);
      // New profiles keep the colours they chose explicitly; sex never selects a theme.
      await repo.setPreference(STYLE_MODE_KEY, style); await refresh(); router.replace('/(tabs)');
    } catch (error) { message(error); } finally { setBusy(false); }
  }

  const ageBlocked = step === 0 && birthStatus !== 'adult';
  const startingBlocked = step === 1 && !startingPointComplete({ sex, height, weight, target });
  const titles = ["Let's get to know you", 'Your starting point', 'Your goals', 'Review your details'];
  const details = ['Progress over perfection. Become better, one day at a time.', 'Tell us where you are starting from.', 'What would you like to focus on?', 'Check everything looks right, then let’s begin.'];
  const ready = canBeginProfile(legalAccepted, busy);
  const footer = <>
    {step > 0 && <View style={{ flex: 1 }}><Button title="Back" kind="ghost" onPress={() => setStep(value => value - 1)}/></View>}
    <View style={{ flex: 2 }}><Button title={step === 3 ? busy ? 'Saving…' : "Let's Begin" : 'Continue  →'} onPress={step === 3 ? save : next} disabled={step === 3 ? !ready : busy || ageBlocked || startingBlocked}/></View>
  </>;
  const edit = (target: number) => <Pressable accessibilityRole="button" accessibilityLabel={localize('Edit', appLanguage)} hitSlop={8} onPress={() => setStep(target)}><Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 13 }}>Edit</Text></Pressable>;
  const summaryRow = (label: string, value: string) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text><Text style={{ flexShrink: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 14, textAlign: 'right' }}>{value}</Text></View>;
  const tile = (value: string, unit: string, label: string) => <View key={label} style={{ flex: 1, minHeight: 66, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light ? colors.soft1 : colors.card2, paddingVertical: 8 }}>
    <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 21 }}>{value}<Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 12 }}>{unit}</Text></Text>
    <Text style={{ color: colors.muted, fontSize: 11.5 }}>{label}</Text>
  </View>;
  const eyebrow = (label: string) => <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' }}>{label}</Text>;

  return <Page key={step} title="" footer={footer}>
    {/* Top row: back, step counter and guest-data shortcut. */}
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {step > 0 && <MotionPressable pressScale={0.9} accessibilityRole="button" accessibilityLabel={localize('Back', appLanguage)} hitSlop={6} onPress={() => setStep(value => value - 1)} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.c8, ...(colors.light ? { boxShadow: '0px 2px 10px rgba(11,20,70,0.12)' } : { borderWidth: 1, borderColor: colors.borderStrong }) }}><Ionicons name={appLanguage === 'ar' ? 'chevron-forward' : 'chevron-back'} size={18} color={colors.text}/></MotionPressable>}
      <Text style={{ flex: 1, color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9 }}>{'STEP ' + (step + 1) + ' OF 4'}</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: step + 1 }} style={{ flexDirection: 'row', gap: 6 }}>{[0, 1, 2, 3].map(index => <View key={index} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: index <= step ? colors.g1 : colors.qTrack }}/>)}</View>
    <View style={{ gap: 8 }}>
      <PageTitle title={titles[step]} size={34}/>
      <Text style={[styles.muted, { marginTop: -4 }]}>{details[step]}</Text>
    </View>
    {step === 0 && <>
      <Card><Field label="Full name" value={name} onChangeText={setName}/><BirthDateField value={birth} onChangeText={setBirth}/>
        {birthStatus === 'underage' && <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="alert-circle" size={16} color={colors.danger}/><Text style={{ flex: 1, color: colors.danger, fontFamily: fonts.semibold, fontSize: 13 }}>You must be at least 18 years old to continue.</Text></View>}
        {birthStatus !== 'underage' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="information-circle-outline" size={15} color={colors.muted}/><Text style={{ flex: 1, color: colors.muted, fontSize: 12.5 }}>You must be 18 or older to use Cubyfit.</Text></View>}
      </Card>
      {/* Only pre-profile entry to cloud restore and guest-history import (both need no profile yet). */}
      <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/cloud-sync')} style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Used Cubyfit before? <Text style={{ color: colors.accent, fontFamily: fonts.bold }}>Restore your data</Text></Text>
      </Pressable>
    </>}
    {step === 1 && <Card>
      <Choices label="Language" options={['en', 'fr', 'ar'] as const} value={language} onChange={nextLanguage => { setLanguage(nextLanguage); applyLanguage(nextLanguage); }}/>
      <SexSelector value={sex} onChange={setSex} rtl={appLanguage === 'ar'}/>
      <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad"/>
      <Field label="Current weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad"/>
      <Field label="Target weight (kg)" value={target} onChangeText={setTarget} keyboardType="decimal-pad"/>
    </Card>}
    {step === 2 && <Card>
      <Choices label="Experience" options={['Beginner', 'Intermediate', 'Advanced']} value={experience} onChange={setExperience} equalRow/>
      <Text style={styles.label}>Fitness goal</Text>
      <View style={{ gap: 8 }}>{([['Lose weight', 'scale-outline', 'A gentle, sustainable deficit'], ['Gain muscle', 'barbell-outline', 'Build strength with a small surplus'], ['Improve general fitness', 'pulse-outline', 'Train regularly, recover well'], ['Maintain current fitness', 'shield-checkmark-outline', 'Stay steady and balanced']] as const).map(([option, icon, detail]) => {
        const on = goal === option;
        return <MotionPressable key={option} selected={on} pressScale={0.98} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setGoal(option)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.c8, borderWidth: 1.5, borderColor: on ? colors.accent : colors.c8Line }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light ? colors.paleBlue : colors.soft1 }}><Ionicons name={icon} size={18} color={colors.accent}/></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{option}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{detail}</Text></View>
          {on && <Ionicons name="checkmark-circle" size={21} color={colors.accent}/>}
        </MotionPressable>;
      })}</View>
      <MultiChoices label="Personal growth goals" options={['Build discipline', 'Improve consistency', 'Build healthier habits', 'Improve productivity']} value={growth} onChange={setGrowth} columns/>
    </Card>}
    {step === 3 && <>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>{eyebrow('About you')}{edit(reviewEditStep.about)}</View>
        {summaryRow('Name', name.trim())}{summaryRow('Birthday', formatBirthday(birth, appLanguage))}{summaryRow('Sex', sex === 'female' ? 'Female' : sex === 'male' ? 'Male' : '–')}{summaryRow('Language', languageOptions.find(option => option.code === language)?.label ?? language)}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>{eyebrow('Body')}{edit(reviewEditStep.body)}</View>
        <View style={{ flexDirection: 'row', gap: 8 }}>{tile(height, 'cm', 'Height')}{tile(weight, 'kg', 'Weight')}{tile(target || '–', target ? 'kg' : '', 'Target')}</View>
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>{eyebrow('Goals')}{edit(reviewEditStep.goals)}</View>
        {summaryRow('Experience', experience)}{summaryRow('Fitness goal', goal)}{summaryRow('Personal growth goals', growth.map(item => localize(item, appLanguage)).join(', '))}
      </Card>
      <Card><LegalAgreementChoice checked={legalAccepted} onChange={setLegalAccepted}/></Card>
      <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>You can edit all of this later in Profile.</Text>
    </>}
  </Page>;
}

const bcp47: Record<Language, string> = { en: 'en-GB', fr: 'fr-FR', ar: 'ar' };
function formatBirthday(iso: string, language: Language) {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  try { return new Intl.DateTimeFormat(bcp47[language], { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day, 12)); } catch { return iso; }
}

/** Male | Female pill selector (same sliding thumb as other segmented controls); nothing preselected. */
function SexSelector({ value, onChange, rtl }: { value: Sex | null; onChange: (value: Sex) => void; rtl: boolean }) {
  const reduced = useReducedMotion();
  const { onLayout, thumbStyle, cell, measured } = useSegmentThumb(value === 'female' ? 1 : 0, 2, rtl);
  return <View style={{ gap: 7 }}>
    <Text style={styles.label}>Sex</Text>
    <View accessibilityRole="radiogroup" onLayout={onLayout} style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.light ? colors.soft1 : colors.card2 }}>
      {measured && value && <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} pointerEvents="none" style={[{ position: 'absolute', start: 4, top: 4, bottom: 4, width: cell, borderRadius: 999, backgroundColor: colors.c8, ...(colors.light ? { boxShadow: '0px 2px 8px rgba(11,20,70,0.12)' } : { borderWidth: 1, borderColor: colors.borderStrong }) }, thumbStyle]}/>}
      {(['male', 'female'] as const).map(option => {
        const on = value === option;
        return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(option)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}>
          <Text style={{ color: on ? colors.text : colors.muted, fontFamily: fonts.bold, fontSize: 14 }}>{option === 'male' ? 'Male' : 'Female'}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={{ color: colors.muted, fontSize: 12 }}>Used for calorie estimates.</Text>
  </View>;
}
