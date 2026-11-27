import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Text } from '../ui/LocalizedText';
import { uid } from '../core/date';
import { localize } from '../core/i18n';
import { storageErrorMessage } from '../core/errors';
import { perfMark, perfNow } from '../core/perf';
import { addExercise, addTargetSet, emptyRoutineDraft, moveExercise, parseTargetNumber, plannedSetCount, removeExercise, removeTargetSet, replaceExercise, sameRoutineDraft, updateTargetSet, type RoutineDraft, type TargetSet } from '../core/routineDraft';
import type { Exercise } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { BottomSheet } from '../ui/BottomSheet';
import { ExerciseBrowser } from '../ui/ExerciseBrowser';
import { Button, Field, Page, confirm, message, notify } from '../ui/components';
import { fonts } from '../ui/theme';
import { useReducedMotion } from '../ui/motion';
import { AddSetRow, SetHeader, SetRow } from '../ui/SetRow';
import { CircleButton, EmptyAction, MenuItem, VCard, isLight, usePalette } from '../ui/voltKit';
import { isFeatureLimitError } from '../services/featureLimits';
import { useSubscription } from '../state/subscriptions';

type Field3 = 'reps' | 'weight' | 'duration';
type Texts = Record<string, Partial<Record<Field3, string>>>;
type PickerMode = { mode: 'add' } | { mode: 'replace'; key: string } | null;
const fieldOf: Record<Field3, keyof TargetSet> = { reps: 'reps', weight: 'weightKg', duration: 'durationSec' };
const show = (value: number | null) => value === null ? '' : String(value);

/**
 * Volt routine builder: name, exercises from the library, planned sets (kg × reps or seconds),
 * order and removal. Unsaved changes are guarded when leaving; saves are single-flight.
 */
