/**
 * Profile bottom-sheet bodies: goals & tracking, nutrition targets,
 * notifications, language, appearance and edit profile. Each is rendered
 * inside <BottomSheet> by the Profile screen.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Switch, TextInput, View } from 'react-native';
import { NutritionTargetEditor } from './NutritionTargetEditor';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, Choices, Field, message, notify } from './components';
import { MotionPressable, TapPressable as Pressable } from './MotionPressable';
import { fonts, radii, brand } from './theme';
import { usePalette, type VoltIcon } from './voltKit';
import { useApp } from '../state/app';
import type { Language } from '../core/types';
import { validateProfileValues } from '../core/validation';
import { reminderDefaults } from '../core/reminderDefinitions';
import { activities, activityLabels, ageFromBirthDate, estimateTargets, goalLabels, mainGoals, parseAlsoGoals, prefKeys, type Activity, type MainGoal, type Sex, type TargetsMode } from '../core/nutritionTargets';
import { repo } from '../data/db';
import { planInputs, resetToEstimate, setTargetsMode, syncAutoTargets, targetsMode, type PlanInputs } from '../data/nutritionPlan';
import { reconcileReminders, requestReminderPermission } from '../services/reminders';

type Close = (after?: () => void) => void;
const num = (value: number) => Math.round(value).toLocaleString('en-US');

export const goalDetails: Record<MainGoal, { icon: VoltIcon; subtitle: string }> = {
  lose: { icon: 'scale-outline', subtitle: 'A gentle, sustainable deficit' },
  gain: { icon: 'barbell-outline', subtitle: 'Build muscle with a small surplus' },
  maintain: { icon: 'radio-button-on-outline', subtitle: 'Stay steady and balanced' },
  performance: { icon: 'trophy-outline', subtitle: 'Train harder, recover well' },
  habits: { icon: 'flame-outline', subtitle: 'Routines first, no weight goal needed' },
};
export const languageNames: Record<Language, string> = { en: 'English', fr: 'Français', ar: 'العربية' };

/* ───────────────────────── shared pieces ───────────────────────── */

export function SheetLabel({ children }: { children: string }) {
  const p = usePalette();
  return <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 4 }}>{children}</Text>;
}

function OptionCard({ title, subtitle, icon, selected, onPress, accessibilityLabel }: { title: string; subtitle: string; icon?: VoltIcon; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const p = usePalette();
  return <MotionPressable selected={selected} pressScale={0.98} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel ?? title} onPress={onPress}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.row, backgroundColor: p.c8, borderWidth: 1.5, borderColor: selected ? p.text : p.c8Line }}>
    {icon && <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: p.light ? p.paleBlue : p.soft1 }}><Ionicons name={icon} size={20} color={p.accent}/></View>}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{title}</Text>
      <Text style={{ color: p.muted, fontSize: 12 }}>{subtitle}</Text>
    </View>
    {selected && <Ionicons name="checkmark" size={20} color={p.text}/>}
  </MotionPressable>;
}

function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const p = usePalette();
  return <MotionPressable selected={selected} pressScale={0.96} accessibilityRole="button" accessibilityState={{ selected, disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radii.pill, backgroundColor: selected ? p.text : p.c8, borderWidth: 1, borderColor: selected ? p.text : p.borderStrong, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color: selected ? p.bg : p.text, fontFamily: fonts.semibold, fontSize: 12.5 }}>{label}</Text>
  </MotionPressable>;
}


function NumberInput({ value, onChangeText, suffix, label }: { value: string; onChangeText: (value: string) => void; suffix?: string; label: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingHorizontal: 14, borderRadius: radii.input, backgroundColor: p.c8, borderWidth: 1, borderColor: p.borderStrong }}>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType="decimal-pad" selectTextOnFocus placeholder="—" placeholderTextColor={p.muted}
      style={{ flex: 1, color: p.text, fontFamily: fonts.bold, fontSize: 16, paddingVertical: 10 }}/>
    {!!suffix && <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{suffix}</Text>}
  </View>;
}

const parseDecimal = (text: string) => { const trimmed = text.trim().replace(',', '.'); return trimmed && /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN; };
const oneDecimal = (value: number) => String(Math.round(value * 10) / 10);

/* ───────────────────────── Goals & tracking ───────────────────────── */

