import React, { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { localize } from '../core/i18n';
import { Text } from '../ui/LocalizedText';
import { dayKey, localTime, localTimestamp, uid, validDay } from '../core/date';
import { elapsedWorkoutSeconds, finishWorkoutTimer, formatWorkoutElapsed, pauseWorkoutTimer, resumeWorkoutTimer, workoutTimerFromRecord, type WorkoutTimerState } from '../core/workoutTimer';
import { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../core/types';
import { repo, WorkoutBundle } from '../data/db';
import { useApp } from '../state/app';
import { DraftExercise, DraftSet, WorkoutDraft } from '../state/workoutDraft';
import { BottomSheet } from '../ui/BottomSheet';
import { Button, Card, Choices, Field, message, Page, styles, confirm } from '../ui/components';
import { ProgressBar, SectionHeader } from '../ui/visuals';
import { WorkoutSetRow } from '../ui/WorkoutSetRow';
import { colors, fonts } from '../ui/theme';
import { DisplayMetric } from '../ui/DisplayMetric';

const blankSet = (): DraftSet => ({ id: uid(), reps: '', weight: '', duration: '', note: '', completed: false });
const emptyDraft = (): WorkoutDraft => ({ original: null, name: '', day: dayKey(), start: localTime(), duration: '', notes: '', completed: false, items: [], sessionStatus: 'draft', elapsedSeconds: 0, runningSinceMs: null, pausedSinceMs: null, pausedSeconds: 0, finishedAtMs: null });
const currentTimestamp = () => Date.now();
const valueNumber = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const timerState = (draft: WorkoutDraft): WorkoutTimerState => ({ session_status: draft.sessionStatus, elapsed_seconds: draft.elapsedSeconds, running_since_ms: draft.runningSinceMs, paused_since_ms: draft.pausedSinceMs, paused_seconds: draft.pausedSeconds, finished_at_ms: draft.finishedAtMs });
const withTimer = (draft: WorkoutDraft, timer: WorkoutTimerState): WorkoutDraft => ({ ...draft, sessionStatus: timer.session_status, elapsedSeconds: timer.elapsed_seconds, runningSinceMs: timer.running_since_ms, pausedSinceMs: timer.paused_since_ms, pausedSeconds: timer.paused_seconds, finishedAtMs: timer.finished_at_ms });

function hydrate(bundle: WorkoutBundle): WorkoutDraft {
  const { workout } = bundle;
  const timer = workoutTimerFromRecord(workout);
  const parsed = Date.parse(workout.started_at);
  const started = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return {
    original: workout,
    name: workout.name,
    day: workout.day,
    start: localTime(started),
    duration: workout.duration_min?.toString() ?? '',
    notes: workout.notes,
    completed: !!workout.completed,
    items: bundle.exercises.map(({ link, sets }) => ({ id: link.id, exerciseId: link.exercise_id, sets: sets.map(set => ({ id: set.id, reps: set.reps?.toString() ?? '', weight: set.weight_kg?.toString() ?? '', duration: set.duration_sec?.toString() ?? '', note: set.note, completed: !!set.completed })) })),
    sessionStatus: timer.session_status,
    elapsedSeconds: timer.elapsed_seconds,
    runningSinceMs: timer.running_since_ms,
    pausedSinceMs: timer.paused_since_ms,
    pausedSeconds: timer.paused_seconds,
    finishedAtMs: timer.finished_at_ms,
  };
}

function makeWorkout(draft: WorkoutDraft, forceFinishedAt?: number): Workout {
  const original = draft.original;
  const sessionStatus = draft.sessionStatus;
  const wasLiveSession = original?.session_status === 'running' || original?.session_status === 'paused';
  const preserveSessionStart = sessionStatus === 'running' || sessionStatus === 'paused' || (sessionStatus === 'completed' && wasLiveSession);
  const startedAt = preserveSessionStart
    ? original?.started_at ?? localTimestamp(draft.day, draft.start)
    : localTimestamp(draft.day, draft.start);
  const duration = draft.duration.trim() ? Number(draft.duration) : null;
  return {
    id: original?.id ?? uid(),
    owner_id: original?.owner_id ?? '',
    name: draft.name.trim(),
    day: draft.day,
    started_at: startedAt,
    duration_min: sessionStatus === 'running' || sessionStatus === 'paused' ? null : duration,
    notes: draft.notes,
    completed: Number(draft.completed),
    created_at: original?.created_at ?? new Date().toISOString(),
    session_status: sessionStatus,
    elapsed_seconds: draft.elapsedSeconds,
    running_since_ms: draft.runningSinceMs,
    paused_since_ms: draft.pausedSinceMs,
    paused_seconds: draft.pausedSeconds,
    finished_at_ms: forceFinishedAt ?? draft.finishedAtMs,
  };
}

function makeBundle(draft: WorkoutDraft, workout: Workout): WorkoutBundle['exercises'] {
  return draft.items.map((item, index) => ({
    link: { id: item.id, workout_id: workout.id, exercise_id: item.exerciseId, position: index } as WorkoutExercise,
    sets: item.sets.map((set, position) => ({
      id: set.id,
      workout_exercise_id: item.id,
      set_number: position + 1,
      reps: valueNumber(set.reps),
      weight_kg: valueNumber(set.weight),
      duration_sec: valueNumber(set.duration),
      note: set.note,
      completed: Number(set.completed),
    } as WorkoutSet)),
  }));
}

export default function WorkoutForm() {
  const { id, routine, session } = useLocalSearchParams<{ id?: string; routine?: string; session?: string }>();
  const { profile, changed } = useApp();
  const profileId = profile?.id;
  const languageRef = useRef(profile?.language ?? 'en');
  const [draft, setDraft] = useState<WorkoutDraft>(emptyDraft);
  const draftRef = useRef(draft);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesReady, setExercisesReady] = useState(false);
  const [custom, setCustom] = useState('');
  const [picker, setPicker] = useState(false);
  const [editingExercise, setEditingExercise] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timerActionBusy, setTimerActionBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const persistQueue = useRef<Promise<void>>(Promise.resolve());
  const actionLock = useRef(false);
  const changedRef = useRef(changed);

  useEffect(() => { changedRef.current = changed; }, [changed]);
  useEffect(() => { languageRef.current = profile?.language ?? 'en'; }, [profile?.language]);
  useEffect(() => () => { if (draftRef.current.original) changedRef.current(); }, []);

  function persistLiveSnapshot(snapshot: WorkoutDraft) {
    if (!snapshot.original || (snapshot.sessionStatus !== 'running' && snapshot.sessionStatus !== 'paused')) return;
    const workout = makeWorkout(snapshot);
    const bundle = makeBundle(snapshot, workout);
    const write = persistQueue.current.catch(() => undefined).then(() => repo.persistWorkoutSession(workout, bundle));
    persistQueue.current = write;
    void write.catch(message);
  }

  function updateDraft(update: (current: WorkoutDraft) => WorkoutDraft) {
    const next = update(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    if (readyRef.current) persistLiveSnapshot(next);
  }

  function loadBundle(bundle: WorkoutBundle) {
    const loaded = hydrate(bundle);
    draftRef.current = loaded;
    setDraft(loaded);
    readyRef.current = true;
    setReady(true);
    setNow(currentTimestamp());
  }

  useEffect(() => {
    let active = true;
    repo.exercises().then(rows => { if (active) { setExercises(rows); setExercisesReady(true); } }).catch(error => { if (active) message(error); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profileId) return;
    const ownerId = profileId;
    let active = true;
    readyRef.current = false;
    setReady(false);
    async function initialize() {
      if (session || id) {
        const bundle = await repo.workoutSession(ownerId, session ?? id!);
        if (!active) return;
        if (!bundle) throw Error('Workout not found for this account.');
        loadBundle(bundle);
        return;
      }
      const result = await repo.beginWorkoutSession(ownerId, routine ?? null);
      if (!active) return;
      if (result.existing) {
        const openId = result.bundle.workout.id;
        Alert.alert(localize('Workout already in progress', languageRef.current), localize('You already have a workout in progress.', languageRef.current), [
          { text: localize('Cancel', languageRef.current), style: 'cancel', onPress: () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/workouts'); } },
          { text: localize('Continue Current Workout', languageRef.current), onPress: () => router.replace({ pathname: '/workout-form', params: { session: openId } }) },
        ], { cancelable: false });
        return;
      }
      loadBundle(result.bundle);
      changedRef.current();
    }
    initialize().catch(error => { if (active) { message(error); if (router.canGoBack()) router.back(); else router.replace('/(tabs)/workouts'); } });
    return () => { active = false; };
  }, [profileId, id, routine, session]);

  useEffect(() => {
    if (!ready || draft.sessionStatus !== 'running') return;
    setNow(currentTimestamp());
    const tick = setInterval(() => setNow(currentTimestamp()), 1000);
    return () => clearInterval(tick);
  }, [ready, draft.sessionStatus]);

  function updateItem(index: number, fn: (item: DraftExercise) => DraftExercise) {
    updateDraft(current => ({ ...current, items: current.items.map((item, position) => position === index ? fn(item) : item) }));
  }
  function updateSet(i: number, j: number, patch: Partial<DraftSet>) {
    updateItem(i, item => ({ ...item, sets: item.sets.map((set, position) => position === j ? { ...set, ...patch } : set) }));
  }
  function chooseExercise(exercise: Exercise) {
    if (editingExercise !== null) updateItem(editingExercise, item => ({ ...item, exerciseId: exercise.id }));
    else updateDraft(current => ({ ...current, items: [...current.items, { id: uid(), exerciseId: exercise.id, sets: [blankSet()] }] }));
  }
  async function createCustom(close: () => void) {
    if (!custom.trim()) return;
    try {
      const exercise: Exercise = { id: uid(), name: custom.trim(), metric: 'weight_reps', custom: 1 };
      await repo.saveExercise(exercise); setExercises(current => [...current, exercise]); setCustom(''); chooseExercise(exercise); close();
    } catch (error) { message(error); }
  }

  function validate(candidate: WorkoutDraft, liveFinish = false) {
    if (!profile) throw Error('Please enter valid values in all required fields.');
    if (!candidate.name.trim()) throw Error('Enter a workout name.');
    if (!validDay(candidate.day) || candidate.completed && candidate.day > dayKey()) throw Error('Use a valid date; completed workouts cannot be in the future.');
    if (!liveFinish && candidate.duration && (!Number.isInteger(Number(candidate.duration)) || Number(candidate.duration) < 1 || Number(candidate.duration) > 1440)) throw Error('Duration must be 1–1440 minutes.');
    if (candidate.items.some(item => !item.exerciseId || !item.sets.length)) throw Error('Choose an exercise and keep at least one set for every row.');
    if (candidate.completed && !candidate.items.some(item => item.sets.some(set => set.completed))) throw Error('A completed workout needs at least one completed set.');
    for (const item of candidate.items) for (const set of item.sets) {
      const reps = set.reps.trim() ? Number(set.reps) : null;
      const weight = set.weight.trim() ? Number(set.weight) : null;
      const duration = set.duration.trim() ? Number(set.duration) : null;
      if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) throw Error('Reps must be 1–1000.');
      if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) throw Error('Weight must be 0–1000 kg.');
      if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 86400)) throw Error('Set duration must be 1–86400 seconds.');
      const exercise = exercises.find(row => row.id === item.exerciseId);
      if (!exercise) throw Error('Choose an exercise and keep at least one set for every row.');
      if (set.completed && exercise.metric === 'duration' && duration === null) throw Error(exercise.name + ' needs a duration.');
      if (set.completed && exercise.metric !== 'duration' && reps === null) throw Error(exercise.name + ' needs reps.');
    }
  }

  async function saveManual(): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    try {
      const current = draftRef.current;
      validate(current);
      const completed = current.completed;
      const timer = { ...timerState(current), session_status: completed ? 'completed' as const : 'draft' as const, finished_at_ms: completed ? current.finishedAtMs ?? currentTimestamp() : null };
      const candidate = withTimer(current, timer);
      const workout = makeWorkout(candidate);
      workout.owner_id = profile!.id;
      workout.session_status = timer.session_status;
      workout.finished_at_ms = timer.finished_at_ms;
      await repo.saveWorkoutBundle(workout, makeBundle(candidate, workout));
      readyRef.current = false; setReady(false); changed();
      return true;
    } catch (error) { message(error); return false; }
    finally { setSaving(false); }
  }

  async function togglePause() {
    if (actionLock.current) return;
    const current = draftRef.current;
    if (current.sessionStatus !== 'running' && current.sessionStatus !== 'paused') return;
    actionLock.current = true; setTimerActionBusy(true);
    try {
      const state = timerState(current);
      const timestamp = currentTimestamp();
      const nextTimer = current.sessionStatus === 'running' ? pauseWorkoutTimer(state, timestamp) : resumeWorkoutTimer(state, timestamp);
      updateDraft(value => withTimer(value, nextTimer));
      await persistQueue.current;
      setNow(currentTimestamp());
      changed();
    } catch (error) { message(error); }
    finally { actionLock.current = false; setTimerActionBusy(false); }
  }

  async function saveAndExit() {
    try {
      await persistQueue.current.catch(() => undefined);
      const current = draftRef.current;
      if (!current.original || !profile) throw Error('Workout session could not be saved.');
      const workout = makeWorkout(current);
      workout.owner_id = profile.id;
      await repo.persistWorkoutSession(workout, makeBundle(current, workout));
      changed();
      router.back();
    } catch (error) { message(error); }
  }

  async function finishLiveWorkout(close: (after?: () => void) => void) {
    if (saving) return;
    setSaving(true);
    try {
      await persistQueue.current.catch(() => undefined);
      const current = draftRef.current;
      const endedAt = currentTimestamp();
      const timer = finishWorkoutTimer(timerState(current), endedAt);
      const seconds = timer.elapsed_seconds;
      const candidate = { ...withTimer(current, timer), completed: true, duration: String(Math.ceil(seconds / 60)) };
      validate(candidate, true);
      if (!candidate.original || !profile) throw Error('Workout session could not be saved.');
      const workout = makeWorkout(candidate, endedAt);
      workout.owner_id = profile.id;
      workout.completed = 1;
      workout.duration_min = Math.ceil(seconds / 60);
      await repo.persistWorkoutSession(workout, makeBundle(candidate, workout));
      draftRef.current = candidate; setDraft(candidate);
      readyRef.current = false; setReady(false);
      changed();
      close(() => router.back());
    } catch (error) { message(error); }
    finally { setSaving(false); }
  }

  function discardWorkout() {
    if (!draft.original || !profile) return;
    confirm('Discard workout?', async () => {
      await persistQueue.current.catch(() => undefined);
      await repo.discardWorkoutSession(profile.id, draft.original!.id);
      readyRef.current = false; setReady(false); changed(); router.back();
    }, 'This removes this unfinished workout and its set progress. Saved routines and completed workout history are not changed.', 'Discard');
  }

  const currentDraft = draftRef.current;
  const totalSets = draft.items.reduce((sum, item) => sum + item.sets.length, 0);
  const doneSets = draft.items.reduce((sum, item) => sum + item.sets.filter(set => set.completed).length, 0);
  const completedVolume = draft.items.reduce((sum, item) => sum + item.sets.reduce((total, set) => total + (set.completed ? (Number(set.weight) || 0) * (Number(set.reps) || 0) : 0), 0), 0);
  const activeExercise = draft.items.findIndex(item => item.sets.some(set => !set.completed));
  const live = draft.sessionStatus === 'running' || draft.sessionStatus === 'paused';
  const timerText = formatWorkoutElapsed(elapsedWorkoutSeconds(timerState(draft), now));

  return <Page title="">
    {!ready ? <Card><Text style={styles.muted}>Opening workout…</Text></Card> : <>
      {live && <View style={{ gap: 9 }}>
        <DisplayMetric value={timerText} size={timerText.length > 5 ? 45 : 77}/>
        <Text style={{ color: draft.sessionStatus === 'paused' ? colors.ink : colors.muted, fontFamily: fonts.bold, fontSize: 12 }}>{draft.sessionStatus === 'paused' ? 'Paused' : 'Workout in progress'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}><Button title={timerActionBusy ? 'Please wait…' : draft.sessionStatus === 'paused' ? 'Resume' : 'Pause'} disabled={timerActionBusy} onPress={togglePause}/></View>
          <View style={{ flex: 1, minWidth: 0 }}><Button title="Finish" kind="ghost" onPress={() => setFinishing(true)}/></View>
        </View>
      </View>}
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Completed sets: {doneSets}/{totalSets}</Text><ProgressBar value={totalSets ? doneSets / totalSets : 0}/>
      <View style={{ flexDirection: 'row', gap: 8 }}>{[
        { label: 'Sets', value: `${doneSets}/${totalSets}`, fill: colors.lilac },
        { label: 'Volume', value: `${Math.round(completedVolume)} kg`, fill: colors.sun },
        { label: 'Exercises', value: draft.items.length, fill: colors.mint },
      ].map(item => <View key={item.label} style={{ flex: 1, minWidth: 0, padding: 13, borderRadius: 24, backgroundColor: item.fill }}><Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 10, textTransform: 'uppercase' }}>{item.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 27, marginTop: 7 }}>{item.value}</Text></View>)}</View>
      <View style={{ gap: 10, paddingVertical: 8 }}>
        <Field label="Workout name" value={draft.name} onChangeText={name => updateDraft(current => ({ ...current, name }))}/>
        <Button title={detailsOpen ? 'Hide session details' : 'Session details'} kind="ghost" onPress={() => setDetailsOpen(!detailsOpen)}/>
      </View>
      {detailsOpen && <Card>
        {live ? <Text style={styles.muted}>Started {draft.day} at {draft.start}. The timer saves active time automatically.</Text> : <>
          <Field label="Date (YYYY-MM-DD)" value={draft.day} onChangeText={day => updateDraft(current => ({ ...current, day }))}/>
          <Field label="Start time (HH:MM local)" value={draft.start} onChangeText={start => updateDraft(current => ({ ...current, start }))} placeholder="18:30"/>
          <Field label="Duration (minutes, optional)" value={draft.duration} onChangeText={duration => updateDraft(current => ({ ...current, duration }))} keyboardType="numeric"/>
          <Choices label="Status" options={['Completed', 'Draft']} value={draft.completed ? 'Completed' : 'Draft'} onChange={value => updateDraft(current => ({ ...current, completed: value === 'Completed', sessionStatus: value === 'Completed' ? 'completed' : 'draft' }))}/>
        </>}
        <Field label="Notes" value={draft.notes} onChangeText={notes => updateDraft(current => ({ ...current, notes }))} multiline/>
      </Card>}
      <SectionHeader title="Exercises and sets"/>
      {draft.items.map((item, i) => {
        const exercise = exercises.find(row => row.id === item.exerciseId);
        return <Card key={item.id} accent={i === activeExercise}>
          <View style={styles.row}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 36, lineHeight: 38, letterSpacing: -1, flex: 1, minWidth: 100, includeFontPadding: false }}>{exercise?.name ?? 'Exercise'}</Text><Button title="Edit" kind="ghost" onPress={() => { setEditingExercise(i); setPicker(true); }}/></View>
          {item.sets.map((set, j) => <WorkoutSetRow key={set.id} set={set} index={j} metric={exercise?.metric ?? 'weight_reps'} onChange={patch => updateSet(i, j, patch)} onRemove={() => updateItem(i, row => ({ ...row, sets: row.sets.filter((_, index) => index !== j) }))}/>) }
          <View style={styles.row}><Button title="Add set" kind="ghost" onPress={() => updateItem(i, row => ({ ...row, sets: [...row.sets, blankSet()] }))}/><Button title="Remove exercise" kind="danger" onPress={() => confirm('Remove exercise?', () => updateDraft(current => ({ ...current, items: current.items.filter((_, index) => index !== i) })))}/></View>
        </Card>;
      })}
      <Button title="Add exercise" kind="ghost" disabled={!ready || !exercisesReady} onPress={() => { setEditingExercise(null); setPicker(true); }}/>
      {live ? <>
        <Button title="Save and Exit" kind="ghost" onPress={saveAndExit}/>
        <Button title="Discard workout" kind="danger" onPress={discardWorkout}/>
      </> : <>
        <Button title={saving ? 'Saving…' : 'Save workout'} disabled={!ready || !exercisesReady || saving} onPress={() => setFinishing(true)}/>
        {draft.original?.completed ? <Button title="Discard changes" kind="ghost" disabled={!ready || saving} onPress={() => router.back()}/> : <Button title="Discard changes" kind="ghost" disabled={!ready || saving} onPress={() => confirm('Discard workout changes?', () => router.back(), 'This removes unsaved changes only.', 'Discard')}/>}
      </>}
      <BottomSheet visible={picker} title="Add exercise" onClose={() => setPicker(false)}>{close => <>
        {exercises.map(exercise => <Button key={exercise.id} title={exercise.name} kind="ghost" onPress={() => { chooseExercise(exercise); close(); }}/>) }
        <Field label="Custom exercise name" value={custom} onChangeText={setCustom}/><Button title="Create custom exercise" onPress={() => createCustom(close)}/>
      </>}</BottomSheet>
      <BottomSheet visible={finishing} title={live ? 'Finish workout?' : 'Save workout'} onClose={() => setFinishing(false)}>{close => <>
        <Text style={styles.text}>{live ? `Active time: ${formatWorkoutElapsed(elapsedWorkoutSeconds(timerState(currentDraft), now))}` : `Completed sets: ${doneSets}/${totalSets}`}</Text>
        <Text style={styles.muted}>Only completed sets count toward workout statistics and records.</Text>
        <Button title={saving ? 'Saving…' : live ? 'Finish workout' : 'Save workout'} disabled={saving} onPress={async () => { if (live) await finishLiveWorkout(close); else if (await saveManual()) close(() => router.back()); }}/>
        <Button title="Back" kind="ghost" onPress={() => close()}/>
      </>}</BottomSheet>
    </>}
  </Page>;
}
