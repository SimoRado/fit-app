import React, { useEffect, useRef, useState } from 'react';
import { DateField } from '../ui/DateField';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
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
import { ProgressBar } from '../ui/visuals';
import { AddSetRow, SetHeader, SetRow } from '../ui/SetRow';
import { activeExerciseIndex, formatPreviousSet, previousPerformance, removeAt, restRemaining, workoutTotals } from '../core/routineDraft';
import { moveInList } from '../core/gymSchedule';
import { useReducedMotion } from '../ui/motion';
import { colors, fonts } from '../ui/theme';
import { CircleButton, EmptyAction, MenuItem, StatTrio, usePalette } from '../ui/voltKit';
import { ExerciseBrowser } from '../ui/ExerciseBrowser';
import { interstitialManager } from '../services/adMob';

const blankSet = (): DraftSet => ({ id: uid(), reps: '', weight: '', duration: '', note: '', completed: false });
const emptyDraft = (): WorkoutDraft => ({ original: null, name: '', day: dayKey(), start: localTime(), duration: '', notes: '', completed: false, items: [], sessionStatus: 'draft', elapsedSeconds: 0, runningSinceMs: null, pausedSinceMs: null, pausedSeconds: 0, finishedAtMs: null });
const currentTimestamp = () => Date.now();
/** Default rest between sets, started when a set is checked off during a live session. */
const REST_SECONDS = 90;
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
  const [exerciseMenu, setExerciseMenu] = useState<number | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [previous, setPrevious] = useState<Map<string, WorkoutSet[]>>(new Map());
  const [muscles, setMuscles] = useState<Map<string, string>>(new Map());
  const reduced = useReducedMotion();
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
  }

  useEffect(() => {
    let active = true;
    repo.exercises().then(rows => { if (active) { setExercises(rows); setExercisesReady(true); } }).catch(error => { if (active) message(error); });
    repo.exerciseMuscles().then(rows => { if (active) setMuscles(new Map(rows.map(row => [row.exercise_id, row.muscle_group]))); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Previous performance: the latest other completed session for each exercise.
  const currentWorkoutId = draft.original?.id ?? null;
  useEffect(() => {
    let active = true;
    Promise.all([repo.trainingWorkouts(), repo.workoutExercises(), repo.workoutSets()])
      .then(([workouts, links, sets]) => { if (active) setPrevious(previousPerformance(workouts, links, sets, currentWorkoutId)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [currentWorkoutId]);



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

  // The elapsed timer ticks inside <LiveTimer>, so the exercise list does not re-render every second.

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
  /** Picker selection: accidental duplicates are confirmed explicitly instead of added silently. */
  function pickExercise(exercise: Exercise, close: (after?: () => void) => void) {
    const duplicate = draftRef.current.items.some((item, index) => index !== editingExercise && item.exerciseId === exercise.id);
    if (duplicate && editingExercise !== null) { Alert.alert(localize('Already in this workout', languageRef.current), localize('Choose a different exercise to replace it with.', languageRef.current)); return; }
    if (duplicate) {
      Alert.alert(localize('Already in this workout', languageRef.current), localize('Add this exercise a second time?', languageRef.current), [
        { text: localize('Cancel', languageRef.current), style: 'cancel' },
        { text: localize('Add again', languageRef.current), onPress: () => { chooseExercise(exercise); close(); } },
      ]);
      return;
    }
    chooseExercise(exercise); close();
  }
  /** New sets copy the previous set's values (not its completion) so the user only adjusts. */
  function addSet(index: number) {
    updateItem(index, item => { const last = item.sets.at(-1); return { ...item, sets: [...item.sets, last ? { ...blankSet(), reps: last.reps, weight: last.weight, duration: last.duration } : blankSet()] }; });
  }
  function removeSet(index: number, setIndex: number) {
    const set = draftRef.current.items[index]?.sets[setIndex];
    if (!set) return;
    const apply = () => updateItem(index, item => ({ ...item, sets: removeAt(item.sets, setIndex) }));
    if (set.completed) confirm('Remove completed set?', apply, 'This set is marked as done. Removing it also removes it from this workout’s totals.', 'Remove');
    else apply();
  }
  function toggleSet(index: number, setIndex: number) {
    const set = draftRef.current.items[index]?.sets[setIndex];
    if (!set) return;
    updateSet(index, setIndex, { completed: !set.completed });
    const live = draftRef.current.sessionStatus === 'running' || draftRef.current.sessionStatus === 'paused';
    if (!set.completed && live) setRestEndsAt(currentTimestamp() + REST_SECONDS * 1000);
  }
  function moveItem(index: number, direction: -1 | 1) {
    updateDraft(current => ({ ...current, items: moveInList(current.items, index, index + direction) }));
  }
  function removeItem(index: number) {
    const item = draftRef.current.items[index];
    if (!item) return;
    const apply = () => updateDraft(current => ({ ...current, items: removeAt(current.items, index) }));
    if (item.sets.some(set => set.completed)) confirm('Remove exercise?', apply, 'It has completed sets in this workout. Your earlier workouts are not affected.', 'Remove');
    else apply();
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

  async function saveManual(): Promise<{ completedWorkoutId: string | null } | null> {
    if (saving) return null;
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
      return { completedWorkoutId: completed && !current.original?.completed ? workout.id : null };
    } catch (error) { message(error); return null; }
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
      close(() => { router.back(); interstitialManager.afterWorkoutSaved(workout.id); });
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
  // One derivation feeds the summary, the progress bar and every exercise block.
  const totals = workoutTotals(draft.items);
  const activeExercise = activeExerciseIndex(draft.items);
  const live = draft.sessionStatus === 'running' || draft.sessionStatus === 'paused';
  const menuItem = exerciseMenu !== null ? draft.items[exerciseMenu] : undefined;
  const nameOf = (exerciseId: string) => exercises.find(row => row.id === exerciseId)?.name ?? 'Exercise';

  return <Page title={live ? '' : draft.original?.completed ? 'Edit workout' : 'Log workout'}
    headerContent={live ? <LiveTimer timer={timerState(draft)}/> : undefined}
    headerAction={live && ready ? <Pressable accessibilityRole="button" accessibilityLabel="Finish workout" onPress={() => setFinishing(true)} style={({ pressed }) => ({ minWidth: 72, minHeight: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.g2 === '#0B1446' ? '#0B1446' : colors.g1, transform: [{ scale: pressed ? 0.95 : 1 }] })}><Text style={{ color: colors.g2 === '#0B1446' ? '#FFFFFF' : colors.plInk, fontFamily: fonts.bold, fontSize: 13 }}>Finish</Text></Pressable> : undefined}
    footer={ready ? <>
      <View style={{ flex: 1 }}><Button title="+ Exercise" kind="ghost" disabled={!exercisesReady} onPress={() => { setEditingExercise(null); setPicker(true); }}/></View>
      <View style={{ flex: 1.3 }}><Button title={live ? '✓  Complete' : saving ? 'Saving…' : 'Save workout'} disabled={saving} onPress={() => setFinishing(true)}/></View>
    </> : undefined}>
    {!ready ? <Card><Text style={styles.muted}>Opening workout…</Text></Card> : <>
      {/* `.wprog` + routine name + pause control */}
      <ProgressBar value={totals.totalSets ? totals.doneSets / totals.totalSets : 0}/>
      {live && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: draft.sessionStatus === 'paused' ? colors.accent : colors.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{draft.sessionStatus === 'paused' ? 'Paused · ' : ''}{draft.name || 'Workout in progress'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={draft.sessionStatus === 'paused' ? 'Resume workout timer' : 'Pause workout timer'} disabled={timerActionBusy} onPress={togglePause} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: draft.sessionStatus === 'paused' ? colors.g1 : colors.bg === '#F5F9FF' ? colors.soft1 : colors.card2, opacity: timerActionBusy ? 0.5 : 1 }}>
          <Ionicons name={draft.sessionStatus === 'paused' ? 'play' : 'pause'} size={12} color={draft.sessionStatus === 'paused' ? colors.plInk : colors.text}/>
          <Text style={{ color: draft.sessionStatus === 'paused' ? colors.plInk : colors.text, fontFamily: fonts.bold, fontSize: 11.5 }}>{draft.sessionStatus === 'paused' ? 'Resume' : 'Pause'}</Text>
        </Pressable>
      </View>}
      <StatTrio items={[{ label: 'Sets', value: `${totals.doneSets}/${totals.totalSets}` }, { label: 'Volume', value: `${Math.round(totals.volume).toLocaleString()} kg` }, { label: 'Exercises', value: String(totals.exercises) }]}/>

      {/* Exercise blocks (prototype `.exb`): flat, upcoming blocks dimmed. */}
      {draft.items.map((item, i) => {
        const exercise = exercises.find(row => row.id === item.exerciseId);
        const metric = exercise?.metric ?? 'weight_reps';
        const name = exercise?.name ?? 'Exercise';
        const doneInExercise = item.sets.filter(set => set.completed).length;
        const finished = item.sets.length > 0 && doneInExercise === item.sets.length;
        const upcoming = live && activeExercise >= 0 && i > activeExercise;
        const previousSets = previous.get(item.exerciseId);
        return <Animated.View key={item.id} entering={reduced ? undefined : FadeInDown.duration(260)} exiting={reduced ? undefined : FadeOut.duration(160)} layout={reduced ? undefined : LinearTransition.duration(240)} style={{ marginTop: 14, opacity: live && (finished || upcoming) ? 0.55 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 28, letterSpacing: -0.8, includeFontPadding: false }}>{name}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{muscles.get(item.exerciseId) ?? (exercise?.custom ? 'Custom' : '')}</Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>{doneInExercise} / {item.sets.length}</Text>
              </View>
            </View>
            <CircleButton icon="ellipsis-horizontal" size={34} label={`Options for ${name}`} onPress={() => setExerciseMenu(i)}/>
          </View>
          {item.sets.length ? <SetHeader metric={metric} live/> : <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12.5, paddingVertical: 6 }}>No sets. Add a set or remove this exercise.</Text>}
          {item.sets.map((set, j) => <SetRow key={set.id} group={i} index={j} metric={metric} exerciseName={name} live completed={set.completed}
            previous={formatPreviousSet(previousSets?.[j], metric)}
            values={{ reps: set.reps, weight: set.weight, duration: set.duration, note: set.note }}
            onChange={patch => updateSet(i, j, patch)}
            onToggle={() => toggleSet(i, j)}
            onRemove={() => removeSet(i, j)}/>)}
          <AddSetRow onPress={() => addSet(i)}/>
        </Animated.View>;
      })}
      {draft.items.length === 0 && <EmptyAction text="Add your first exercise" onPress={() => { setEditingExercise(null); setPicker(true); }}/>}

      {/* Session details: name always; date/time/status only for manual (non-live) logging. */}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(!detailsOpen)} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, marginTop: 8 }}>
        <Ionicons name={detailsOpen ? 'chevron-up' : 'create-outline'} size={14} color={colors.accent}/><Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>{detailsOpen ? 'Hide session details' : 'Session name, notes & details'}</Text>
      </Pressable>
      {detailsOpen && <Card>
        <Field label="Workout name" value={draft.name} onChangeText={name => updateDraft(current => ({ ...current, name }))}/>
        {live ? <Text style={styles.muted}>Started {draft.day} at {draft.start}. The timer saves active time automatically.</Text> : <>
          <DateField label="Date" value={draft.day} onChange={day => updateDraft(current => ({ ...current, day }))}/>
          <Field label="Start time (HH:MM local)" value={draft.start} onChangeText={start => updateDraft(current => ({ ...current, start }))} placeholder="18:30"/>
          <Field label="Duration (minutes, optional)" value={draft.duration} onChangeText={duration => updateDraft(current => ({ ...current, duration }))} keyboardType="numeric"/>
          <Choices label="Status" options={['Completed', 'Draft']} value={draft.completed ? 'Completed' : 'Draft'} onChange={value => updateDraft(current => ({ ...current, completed: value === 'Completed', sessionStatus: value === 'Completed' ? 'completed' : 'draft' }))}/>
        </>}
        <Field label="Notes" value={draft.notes} onChangeText={notes => updateDraft(current => ({ ...current, notes }))} multiline/>
      </Card>}
      {!live && (draft.original?.completed ? <Button title="Discard changes" kind="ghost" disabled={saving} onPress={() => router.back()}/> : <Button title="Discard changes" kind="ghost" disabled={saving} onPress={() => confirm('Discard workout changes?', () => router.back(), 'This removes unsaved changes only.', 'Discard')}/>)}

      {/* Rest timer chip, floating above the dock. */}
      {restEndsAt !== null && <RestTimer endsAt={restEndsAt} onAdjust={delta => setRestEndsAt(value => value === null ? null : Math.max(currentTimestamp() + 5000, value + delta * 1000))} onSkip={() => setRestEndsAt(null)}/>}

      <BottomSheet visible={picker} title={editingExercise !== null ? 'Replace exercise' : 'Add exercise'} onClose={() => setPicker(false)}>{close => <>
        <ExerciseBrowser selectedIds={new Set(draft.items.filter((_, index) => index !== editingExercise).map(item => item.exerciseId))} onSelect={exercise => pickExercise(exercise, close)}/>
        <Field label="Custom exercise name" value={custom} onChangeText={setCustom}/><Button title="Create custom exercise" kind="ghost" disabled={!custom.trim()} onPress={() => createCustom(close)}/>
      </>}</BottomSheet>

      <BottomSheet visible={!!menuItem} title={menuItem ? nameOf(menuItem.exerciseId) : 'Exercise'} onClose={() => setExerciseMenu(null)}>{close => menuItem && exerciseMenu !== null && <View style={{ gap: 6 }}>
        <MenuItem icon="arrow-up" label="Move up" disabled={exerciseMenu <= 0} onPress={() => { moveItem(exerciseMenu, -1); setExerciseMenu(exerciseMenu - 1); }}/>
        <MenuItem icon="arrow-down" label="Move down" disabled={exerciseMenu >= draft.items.length - 1} onPress={() => { moveItem(exerciseMenu, 1); setExerciseMenu(exerciseMenu + 1); }}/>
        <MenuItem icon="swap-horizontal" label="Replace exercise" onPress={() => { const index = exerciseMenu; close(() => { setEditingExercise(index); setPicker(true); }); }}/>
        <MenuItem icon="trash-outline" label="Remove exercise" danger onPress={() => { const index = exerciseMenu; close(() => removeItem(index)); }}/>
      </View>}</BottomSheet>

      <BottomSheet visible={finishing} title={live ? 'Finish workout?' : 'Save workout'} onClose={() => setFinishing(false)}>{close => <>
        <StatTrio items={[{ label: 'Sets', value: `${totals.doneSets}/${totals.totalSets}` }, { label: 'Volume', value: `${Math.round(totals.volume).toLocaleString()} kg` }, { label: 'Exercises', value: String(totals.exercises) }]}/>
        {live && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={styles.muted}>Active time</Text><LiveTimer timer={timerState(currentDraft)} size={18}/></View>}
        <Text style={styles.muted}>Only completed sets count toward workout statistics and records.{live && totals.doneSets < totals.totalSets ? ` ${totals.totalSets - totals.doneSets} set${totals.totalSets - totals.doneSets === 1 ? ' is' : 's are'} not checked yet.` : ''}</Text>
        <Button title={saving ? 'Saving…' : live ? 'Finish workout' : 'Save workout'} disabled={saving} onPress={async () => { if (live) await finishLiveWorkout(close); else { const result = await saveManual(); if (result) close(() => { router.back(); if (result.completedWorkoutId) interstitialManager.afterWorkoutSaved(result.completedWorkoutId); }); } }}/>
        {live && <Button title="Save and Exit" kind="ghost" disabled={saving} onPress={() => close(() => { void saveAndExit(); })}/>}
        {live && <Button title="Discard workout" kind="danger" disabled={saving} onPress={() => close(discardWorkout)}/>}
        <Button title="Keep training" kind="ghost" onPress={() => close()}/>
      </>}</BottomSheet>
    </>}
  </Page>;
}

/** Floating rest countdown (`absolute` end time, so it never drifts on re-render). */
/** Self-ticking elapsed workout time; only this text re-renders each second. */
function LiveTimer({ timer, size = 42 }: { timer: WorkoutTimerState; size?: number }) {
  const [now, setNow] = useState(currentTimestamp);
  const running = timer.session_status === 'running';
  useEffect(() => {
    setNow(currentTimestamp());
    if (!running) return;
    const tick = setInterval(() => setNow(currentTimestamp()), 1000);
    return () => clearInterval(tick);
  }, [running, timer.running_since_ms, timer.elapsed_seconds]);
  const text = formatWorkoutElapsed(elapsedWorkoutSeconds(timer, now));
  const fontSize = size >= 40 && text.length > 5 ? size * 0.8 : size;
  return <Text accessibilityRole="timer" accessibilityLabel={`Elapsed ${text}`} style={{ textAlign: 'center', color: colors.text, fontFamily: fonts.displayHeavy, fontSize, lineHeight: Math.round(fontSize * 1.15), letterSpacing: size >= 40 ? -1.2 : 0, fontVariant: ['tabular-nums'] }}>{text}</Text>;
}

function RestTimer({ endsAt, onAdjust, onSkip }: { endsAt: number; onAdjust: (delta: number) => void; onSkip: () => void }) {
  const p = usePalette();
  const [now, setNow] = useState(currentTimestamp);
  useEffect(() => {
    setNow(currentTimestamp());
    const tick = setInterval(() => setNow(currentTimestamp()), 500);
    return () => clearInterval(tick);
  }, [endsAt]);
  const seconds = restRemaining(endsAt, now);
  const reduced = useReducedMotion();
  const done = seconds <= 0;
  const chip = { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.14)' };
  return <Animated.View entering={reduced ? undefined : FadeInDown.duration(220)} exiting={reduced ? undefined : FadeOut.duration(160)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: 22, backgroundColor: done ? p.lime : p.heroCard }}>
    <Ionicons name={done ? 'notifications' : 'timer-outline'} size={18} color={done ? '#0B1446' : '#FFFFFF'}/>
    <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: done ? '#0B1446' : '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 18, fontVariant: ['tabular-nums'] }}>{done ? 'Rest over' : `Rest ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>
    {!done && <Pressable accessibilityRole="button" accessibilityLabel="Rest 15 seconds less" onPress={() => onAdjust(-15)} style={chip}><Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11 }}>−15</Text></Pressable>}
    {!done && <Pressable accessibilityRole="button" accessibilityLabel="Rest 15 seconds more" onPress={() => onAdjust(15)} style={chip}><Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11 }}>+15</Text></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel={done ? 'Dismiss rest timer' : 'Skip rest'} onPress={onSkip} style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#0B1446' : '#DFFF1F' }}><Text style={{ color: done ? '#FFFFFF' : '#0B1446', fontFamily: fonts.bold, fontSize: 12 }}>{done ? 'OK' : 'Skip'}</Text></Pressable>
  </Animated.View>;
}