export function GoalsSheet({ close, onSaved }: { close: Close; onSaved: () => void }) {
  const p = usePalette();
  const { profile, refresh } = useApp();
  const [inputs, setInputs] = useState<PlanInputs | null>(null);
  const [mode, setMode] = useState<TargetsMode>('auto');
  const [goal, setGoal] = useState<MainGoal>('maintain');
  const [also, setAlso] = useState<MainGoal[]>([]);
  const [sex, setSex] = useState<Sex | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [updateTargets, setUpdateTargets] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([planInputs(), targetsMode(), repo.preferences()]).then(([next, nextMode, preferences]) => {
      if (!active || !next) return;
      setInputs(next); setMode(nextMode); setUpdateTargets(nextMode === 'auto');
      setGoal(next.goal); setSex(next.sex); setActivity(next.activity);
      setAlso(parseAlsoGoals(preferences.find(item => item.key === prefKeys.alsoGoals)?.value, next.goal));
      setHeight(oneDecimal(next.heightCm)); setWeight(oneDecimal(next.weightKg)); setTarget(next.targetWeightKg ? oneDecimal(next.targetWeightKg) : '');
    }).catch(message);
    return () => { active = false; };
  }, []);
  const showTarget = goal === 'lose' || goal === 'gain' || goal === 'habits';
  const draft = useMemo(() => {
    if (!inputs) return null;
    const w = parseDecimal(weight), h = parseDecimal(height), t = parseDecimal(target);
    if (!(w >= 20 && w <= 500) || !(h >= 80 && h <= 250)) return null;
    return estimateTargets({ ...inputs, weightKg: w, heightCm: h, sex, activity, goal, targetWeightKg: showTarget && t >= 20 && t <= 500 ? t : inputs.targetWeightKg });
  }, [inputs, weight, height, target, sex, activity, goal, showTarget]);
  const age = inputs ? ageFromBirthDate(inputs.birthDate) : null;
  function chooseGoal(next: MainGoal) { setGoal(next); setAlso(items => items.filter(item => item !== next)); }
  function toggleAlso(item: MainGoal) { setAlso(items => items.includes(item) ? items.filter(value => value !== item) : items.length >= 2 ? items : [...items, item]); }

  async function save() {
    if (busy || !profile || !inputs) return;
    try {
      const w = parseDecimal(weight), h = parseDecimal(height), t = target.trim() ? parseDecimal(target) : null;
      if (!(w >= 20 && w <= 500)) throw Error('Weight must be 20–500 kg.');
      if (t !== null && !(t >= 20 && t <= 500)) throw Error('Target weight must be 20–500 kg.');
      const values = validateProfileValues({ name: profile.name, birth_date: profile.birth_date, height_cm: h, start_weight: profile.start_weight, target_weight: showTarget ? t : profile.target_weight });
      setBusy(true);
      await repo.saveProfile({ ...profile, ...values, fitness_goal: goalLabels[goal] });
      if (sex) await repo.setPreference(prefKeys.sex, sex);
      if (activity) await repo.setPreference(prefKeys.activity, activity);
      await repo.setPreference(prefKeys.alsoGoals, also.join(','));
      if (Math.abs(w - inputs.weightKg) >= 0.05) {
        // A changed weight is a weigh-in for today (updating today's entry if one exists; history is never touched).
        await repo.saveTodayWeight(profile.id, w);
      }
      // Off while in auto mode means "keep what I have": freeze the current targets as custom.
      if (updateTargets) await resetToEstimate();
      else if (mode === 'auto') await setTargetsMode('custom');
      await refresh(); onSaved(); close();
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }

  if (!inputs) return <ActivityIndicator color={p.accent} style={{ marginVertical: 30 }}/>;
  return <View style={{ gap: 10 }}>
    <SheetLabel>Main goal</SheetLabel>
    {mainGoals.map(item => <OptionCard key={item} title={goalLabels[item]} subtitle={goalDetails[item].subtitle} icon={goalDetails[item].icon} selected={goal === item} onPress={() => chooseGoal(item)}/>)}
    <SheetLabel>Also working on · up to 2</SheetLabel>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {mainGoals.filter(item => item !== goal).map(item => <Chip key={item} label={goalLabels[item]} selected={also.includes(item)} disabled={!also.includes(item) && also.length >= 2} onPress={() => toggleAlso(item)}/>)}
    </View>

    <SheetLabel>Your details · used for the estimate</SheetLabel>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="Male" selected={sex === 'male'} onPress={() => setSex('male')}/>
      <Chip label="Female" selected={sex === 'female'} onPress={() => setSex('female')}/>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {activities.map(item => <Chip key={item} label={activityLabels[item]} selected={activity === item} onPress={() => setActivity(item)}/>)}
    </View>
    {(!sex || !activity) && <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17 }}>{!sex && !activity ? 'Add your body type and activity for a sharper estimate.' : !sex ? 'Add your body type for a sharper estimate.' : 'Add your activity level for a sharper estimate. Light is assumed for now.'}</Text>}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, gap: 6 }}><Text style={{ color: p.muted, fontSize: 12, fontFamily: fonts.semibold }}>Current weight</Text><NumberInput label="Current weight in kilograms" value={weight} onChangeText={setWeight} suffix="kg"/></View>
      <View style={{ flex: 1, gap: 6 }}><Text style={{ color: p.muted, fontSize: 12, fontFamily: fonts.semibold }}>Height</Text><NumberInput label="Height in centimetres" value={height} onChangeText={setHeight} suffix="cm"/></View>
    </View>
    {showTarget && <View style={{ gap: 6 }}><Text style={{ color: p.muted, fontSize: 12, fontFamily: fonts.semibold }}>{goal === 'habits' ? 'Target weight (optional)' : 'Target weight'}</Text><NumberInput label="Target weight in kilograms" value={target} onChangeText={setTarget} suffix="kg"/></View>}
    <Text style={{ color: p.muted, fontSize: 12 }}>{age !== null ? `Age ${age} · from your date of birth (change it in Edit profile).` : 'Add your date of birth in Edit profile so your age can be used.'}</Text>

    <View style={{ marginTop: 6, padding: 14, gap: 8, borderRadius: radii.row, backgroundColor: p.light ? p.soft1 : p.card2 }}>
      <SheetLabel>Tracking · estimate</SheetLabel>
      {draft ? <>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 22 }}>{num(draft.kcal)} <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 12 }}>KCAL / DAY</Text></Text>
        <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17 }}>{`Maintenance ≈ ${num(draft.maintenance)} kcal · protein ${draft.protein} g · carbs ${draft.carbs} g · fat ${draft.fat} g`}</Text>
      </> : <Text style={{ color: p.muted, fontSize: 12 }}>Enter a valid weight and height to see your estimate.</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13 }}>Update nutrition targets</Text>
          <Text style={{ color: p.muted, fontSize: 11.5 }}>{mode === 'custom' ? 'Your targets are custom. Turn on to replace them with this estimate.' : 'Your targets follow this estimate automatically.'}</Text>
        </View>
        <Switch value={updateTargets} onValueChange={setUpdateTargets} trackColor={{ false: p.borderStrong, true: p.text }} thumbColor={updateTargets ? p.accent : p.c8} accessibilityLabel="Update nutrition targets"/>
      </View>
    </View>
    <View style={{ marginTop: 6 }}><Button title={busy ? 'Saving…' : 'Save goals'} disabled={busy} onPress={save}/></View>
  </View>;
}