export default function RoutineForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, changed, language } = useApp();
  const subscription = useSubscription();
  const p = usePalette();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState<RoutineDraft>(emptyRoutineDraft);
  const [baseline, setBaseline] = useState<RoutineDraft>(emptyRoutineDraft);
  const [texts, setTexts] = useState<Texts>({});
  const [loaded, setLoaded] = useState(!id);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [muscles, setMuscles] = useState<Map<string, string>>(new Map());
  const [picker, setPicker] = useState<PickerMode>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([repo.exercises(), repo.exerciseMuscles()]).then(([rows, catalog]) => {
      if (!active) return;
      setExercises(rows);
      setMuscles(new Map(catalog.map(row => [row.exercise_id, row.muscle_group])));
    }).catch(message);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!id || !profile?.id) return;
    let active = true;
    repo.routineDraft(profile.id, id).then(loadedDraft => {
      if (!active) return;
      if (!loadedDraft) { notify('Routine not found', 'It may have been deleted.'); router.back(); return; }
      setDraft(loadedDraft); setBaseline(loadedDraft); setLoaded(true);
    }).catch(message);
    return () => { active = false; };
  }, [id, profile?.id]);
  useEffect(() => { if (leaving) router.back(); }, [leaving]);

  const names = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise.name])), [exercises]);
  const metrics = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise.metric])), [exercises]);
  const dirty = loaded && !sameRoutineDraft(draft, baseline);
  usePreventRemove(dirty && !leaving && !discarded, ({ repeat }) => {
    Alert.alert(localize('Discard changes?', language), localize('Your routine edits have not been saved.', language), [
      { text: localize('Keep editing', language), style: 'cancel' },
      { text: localize('Discard', language), style: 'destructive', onPress: () => { setDiscarded(true); repeat(); } },
    ]);
  });

  function change(update: (current: RoutineDraft) => RoutineDraft) { setDraft(current => update(current)); }
  function setText(set: TargetSet, key: string, index: number, field: Field3, text: string) {
    const setKey = set.key ?? `${key}:${index}`;
    setTexts(current => ({ ...current, [setKey]: { ...current[setKey], [field]: text } }));
    const parsed = parseTargetNumber(text, field);
    if (parsed !== undefined) change(current => updateTargetSet(current, key, index, { [fieldOf[field]]: parsed }));
  }
  function textFor(set: TargetSet, key: string, index: number, field: Field3) {
    return texts[set.key ?? `${key}:${index}`]?.[field] ?? show(set[fieldOf[field]] as number | null);
  }
  function choose(exercise: Exercise, close?: (after?: () => void) => void) {
    if (!picker) return;
    const finish = () => close ? close(() => setPicker(null)) : setPicker(null);
    if (picker.mode === 'replace') {
      if (draft.exercises.some(item => item.key !== picker.key && item.exerciseId === exercise.id)) { notify('Already in this routine', `${exercise.name} is already part of this routine.`); return; }
      change(current => replaceExercise(current, picker.key, exercise.id));
      finish();
      return;
    }
    if (draft.exercises.some(item => item.exerciseId === exercise.id)) {
      Alert.alert(localize('Already in this routine', language), localize('Add this exercise a second time?', language), [
        { text: localize('Cancel', language), style: 'cancel' },
        { text: localize('Add again', language), onPress: () => { change(current => addExercise(current, exercise.id, { allowDuplicate: true })); finish(); } },
      ]);
      return;
    }
    change(current => addExercise(current, exercise.id));
    finish();
  }
  async function createCustom(close: (after?: () => void) => void) {
    if (!custom.trim()) return;
    try {
      const exercise: Exercise = { id: uid(), name: custom.trim(), metric: 'weight_reps', custom: 1 };
      await repo.saveExercise(exercise);
      setExercises(current => [...current, exercise]);
      setCustom('');
      choose(exercise, close);
    } catch (error) { message(error); }
  }
  async function save() {
    if (savingRef.current) return;
    if (!draft.name.trim()) { setNameError(true); notify('Name your routine', 'Enter a routine name before saving.'); return; }
    // Only check text for sets that still exist; values typed into a removed set must not block saving.
    const liveKeys = new Set(draft.exercises.flatMap(item => item.sets.map((set, index) => set.key ?? `${item.key}:${index}`)));
    for (const [key, fields] of Object.entries(texts)) {
      if (!liveKeys.has(key)) continue;
      for (const [field, text] of Object.entries(fields ?? {})) {
        if (text !== undefined && parseTargetNumber(text, field as Field3) === undefined) { notify('Check your sets', field === 'weight' ? 'Weight must be 0–1000 kg.' : field === 'reps' ? 'Reps must be whole numbers from 1 to 1000.' : 'Seconds must be whole numbers from 1 to 86400.'); return; }
      }
    }
    if (!profile) { notify('Sign in required', 'Sign in before saving a routine.'); return; }
    savingRef.current = true; setSaving(true);
    const startedAt = perfNow();
    try {
      await repo.saveRoutineDraft(profile.id, draft, names, { isPremium: subscription.isPremium });
      perfMark('routine save', startedAt);
      changed();
      // Navigate away only after the transaction committed.
      setBaseline(draft); setTexts({}); setLeaving(true);
    } catch (error) {
      perfMark('routine save failed', startedAt);
      if (isFeatureLimitError(error)) {
        Alert.alert('Free plan limit reached', 'You can create up to 6 gym routines on Cubyfit Free. Upgrade to Pro for unlimited routines.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => router.push('/paywall') },
        ]);
        return;
      }
      // The draft stays exactly as it was; show the real reason and offer a retry.
      Alert.alert(localize('Routine not saved', language), localize(storageErrorMessage(error), language), [
        { text: localize('Keep editing', language), style: 'cancel' },
        { text: localize('Try again', language), onPress: () => { void save(); } },
      ]);
    }
    finally { savingRef.current = false; setSaving(false); }
  }
  function removeRoutine() {
    if (!draft.id || !profile) return;
    confirm(`Delete “${baseline.name || 'this routine'}”?`, async () => {
      await repo.deleteRoutine(profile.id, draft.id!);
      changed();
      setBaseline(draft); setLeaving(true);
    }, 'The routine and its planned sets are removed and it is cleared from your weekly plan. Workouts you already completed stay in your history.', 'Delete routine');
  }

  const menuItem = draft.exercises.find(item => item.key === menuKey);
  const menuIndex = menuItem ? draft.exercises.indexOf(menuItem) : -1;
  const totalSets = plannedSetCount(draft);

  return <Page title={id ? 'Edit routine' : 'New routine'}
    headerAction={id ? <CircleButton icon="trash-outline" label="Delete routine" onPress={removeRoutine}/> : undefined}
    footer={<>
      <View style={{ flex: 1 }}><Button title="Cancel" kind="ghost" onPress={() => router.back()}/></View>
      <View style={{ flex: 1.4 }}><Button title={saving ? 'Saving…' : 'Save routine'} disabled={saving || !loaded} onPress={save}/></View>
    </>}>
    {!loaded ? <Text style={{ color: p.muted }}>Loading routine…</Text> : <>
      <VCard style={{ gap: 6 }}>
        <Text style={{ color: nameError && !draft.name.trim() ? p.danger : p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>ROUTINE NAME</Text>
        <TextInput accessibilityLabel="Routine name" value={draft.name} onChangeText={name => { setNameError(false); change(current => ({ ...current, name })); }} placeholder="e.g. Push Day" placeholderTextColor={p.subtle} maxLength={80} returnKeyType="done"
          style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 24, paddingVertical: 4, borderBottomWidth: 2, borderBottomColor: nameError && !draft.name.trim() ? p.danger : p.border }}/>
        {nameError && !draft.name.trim() && <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 12.5 }}>Give your routine a name.</Text>}
        <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5, marginTop: 4 }}>{draft.exercises.length} exercise{draft.exercises.length === 1 ? '' : 's'} · {totalSets} planned set{totalSets === 1 ? '' : 's'}</Text>
      </VCard>

      {draft.exercises.map((item, index) => {
        const metric = metrics.get(item.exerciseId) ?? 'weight_reps';
        const name = names.get(item.exerciseId) ?? 'Exercise';
        return <Animated.View key={item.key} entering={reduced ? undefined : FadeInDown.duration(260)} exiting={reduced ? undefined : FadeOut.duration(160)} layout={reduced ? undefined : LinearTransition.duration(240)}>
          <VCard style={{ paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: isLight(p) ? p.soft1 : p.card2 }}><Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 13 }}>{index + 1}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17, letterSpacing: -0.3 }}>{name}</Text>
                <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 2 }}>{muscles.get(item.exerciseId) ?? (metric === 'duration' ? 'Timed' : 'Custom')} · {item.sets.length} set{item.sets.length === 1 ? '' : 's'}</Text>
              </View>
              <CircleButton icon="ellipsis-horizontal" size={34} label={`Options for ${name}`} onPress={() => setMenuKey(item.key)}/>
            </View>
            {item.sets.length ? <SetHeader metric={metric} live={false}/> : <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5, paddingVertical: 6 }}>No sets planned. Add one below.</Text>}
            {item.sets.map((set, setIndex) => <SetRow key={set.key ?? `${item.key}:${setIndex}`} group={item.key} index={setIndex} metric={metric} exerciseName={name}
              values={{ reps: textFor(set, item.key, setIndex, 'reps'), weight: textFor(set, item.key, setIndex, 'weight'), duration: textFor(set, item.key, setIndex, 'duration') }}
              onChange={patch => { for (const field of ['reps', 'weight', 'duration'] as const) if (patch[field] !== undefined) setText(set, item.key, setIndex, field, patch[field]!); }}
              onRemove={() => change(current => removeTargetSet(current, item.key, setIndex))}/>)}
            <AddSetRow onPress={() => change(current => addTargetSet(current, item.key))} disabled={item.sets.length >= 20}/>
          </VCard>
        </Animated.View>;
      })}

      {draft.exercises.length === 0 && <View style={{ alignItems: 'center', gap: 6, paddingVertical: 18 }}>
        <Ionicons name="barbell-outline" size={30} color={p.accent}/>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>Build your routine</Text>
        <Text style={{ color: p.muted, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>Add exercises from the library, then plan the sets, weight and reps for each one.</Text>
      </View>}
      <EmptyAction text="Add exercise" onPress={() => setPicker({ mode: 'add' })}/>
      <Text style={{ color: p.muted, fontSize: 12 }}>Routine changes never alter workouts you already completed.</Text>
    </>}

    <BottomSheet stableHeight="88%" visible={!!picker} title={picker?.mode === 'replace' ? 'Replace exercise' : 'Add exercise'} onClose={() => setPicker(null)}>{close => <>
      <ExerciseBrowser selectedIds={new Set(draft.exercises.filter(item => picker?.mode !== 'replace' || item.key !== picker.key).map(item => item.exerciseId))} onSelect={exercise => choose(exercise, close)}/>
      <Field label="Custom exercise name" value={custom} onChangeText={setCustom}/>
      <Button title="Create custom exercise" kind="ghost" disabled={!custom.trim()} onPress={() => createCustom(close)}/>
    </>}</BottomSheet>

    <BottomSheet visible={!!menuItem} title={menuItem ? names.get(menuItem.exerciseId) ?? 'Exercise' : 'Exercise'} onClose={() => setMenuKey(null)}>{close => menuItem && <View style={{ gap: 6 }}>
      <MenuItem icon="arrow-up" label="Move up" disabled={menuIndex <= 0} onPress={() => change(current => moveExercise(current, menuItem.key, -1))}/>
      <MenuItem icon="arrow-down" label="Move down" disabled={menuIndex >= draft.exercises.length - 1} onPress={() => change(current => moveExercise(current, menuItem.key, 1))}/>
      <MenuItem icon="swap-horizontal" label="Replace exercise" onPress={() => close(() => setPicker({ mode: 'replace', key: menuItem.key }))}/>
      <MenuItem icon="trash-outline" label="Remove exercise" danger onPress={() => close(() => change(current => removeExercise(current, menuItem.key)))}/>
    </View>}</BottomSheet>
  </Page>;
}
