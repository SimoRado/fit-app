import React, { useEffect, useMemo, useState } from 'react';
import { WeekCalendar } from '../../ui/WeekCalendar';
import { router } from 'expo-router';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay } from '../../core/date';
import { GymDayPlan, gymSchedulePreferenceKey, parseGymSchedule, planForWeekday, resolveDayPlan, serializeGymSchedule, setGymDayPlan } from '../../core/gymSchedule';
import { decodeRoutineTargets, routineSetsPreferenceKey, type TargetSet } from '../../core/routineDraft';
import { workoutStats } from '../../core/logic';
import { Exercise, Routine, RoutineExercise, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { useLoadState } from '../../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonRow, SkeletonScreen } from '../../ui/Skeleton';
import { Button, Page, message, confirm } from '../../ui/components';
import { fonts, brand } from '../../ui/theme';
import { WorkoutInProgressCard } from '../../ui/WorkoutInProgressCard';
import { BottomSheet } from '../../ui/BottomSheet';
import { MotionPressable } from '../../ui/MotionPressable';
import { useReducedMotion } from '../../ui/motion';
import { CircleButton, EmptyAction, IconBox, MenuItem, SectionLink, StatTrio, isLight, useEntering, usePalette } from '../../ui/voltKit';
import type { OpenWorkout } from '../../data/db';

const covers = [
  { background: brand.violet, ink: brand.orchid },
  { background: brand.lavender, ink: brand.ink },
  { background: brand.orchid, ink: brand.violet },
  { background: brand.ink, ink: brand.lavender },
] as const;
const daysAgo = (day: string, today: string) => Math.round((fromDay(today).getTime() - fromDay(day).getTime()) / 86400000);
const lastDoneLabel = (day: string | undefined, today: string) => {
  if (!day) return 'Not done yet';
  const ago = daysAgo(day, today);
  return ago <= 0 ? 'Done today' : ago === 1 ? 'Last done yesterday' : ago < 14 ? `Last done ${ago} days ago` : `Last done ${Math.round(ago / 7)} weeks ago`;
};

/** Placeholder for the routine gallery, exercise preview, actions and history. */
function TrainSkeleton({ cardWidth }: { cardWidth: number }) {
  return <SkeletonScreen label="Loading your training">
    <SkeletonBlock width={112} height={15} radius={8} style={{ marginTop: 6 }}/>
    <View style={{ flexDirection: 'row', gap: 12, marginRight: -18, overflow: 'hidden' }}>
      {[0, 1].map(index => <SkeletonCard key={index} tone="soft" style={{ width: cardWidth, height: 178, justifyContent: 'flex-end', gap: 8 }}>
        <SkeletonBlock width="40%" height={10} radius={5}/><SkeletonBlock width="64%" height={18} radius={9}/><SkeletonBlock width="46%" height={10} radius={5}/>
      </SkeletonCard>)}
    </View>
    <SkeletonBlock width={150} height={15} radius={8} style={{ marginTop: 6 }}/>
    <View style={{ gap: 8 }}>{[0, 1, 2].map(index => <SkeletonRow key={index}/>)}</View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><SkeletonBlock width={undefined} height={50} radius={25} style={{ flex: 1 }}/><SkeletonBlock width={undefined} height={50} radius={25} style={{ flex: 1 }}/></View>
    <SkeletonBlock width={80} height={15} radius={8} style={{ marginTop: 6 }}/>
    <View style={{ flexDirection: 'row', gap: 8 }}>{[0, 1, 2].map(index => <SkeletonBlock key={index} width={undefined} height={64} radius={18} style={{ flex: 1 }}/>)}</View>
  </SkeletonScreen>;
}

/** Volt Train (prototype `tr12`): routine gallery, exercise preview, history and actions. */
export default function Workouts() {
  const { profile, language, changed } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const { width } = useWindowDimensions();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [links, setLinks] = useState<RoutineExercise[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [rest, setRest] = useState<string[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<GymDayPlan[]>([]);
  const [preferences, setPreferences] = useState<Map<string, string>>(new Map());
  const [planningDay, setPlanningDay] = useState<string | null>(null);
  const [calendarDay, setCalendarDay] = useState(dayKey());
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [active, setActive] = useState(0);
  const [routineMenu, setRoutineMenu] = useState<Routine | null>(null);
  // Loading, "no routines yet" and a failed read are different states: empty states wait for the first read.
  const load = useLoadState('workouts');
  const { attempt, succeed, fail } = load;

  useEffect(() => {
    if (!profile?.id) return;
    let current = true;
    // Exercise names: only the exercises used by routines, not the whole catalog.
    Promise.all([repo.workouts(), repo.trainingWorkouts(), repo.routines(), repo.routineExercises(), repo.routineExerciseList(), repo.restDays(), repo.preferences(), repo.openWorkoutSession(profile.id)])
      .then(([allWorkouts, completedWorkouts, savedRoutines, routineLinks, routineExercises, days, preferences, open]) => {
        if (!current) return;
        setWorkouts(allWorkouts); setTraining(completedWorkouts); setRoutines(savedRoutines); setLinks(routineLinks); setExercises(routineExercises); setRest(days.map(x => x.day)); setWeeklyPlan(parseGymSchedule(preferences.find(item => item.key === gymSchedulePreferenceKey)?.value)); setPreferences(new Map(preferences.map(item => [item.key, item.value]))); setOpenWorkout(open);
        succeed();
      }).catch(error => { if (current && !fail()) message(error); });
    return () => { current = false; };
  }, [revision, profile?.id, attempt, succeed, fail]);

  const stats = workoutStats(training);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const recentWorkouts = workouts.filter(workout => workout.id !== openWorkout?.id);
  const last30 = training.filter(workout => workout.day >= addDays(today, -29));
  const avgMinutes = last30.filter(workout => workout.duration_min).length ? Math.round(last30.reduce((sum, workout) => sum + (workout.duration_min ?? 0), 0) / last30.filter(workout => workout.duration_min).length) : null;
  const cardWidth = Math.round((Math.min(width, 620) - 36) * 0.82);
  const current = routines[Math.min(active, Math.max(0, routines.length - 1))];
  const exerciseName = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise])), [exercises]);
  const currentLinks = current ? links.filter(link => link.routine_id === current.id) : [];
  const selectedPlan = planningDay ? planForWeekday(weeklyPlan, fromDay(planningDay).getDay()) : null;
  const selectedPlanRoutine = selectedPlan?.kind === 'routine' ? routines.find(routine => routine.id === selectedPlan.routineId) : null;
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12));
    if (index !== active) setActive(Math.max(0, Math.min(routines.length - 1, index)));
  };
  const startRoutine = (routine: Routine) => router.push({ pathname: '/workout-form', params: { routine: routine.id } });
  const routineIds = useMemo(() => new Set(routines.map(routine => routine.id)), [routines]);
  const linksOf = (routineId: string) => links.filter(link => link.routine_id === routineId);
  /** Planned sets for a routine, aligned with its exercise order (empty when none were planned). */
  const plannedSets = (routineId: string) => decodeRoutineTargets(preferences.get(routineSetsPreferenceKey(routineId)), linksOf(routineId).map(link => link.exercise_id));
  const setCountOf = (routineId: string) => plannedSets(routineId).reduce((sum, sets) => sum + Math.max(1, sets.length), 0);
  const todayPlan = resolveDayPlan(weeklyPlan, today, rest, routineIds);
  const todayRoutine = todayPlan?.kind === 'routine' ? routines.find(routine => routine.id === todayPlan.routineId) : undefined;
  const trainedToday = training.some(workout => workout.day === today);
  function deleteRoutineConfirmed(routine: Routine, close: (after?: () => void) => void) {
    confirm(`Delete “${routine.name}”?`, async () => {
      if (!profile) return;
      await repo.deleteRoutine(profile.id, routine.id);
      close(); changed();
    }, 'The routine and its planned sets are removed and it is cleared from your weekly plan. Workouts you already completed stay in your history.', 'Delete routine');
  }
  async function updateWeeklyPlan(next: GymDayPlan | null) {
    if (!planningDay) return;
    const weekday = fromDay(planningDay).getDay();
    const updated = setGymDayPlan(weeklyPlan, weekday, next);
    await repo.setPreference(gymSchedulePreferenceKey, serializeGymSchedule(updated));
    setWeeklyPlan(updated);
    changed();
  }

  const loaded = load.status === 'ready';
  return <Page title="Train" eyebrow={loaded ? `${stats.week} session${stats.week === 1 ? '' : 's'} this week` : ''} headerAction={<CircleButton icon="add" tone="accent" label="Create routine" onPress={() => router.push('/routine-form')}/>}>
    {/* Shared week selector: today and future days only; never navigates before this week. */}
    <WeekCalendar selected={calendarDay} onSelect={setCalendarDay} onDayPress={setPlanningDay} locale={locale} rules={{ minDay: today, startsOn: 1 }}
      marker={day => {
        const done = training.some(workout => workout.day === day);
        const resolved = resolveDayPlan(weeklyPlan, day, rest, routineIds);
        return done ? <Ionicons name="checkmark" size={11} color={day === calendarDay ? p.plInk : p.accent}/>
          : resolved?.kind === 'routine' ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: day === calendarDay ? p.plInk : p.g1 }}/>
            : resolved?.kind === 'rest' ? <Ionicons name="moon" size={10} color={day === calendarDay ? p.plInk : p.muted}/> : null;
      }}/>
    <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>Tap today or a future day to plan a routine or rest. Weekly plans repeat every week; past days stay as they were.</Text>

    {load.status === 'error' && <LoadError text="Could not load your training data." onRetry={load.retry}/>}
    {load.status === 'loading' && <TrainSkeleton cardWidth={cardWidth}/>}
    {loaded && <>
    {/* Today's plan (`.nx` style): start the scheduled routine in one tap. */}
    {!openWorkout && (todayRoutine ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: 22, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
      <IconBox icon={trainedToday ? 'checkmark' : 'calendar-outline'} size={42} radius={14} background={trainedToday ? p.lime : p.soft1} color={trainedToday ? brand.ink : p.accent}/>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${todayRoutine.name}`} onPress={() => router.push({ pathname: '/routine-form', params: { id: todayRoutine.id } })} style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{trainedToday ? 'Planned today · done' : 'Planned today'}</Text>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{todayRoutine.name}</Text>
        <Text style={{ color: p.accent, fontFamily: fonts.semibold, fontSize: 11.5 }}>{linksOf(todayRoutine.id).length} exercises · {setCountOf(todayRoutine.id)} sets</Text>
      </Pressable>
      <MotionPressable pressScale={0.86} accessibilityRole="button" accessibilityLabel={`Start ${todayRoutine.name}`} onPress={() => startRoutine(todayRoutine)} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: p.g1 }}><Ionicons name="play" size={20} color={p.plInk}/></MotionPressable>
    </View> : todayPlan?.kind === 'rest' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 22, backgroundColor: p.soft2 }}>
      <IconBox icon="moon-outline" size={42} radius={14}/>
      <View style={{ flex: 1 }}><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>Rest day</Text><Text style={{ color: p.muted, fontSize: 12 }}>{todayPlan.oneOff ? 'Marked for today only.' : 'Part of your weekly plan.'} Recovery is training too.</Text></View>
    </View> : null)}

    {openWorkout && <WorkoutInProgressCard workout={openWorkout}/>}

    {/* Routine gallery (`.wg`) */}
    <SectionLink title="My routines" action="New" onPress={() => router.push('/routine-form')}/>
    {routines.length ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" disableIntervalMomentum onScroll={onScroll} scrollEventThrottle={32}
        style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 4, gap: 12 }}>
        {routines.map((routine, index) => {
          const lastDone = training.filter(workout => workout.name === routine.name).map(workout => workout.day).sort().at(-1);
          const count = linksOf(routine.id).length;
          const plannedDays = weeklyPlan.filter(item => item.kind === 'routine' && item.routineId === routine.id).map(item => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + item.weekday, 12)));
          return <GalleryCard key={routine.id} width={cardWidth} index={index} on={index === active} cover={covers[index % covers.length]} eyebrow={plannedDays.length ? `Every ${plannedDays.join(', ')}` : lastDoneLabel(lastDone, today)} title={routine.name} meta={`${count} exercise${count === 1 ? '' : 's'} · ${count ? setCountOf(routine.id) : 0} sets`}
            onStart={() => startRoutine(routine)} onMore={() => setRoutineMenu(routine)}/>;
        })}
      </ScrollView>
      {routines.length > 1 && <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>{routines.map((routine, index) => <View key={routine.id} style={{ width: index === active ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: index === active ? p.text : p.borderStrong }}/>)}</View>}
      {current && <>
        <SectionLink title={`${current.name} exercises`} action="Edit" onPress={() => router.push({ pathname: '/routine-form', params: { id: current.id } })}/>
        {currentLinks.length ? <View style={{ gap: 8 }}>{currentLinks.slice(0, 5).map((link, index) => <ExerciseRow key={link.id} index={index} number={index + 1} name={exerciseName.get(link.exercise_id)?.name ?? 'Exercise'} metric={exerciseName.get(link.exercise_id)?.metric} sets={plannedSets(current.id)[index]}/>)}
          {currentLinks.length > 5 && <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12, textAlign: 'center' }}>+{currentLinks.length - 5} more in {current.name}</Text>}</View>
          : <EmptyAction text="This routine has no exercises yet. Add some." onPress={() => router.push({ pathname: '/routine-form', params: { id: current.id } })}/>}
      </>}
    </> : <EmptyAction text="Create your first routine to start training faster." onPress={() => router.push('/routine-form')}/>}

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <View style={{ flex: 1 }}><Button title="Empty workout" onPress={() => router.push('/workout-form')}/></View>
      <View style={{ flex: 1 }}><Button title={rest.includes(today) ? 'Undo rest day' : 'Rest day'} kind="ghost" onPress={async () => { await repo.toggleRest(profile!.id, today); changed(); }}/></View>
    </View>

    {/* History (`.wa-rec`) */}
    <SectionLink title="History"/>
    <StatTrio items={[{ label: 'Sessions', value: String(last30.length) }, { label: 'This month', value: String(stats.month) }, { label: 'Avg time', value: avgMinutes === null ? '—' : `${avgMinutes}m` }]}/>
    <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>Recent sessions · {stats.total} total</Text>
    {recentWorkouts.length ? <View>{recentWorkouts.slice(0, 20).map((workout, index) => <HistoryRow key={workout.id} index={index} workout={workout} locale={locale}
      onOpen={() => router.push({ pathname: '/workout-form', params: { id: workout.id } })}
      onDelete={() => confirm('Delete workout?', async () => { await repo.remove('workouts', workout.id); changed(); })}/>)}</View>
      : <EmptyAction text={workouts.length > 0 && openWorkout ? 'Your current workout is shown above.' : 'Finished workouts will appear here.'}/>}
    </>}

    <BottomSheet visible={!!routineMenu} title={routineMenu?.name ?? 'Routine'} onClose={() => setRoutineMenu(null)}>{close => routineMenu && <View style={{ gap: 6 }}>
      <MenuItem icon="play" label="Start workout" onPress={() => close(() => startRoutine(routineMenu))}/>
      <MenuItem icon="create-outline" label="Edit routine" onPress={() => close(() => router.push({ pathname: '/routine-form', params: { id: routineMenu.id } }))}/>
      <MenuItem icon="trash-outline" label="Delete routine" danger onPress={() => deleteRoutineConfirmed(routineMenu, close)}/>
    </View>}</BottomSheet>

    <BottomSheet visible={!!planningDay} title={planningDay ? `Plan ${new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(fromDay(planningDay))}` : 'Plan day'} onClose={() => setPlanningDay(null)}>{close => planningDay && <View style={{ gap: 6 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>EVERY {new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(fromDay(planningDay)).toUpperCase()}</Text>
      {routines.map(routine => <PlanOption key={routine.id} icon="barbell-outline" label={routine.name} detail={`${linksOf(routine.id).length} exercises · ${setCountOf(routine.id)} sets`} selected={selectedPlan?.kind === 'routine' && selectedPlan.routineId === routine.id}
        onPress={async () => { await updateWeeklyPlan({ weekday: fromDay(planningDay).getDay(), kind: 'routine', routineId: routine.id }); close(); }}/>)}
      {!routines.length && <EmptyAction text="Create a routine to plan it on this day." onPress={() => close(() => router.push('/routine-form'))}/>}
      <PlanOption icon="moon-outline" label="Weekly rest day" selected={selectedPlan?.kind === 'rest'} onPress={async () => { await updateWeeklyPlan({ weekday: fromDay(planningDay).getDay(), kind: 'rest' }); close(); }}/>
      <PlanOption icon="remove-circle-outline" label="No plan" detail="Remove this day’s assignment" selected={!selectedPlan || (selectedPlan.kind === 'routine' && !selectedPlanRoutine)} onPress={async () => { await updateWeeklyPlan(null); close(); }}/>
      {planningDay >= today && <>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, marginTop: 8 }}>ONLY {planningDay === today ? 'TODAY' : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(fromDay(planningDay)).toUpperCase()}</Text>
        <PlanOption icon="bed-outline" label={rest.includes(planningDay) ? 'Undo one-off rest day' : 'Rest on this date only'} selected={rest.includes(planningDay)} onPress={async () => { if (!profile) return; await repo.toggleRest(profile.id, planningDay); changed(); close(); }}/>
      </>}
      {selectedPlanRoutine && planningDay === today && !rest.includes(today) && <View style={{ marginTop: 8 }}><Button title={`Start ${selectedPlanRoutine.name}`} onPress={() => close(() => startRoutine(selectedPlanRoutine))}/></View>}
    </View>}</BottomSheet>
  </Page>;
}

/** `.wg-c` — routine card with a coloured cover; inactive cards shrink and fade. */
function GalleryCard({ width, index, on, cover, eyebrow, title, meta, onStart, onMore }: { width: number; index: number; on: boolean; cover: { background: string; ink: string }; eyebrow: string; title: string; meta: string; onStart: () => void; onMore: () => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const focus = useSharedValue(on ? 1 : 0);
  const entering = useEntering(index);
  useEffect(() => { focus.value = reduced ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 350, easing: Easing.bezier(0.22, 1, 0.36, 1) }); }, [focus, on, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.75 + focus.value * 0.25, transform: [{ scale: 0.96 + focus.value * 0.04 }] }));
  return <Animated.View entering={entering} style={[{ width, borderRadius: 26, overflow: 'hidden', backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} options`} onPress={onMore}>
      <View style={{ height: 178, backgroundColor: cover.background, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="barbell" size={96} color={cover.ink}/>
        <View style={{ position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={18} color={brand.violet}/></View>
      </View>
      <View style={{ paddingTop: 14, paddingBottom: 16, paddingLeft: 16, paddingRight: 76, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{eyebrow}</Text>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 20, letterSpacing: -0.4 }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>{meta}</Text>
      </View>
    </Pressable>
    <MotionPressable pressScale={0.88} accessibilityRole="button" accessibilityLabel={`Start ${title}`} onPress={onStart} style={{ position: 'absolute', right: 14, bottom: 16, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: p.g1 }}><Ionicons name="play" size={20} color={p.plInk}/></MotionPressable>
  </Animated.View>;
}

function ExerciseRow({ number, name, metric, index, sets }: { number: number; name: string; metric?: Exercise['metric']; index: number; sets?: TargetSet[] }) {
  const p = usePalette();
  const entering = useEntering(index);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p.soft1 }}><Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{number}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{name}</Text><Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{plannedSummary(sets, metric)}</Text></View>
    <IconBox icon={metric === 'duration' ? 'timer-outline' : 'barbell-outline'} size={30} radius={10} background="transparent" color={isLight(p) ? p.line3 : p.muted}/>
  </Animated.View>;
}

/** `.wa-h` — history row with a date block. */
function HistoryRow({ workout, locale, onOpen, onDelete, index }: { workout: Workout; locale: string; onOpen: () => void; onDelete: () => void; index: number }) {
  const p = usePalette();
  const entering = useEntering(index);
  const date = fromDay(workout.day);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.border }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${workout.name || 'workout'}`} onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 44, alignItems: 'center' }}><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, lineHeight: 20 }}>{date.getDate()}</Text><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 9.5, textTransform: 'uppercase', marginTop: 3 }}>{new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)}</Text></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15.5 }}>{workout.name || 'Workout'}</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{workout.completed ? 'Completed' : 'Draft'}{workout.duration_min ? ` · ${workout.duration_min} min` : ''}</Text>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Delete workout" hitSlop={6} onPress={onDelete} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isLight(p) ? p.soft1 : p.card2 }}><Ionicons name="trash-outline" size={16} color={p.muted}/></Pressable>
  </Animated.View>;
}

/** "3 sets · 10 reps · 60 kg" style summary of a routine exercise's planned sets. */
function plannedSummary(sets: TargetSet[] | undefined, metric: Exercise['metric'] = 'weight_reps') {
  const count = Math.max(1, sets?.length ?? 0);
  const first = sets?.[0];
  const parts = [`${count} set${count === 1 ? '' : 's'}`];
  if (metric === 'duration') { if (first?.durationSec) parts.push(`${first.durationSec} s`); }
  else {
    if (first?.reps) parts.push(`${first.reps} reps`);
    if (metric === 'weight_reps' && first?.weightKg !== null && first?.weightKg !== undefined) parts.push(`${first.weightKg} kg`);
  }
  return parts.join(' · ');
}

/** Selectable plan option row with a check when selected. */
function PlanOption({ icon, label, detail, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; detail?: string; selected: boolean; onPress: () => void | Promise<void> }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.98} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { void Promise.resolve(onPress()).catch(message); }}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: p.c8, borderWidth: 1.5, borderColor: selected ? p.text : p.c8Line }}>
    <IconBox icon={icon} size={36} background={isLight(p) ? p.soft1 : p.card2}/>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14.5 }}>{label}</Text>{!!detail && <Text numberOfLines={1} style={{ color: p.muted, fontSize: 12 }}>{detail}</Text>}</View>
    {selected && <Ionicons name="checkmark" size={20} color={p.text}/>}
  </MotionPressable>;
}