/* ───────────────────────── Nutrition targets ───────────────────────── */

/** Profile → Nutrition targets: the shared editor; saving closes the sheet. */
export function NutritionTargetsSheet({ close, onSaved }: { close: Close; onSaved: () => void }) {
  return <NutritionTargetEditor onChanged={onSaved} onSaved={() => close()}/>;
}

/* ───────────────────────── Notifications ───────────────────────── */

type ReminderKind = 'motivation' | 'workout' | 'habit' | 'streak';
const reminderRows: { kind: ReminderKind; title: string; subtitle: (time: string) => string }[] = [
  { kind: 'motivation', title: 'Daily check-in', subtitle: time => `Morning summary at ${time}` },
  { kind: 'workout', title: 'Workout reminder', subtitle: time => `On your training days at ${time}` },
  { kind: 'habit', title: 'Habit reminders', subtitle: () => 'At the times set on each habit' },
  { kind: 'streak', title: 'Streak at risk', subtitle: time => `Evening nudge at ${time} if today is open` },
];
export const notificationsOn = (prefs: Map<string, string>) => reminderRows.some(row => prefs.get(`${row.kind}_reminders`) === 'on');

export function NotificationsSheet({ onChanged }: { onChanged: () => void }) {
  const p = usePalette();
  const { language, changed } = useApp();
  const [prefs, setPrefs] = useState<Map<string, string> | null>(null);
  const [pending, setPending] = useState<ReminderKind | null>(null);
  useEffect(() => { void repo.preferences().then(items => setPrefs(new Map(items.map(item => [item.key, item.value])))).catch(message); }, []);
  async function toggle(kind: ReminderKind, on: boolean) {
    if (!prefs || pending) return;
    setPending(kind);
    try {
      if (on && !(await requestReminderPermission(language))) { notify('Notifications are off', 'Allow notifications for this app in your device settings, then try again.'); return; }
      const key = `${kind}_reminders`;
      const previous = prefs.get(key) ?? 'off';
      await repo.setPreference(key, on ? 'on' : 'off');
      const next = new Map(prefs).set(key, on ? 'on' : 'off');
      if (on && kind !== 'habit' && !prefs.get(`${kind}_time`)) { await repo.setPreference(`${kind}_time`, reminderDefaults[kind]); next.set(`${kind}_time`, reminderDefaults[kind]); }
      try { await reconcileReminders(); }
      catch (cause) { await repo.setPreference(key, previous); throw cause; }
      setPrefs(next);
      changed(); onChanged();
    } catch (error) { message(error); }
    finally { setPending(null); }
  }
  if (!prefs) return <ActivityIndicator color={p.accent} style={{ marginVertical: 30 }}/>;
  return <View>
    {reminderRows.map((row, index) => {
      const on = prefs.get(`${row.kind}_reminders`) === 'on';
      const time = prefs.get(`${row.kind}_time`) ?? (row.kind === 'habit' ? '' : reminderDefaults[row.kind]);
      return <View key={row.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, borderBottomWidth: index < reminderRows.length - 1 ? 1 : 0, borderBottomColor: p.border }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14.5 }}>{row.title}</Text>
          <Text style={{ color: p.muted, fontSize: 12 }}>{row.subtitle(time)}</Text>
        </View>
        {pending === row.kind ? <ActivityIndicator color={p.accent}/> : <Switch value={on} onValueChange={value => { void toggle(row.kind, value); }} accessibilityLabel={row.title}
          trackColor={{ false: p.line3, true: p.text }} thumbColor={on ? (p.light ? brand.violet : p.lime) : '#FFFFFF'} ios_backgroundColor={p.line3}/>}
      </View>;
    })}
    <Text style={{ color: p.muted, fontSize: 11.5, lineHeight: 16, marginTop: 10 }}>Reminders use your device&apos;s local time. Permission is requested only when you turn one on.</Text>
  </View>;
}

