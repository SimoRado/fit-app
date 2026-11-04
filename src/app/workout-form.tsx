import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '../ui/LocalizedText';
import { dayKey, localTime, localTimestamp, uid, validDay } from '../core/date';
import { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { clearWorkoutDraft, DraftExercise, DraftSet, getWorkoutDraft, setWorkoutDraft, WorkoutDraft } from '../state/workoutDraft';
import { BottomSheet } from '../ui/BottomSheet';
import { Button, Card, Choices, Field, message, Page, styles, confirm } from '../ui/components';
import { ProgressBar, SectionHeader } from '../ui/visuals';
import { WorkoutSetRow } from '../ui/WorkoutSetRow';
import { colors, fonts } from '../ui/theme';
import { DisplayMetric } from '../ui/DisplayMetric';

const blankSet = (): DraftSet => ({ id: uid(), reps: '', weight: '', duration: '', note: '', completed: false });
const emptyDraft = (): WorkoutDraft => ({ original: null, name: '', day: dayKey(), start: localTime(), duration: '', notes: '', completed: true, items: [], timerStarted: Date.now() });

export default function WorkoutForm() {
  const { id, routine } = useLocalSearchParams<{ id?: string; routine?: string }>();
  const { profile, changed } = useApp();
  const draftKey = (profile?.id ?? 'local') + ':' + (id ? 'workout:' + id : routine ? 'routine:' + routine : 'new');
  const [initial] = useState(() => getWorkoutDraft(draftKey));
  const [draft, setDraft] = useState<WorkoutDraft>(() => initial ?? emptyDraft());
  const [ready, setReady] = useState(!!initial || (!id && !routine));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesReady, setExercisesReady] = useState(false);
  const [custom, setCustom] = useState('');
  const [picker, setPicker] = useState(false);
  const [editingExercise, setEditingExercise] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    repo.exercises().then(rows => { if (active) { setExercises(rows); setExercisesReady(true); } }).catch(error => { if (active) message(error); });
    if (!initial && id) Promise.all([repo.one<Workout>('workouts', id), repo.workoutExercises(), repo.workoutSets()]).then(([workout, links, sets]) => {
      if (!active) return;
      if (!workout) { message(new Error('Workout not found.')); router.back(); return; }
      setDraft({ original: workout, name: workout.name, day: workout.day, start: Number.isNaN(Date.parse(workout.started_at)) ? localTime() : localTime(new Date(workout.started_at)), duration: workout.duration_min?.toString() ?? '', notes: workout.notes, completed: !!workout.completed, timerStarted: Date.now(), items: links.filter(link => link.workout_id === id).map(link => ({ id: link.id, exerciseId: link.exercise_id, sets: sets.filter(set => set.workout_exercise_id === link.id).map(set => ({ id: set.id, reps: String(set.reps ?? ''), weight: String(set.weight_kg ?? ''), duration: String(set.duration_sec ?? ''), note: set.note, completed: !!set.completed })) })) });
      setReady(true);
    }).catch(message);
    else if (!initial && routine) Promise.all([repo.one<{ name: string }>('routines', routine), repo.routineExercises()]).then(([saved, links]) => {
      if (!active) return;
      if (!saved) { message(new Error('Routine not found.')); router.back(); return; }
      setDraft(previous => ({ ...previous, name: saved.name, items: links.filter(link => link.routine_id === routine).map(link => ({ id: uid(), exerciseId: link.exercise_id, sets: [blankSet()] })) }));
      setReady(true);
    }).catch(message);
    return () => { active = false; };
  }, [id, routine, initial]);

  useEffect(() => { if (ready) setWorkoutDraft(draftKey, draft); }, [ready, draftKey, draft]);
  useEffect(() => {
    if (!ready || draft.original?.completed) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ready, draft.original?.completed]);

  function updateItem(index: number, fn: (item: DraftExercise) => DraftExercise) {
    setDraft(current => ({ ...current, items: current.items.map((item, position) => position === index ? fn(item) : item) }));
  }
  function updateSet(i: number, j: number, patch: Partial<DraftSet>) {
    updateItem(i, item => ({ ...item, sets: item.sets.map((set, position) => position === j ? { ...set, ...patch } : set) }));
  }
  function chooseExercise(exercise: Exercise) {
    if (editingExercise !== null) updateItem(editingExercise, item => ({ ...item, exerciseId: exercise.id }));
    else setDraft(current => ({ ...current, items: [...current.items, { id: uid(), exerciseId: exercise.id, sets: [blankSet()] }] }));
  }
  async function createCustom(close: () => void) {
    if (!custom.trim()) return;
    try {
      const exercise: Exercise = { id: uid(), name: custom.trim(), metric: 'weight_reps', custom: 1 };
      await repo.saveExercise(exercise); setExercises(current => [...current, exercise]); setCustom(''); chooseExercise(exercise); close();
    } catch (error) { message(error); }
  }
  async function save(): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    try {
      if (!profile) throw Error('Please enter valid values in all required fields.');
      if (!draft.name.trim()) throw Error('Enter a workout name.');
      if (!validDay(draft.day) || draft.completed && draft.day > dayKey()) throw Error('Use a valid date; completed workouts cannot be in the future.');
      if (draft.duration && (!Number.isInteger(Number(draft.duration)) || Number(draft.duration) < 1 || Number(draft.duration) > 1440)) throw Error('Duration must be 1–1440 minutes.');
      if (draft.items.some(item => !item.exerciseId || !item.sets.length)) throw Error('Choose an exercise and keep at least one set for every row.');
      if (draft.completed && !draft.items.some(item => item.sets.some(set => set.completed))) throw Error('A completed workout needs at least one completed set.');
      const workout = { id: draft.original?.id ?? uid(), owner_id: profile.id, name: draft.name.trim(), day: draft.day, started_at: localTimestamp(draft.day, draft.start), duration_min: draft.duration ? Number(draft.duration) : null, notes: draft.notes, completed: Number(draft.completed), created_at: draft.original?.created_at ?? new Date().toISOString() };
      const bundle = draft.items.map((item, index) => ({
        link: { id: item.id, workout_id: workout.id, exercise_id: item.exerciseId, position: index } as WorkoutExercise,
        sets: item.sets.map((set, position) => {
          const exercise = exercises.find(row => row.id === item.exerciseId);
          if (!exercise) throw Error('Choose an exercise and keep at least one set for every row.');
          const reps = set.reps ? Number(set.reps) : null, weight = set.weight ? Number(set.weight) : null, duration = set.duration ? Number(set.duration) : null;
          if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) throw Error('Reps must be 1–1000.');
          if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) throw Error('Weight must be 0–1000 kg.');
          if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 86400)) throw Error('Set duration must be 1–86400 seconds.');
          if (set.completed && exercise.metric === 'duration' && duration === null) throw Error(exercise.name + ' needs a duration.');
          if (set.completed && exercise.metric !== 'duration' && reps === null) throw Error(exercise.name + ' needs reps.');
          return { id: set.id, workout_exercise_id: item.id, set_number: position + 1, reps, weight_kg: exercise.metric === 'weight_reps' ? weight : null, duration_sec: exercise.metric === 'duration' ? duration : null, note: set.note, completed: Number(set.completed) } as WorkoutSet;
        }),
      }));
      await repo.saveWorkoutBundle(workout, bundle);
      setReady(false); clearWorkoutDraft(draftKey); changed();
      return true;
    } catch (error) { message(error); return false; }
    finally { setSaving(false); }
  }

  const totalSets = draft.items.reduce((sum, item) => sum + item.sets.length, 0);
  const doneSets = draft.items.reduce((sum, item) => sum + item.sets.filter(set => set.completed).length, 0);
  const activeExercise = draft.items.findIndex(item => item.sets.some(set => !set.completed));
  const elapsed = Math.max(0, Math.floor((now - draft.timerStarted) / 1000));
  const timerText = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');

  return <Page title="">
    {!draft.original?.completed && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><DisplayMetric value={timerText} size={77}/><View style={{ minWidth: 84 }}><Button title="Finish" onPress={() => setFinishing(true)}/></View></View>}
    <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Completed sets: {doneSets}/{totalSets}</Text><ProgressBar value={totalSets ? doneSets / totalSets : 0}/>
    <View style={{ gap: 10, paddingVertical: 8 }}>
      <Field label="Workout name" value={draft.name} onChangeText={name => setDraft(current => ({ ...current, name }))}/>
      <Button title={detailsOpen ? 'Hide session details' : 'Session details'} kind="ghost" onPress={() => setDetailsOpen(!detailsOpen)}/>
    </View>
    {detailsOpen && <Card>
      {!draft.original?.completed && <Button title="Use timer for duration" kind="ghost" onPress={() => setDraft(current => ({ ...current, duration: String(Math.max(1, Math.ceil((Date.now() - current.timerStarted) / 60000))) }))}/>}
      <Field label="Date (YYYY-MM-DD)" value={draft.day} onChangeText={day => setDraft(current => ({ ...current, day }))}/>
      <Field label="Start time (HH:MM local)" value={draft.start} onChangeText={start => setDraft(current => ({ ...current, start }))} placeholder="18:30"/>
      <Field label="Duration (minutes, optional)" value={draft.duration} onChangeText={duration => setDraft(current => ({ ...current, duration }))} keyboardType="numeric"/>
      <Field label="Notes" value={draft.notes} onChangeText={notes => setDraft(current => ({ ...current, notes }))} multiline/>
      <Choices label="Status" options={['Completed', 'Draft']} value={draft.completed ? 'Completed' : 'Draft'} onChange={value => setDraft(current => ({ ...current, completed: value === 'Completed' }))}/>
    </Card>}
    <SectionHeader title="Exercises and sets"/>
    {draft.items.map((item, i) => {
      const exercise = exercises.find(row => row.id === item.exerciseId);
      return <Card key={item.id} accent={i === activeExercise}>
        <View style={styles.row}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 42, lineHeight: 42, textTransform: 'uppercase', flex: 1, minWidth: 100, includeFontPadding: false }}>{exercise?.name ?? 'Exercise'}</Text><Button title="Edit" kind="ghost" onPress={() => { setEditingExercise(i); setPicker(true); }}/></View>
        {item.sets.map((set, j) => <WorkoutSetRow key={set.id} set={set} index={j} metric={exercise?.metric ?? 'weight_reps'} onChange={patch => updateSet(i, j, patch)} onRemove={() => updateItem(i, row => ({ ...row, sets: row.sets.filter((_, index) => index !== j) }))}/>)}
        <View style={styles.row}><Button title="Add set" kind="ghost" onPress={() => updateItem(i, row => ({ ...row, sets: [...row.sets, blankSet()] }))}/><Button title="Remove exercise" kind="danger" onPress={() => confirm('Remove exercise?', () => setDraft(current => ({ ...current, items: current.items.filter((_, index) => index !== i) })))}/></View>
      </Card>;
    })}
    <Button title="Add exercise" kind="ghost" disabled={!ready || !exercisesReady} onPress={() => { setEditingExercise(null); setPicker(true); }}/>
    <Button title={saving ? 'Saving…' : 'Save workout'} disabled={!ready || !exercisesReady || saving} onPress={() => setFinishing(true)}/>
    <Button title="Discard changes" kind="ghost" disabled={!ready || saving} onPress={() => confirm('Discard workout changes?', () => { setReady(false); clearWorkoutDraft(draftKey); router.back(); }, 'This cannot be undone.', 'Discard')}/>
    <BottomSheet visible={picker} title="Add exercise" onClose={() => setPicker(false)}>{close => <>
      {exercises.map(exercise => <Button key={exercise.id} title={exercise.name} kind="ghost" onPress={() => { chooseExercise(exercise); close(); }}/>)}
      <Field label="Custom exercise name" value={custom} onChangeText={setCustom}/><Button title="Create custom exercise" onPress={() => createCustom(close)}/>
    </>}</BottomSheet>
    <BottomSheet visible={finishing} title="Save workout" onClose={() => setFinishing(false)}>{close => <>
      <Text style={styles.text}>Completed sets: {doneSets}/{totalSets}</Text>
      <Text style={styles.muted}>Only completed sets count toward workout statistics and records.</Text>
      <Button title={saving ? 'Saving…' : 'Save workout'} disabled={saving} onPress={async () => { if (await save()) close(() => router.back()); }}/>
      <Button title="Back" kind="ghost" onPress={() => close()}/>
    </>}</BottomSheet>
  </Page>;
}