/* ───────────────────────── Language ───────────────────────── */

const languageOptions: { value: Language; subtitle: string }[] = [
  { value: 'en', subtitle: 'Left to right' },
  { value: 'fr', subtitle: 'Gauche à droite' },
  { value: 'ar', subtitle: 'من اليمين إلى اليسار' },
];
export function LanguageSheet({ close }: { close: Close }) {
  const p = usePalette();
  const { profile, language, setLanguage, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  async function choose(next: Language) {
    if (!profile || busy) return;
    if (next === language) { close(); return; }
    setBusy(true);
    try { await repo.saveProfile({ ...profile, language: next }); setLanguage(next); await refresh(); close(); }
    catch (error) { message(error); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 10 }}>
    {languageOptions.map(option => <OptionCard key={option.value} title={languageNames[option.value]} subtitle={option.subtitle} selected={language === option.value} onPress={() => { void choose(option.value); }}/>)}
    <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.6, lineHeight: 15, marginTop: 2 }}>PREVIEW: NAVIGATION AND KEY HEADINGS SWITCH LANGUAGE AND LAYOUT DIRECTION.</Text>
  </View>;
}

/* ───────────────────────── Edit profile ───────────────────────── */

export function EditProfileSheet({ close, onSaved }: { close: Close; onSaved: () => void }) {
  const p = usePalette();
  const { profile, refresh } = useApp();
  const [name, setName] = useState(profile?.name ?? '');
  const [experience, setExperience] = useState(profile?.experience ?? 'Beginner');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!profile || busy) return;
    try {
      const values = validateProfileValues({ name, birth_date: profile.birth_date, height_cm: profile.height_cm, start_weight: profile.start_weight, target_weight: profile.target_weight });
      setBusy(true);
      await repo.saveProfile({ ...profile, ...values, experience });
      await syncAutoTargets(); // Age feeds the estimate.
      await refresh(); onSaved(); close();
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Field label="Display name" value={name} onChangeText={setName}/>
    <Text style={{ color: p.muted, fontSize: 12 }}>Date of birth: {profile?.birth_date ?? 'Not recorded'}. To correct it, contact privacy@cubyfit.app.</Text>
    <Choices label="Experience" options={['Beginner', 'Intermediate', 'Advanced']} value={experience} onChange={setExperience}/>
    <View style={{ marginTop: 6 }}><Button title={busy ? 'Saving…' : 'Save profile'} disabled={busy} onPress={save}/></View>
    <Pressable accessibilityRole="button" onPress={() => close(() => router.push('/account'))} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Ionicons name="person-circle-outline" size={17} color={p.accent}/>
      <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 13 }}>Sign-in account, cloud backup & data</Text>
    </Pressable>
  </View>;
}
