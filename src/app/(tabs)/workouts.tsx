import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay, weekStart } from '../../core/date';
import { workoutStats } from '../../core/logic';
import { Exercise, Routine, RoutineExercise, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Page, message, confirm } from '../../ui/components';
import { fonts } from '../../ui/theme';
import { WorkoutInProgressCard } from '../../ui/WorkoutInProgressCard';
import { BottomSheet } from '../../ui/BottomSheet';
import { MotionPressable } from '../../ui/MotionPressable';
import { useReducedMotion } from '../../ui/motion';
import { CircleButton, EmptyAction, IconBox, SectionLink, StatTrio, isLight, useEntering, usePalette } from '../../ui/voltKit';
import type { OpenWorkout } from '../../data/db';

const covers = [
  { background: '#1D2E8F', ink: '#DFFF1F' },
  { background: '#9CCBFF', ink: '#0B1446' },
  { background: '#DFFF1F', ink: '#1D2E8F' },
  { background: '#0B1446', ink: '#9CCBFF' },
] as const;
const daysAgo = (day: string, today: string) => Math.round((fromDay(today).getTime() - fromDay(day).getTime()) / 86400000);
const lastDoneLabel = (day: string | undefined, today: string) => {
  if (!day) return 'Not done yet';
  const ago = daysAgo(day, today);
  return ago <= 0 ? 'Done today' : ago === 1 ? 'Last done yesterday' : ago < 14 ? `Last done ${ago} days ago` : `Last done ${Math.round(ago / 7)} weeks ago`;
};

/** Volt Train (prototype `tr12`): routine gallery, exercise preview, history and actions. */
export default function Workouts() {
  const { profile, language, revision, changed } = useApp();
  const p = usePalette();
  const { width } = useWindowDimensions();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [links, setLinks] = useState<RoutineExercise[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [rest, setRest] = useState<string[]>([]);
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [active, setActive] = useState(0);
  const [routineMenu, setRoutineMenu] = useState<Routine | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    Promise.all([repo.workouts(), repo.trainingWorkouts(), repo.routines(), repo.routineExercises(), repo.exercises(), repo.restDays(), repo.openWorkoutSession(profile.id)])
      .then(([allWorkouts, completedWorkouts, savedRoutines, routineLinks, allExercises, days, open]) => {
        setWorkouts(allWorkouts); setTraining(completedWorkouts); setRoutines(savedRoutines); setLinks(routineLinks); setExercises(allExercises); setRest(days.map(x => x.day)); setOpenWorkout(open);
      }).catch(message);
  }, [revision, profile?.id]);

  const stats = workoutStats(training);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart(today), index));
  const recentWorkouts = workouts.filter(workout => workout.id !== openWorkout?.id);
  const last30 = training.filter(workout => workout.day >= addDays(today, -29));
  const avgMinutes = last30.filter(workout => workout.duration_min).length ? Math.round(last30.reduce((sum, workout) => sum + (workout.duration_min ?? 0), 0) / last30.filter(workout => workout.duration_min).length) : null;
  const cardWidth = Math.round((Math.min(width, 620) - 36) * 0.82);
  const current = routines[Math.min(active, Math.max(0, routines.length - 1))];
  const exerciseName = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise])), [exercises]);
  const currentLinks = current ? links.filter(link => link.routine_id === current.id) : [];
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12));
    if (index !== active) setActive(Math.max(0, Math.min(routines.length - 1, index)));
  };
  const startRoutine = (routine: Routine) => router.push({ pathname: '/workout-form', params: { routine: routine.id } });

  return <Page title="Train" eyebrow={`${stats.week} session${stats.week === 1 ? '' : 's'} this week`} headerAction={<CircleButton icon="add" tone="accent" label="Create routine" onPress={() => router.push('/routine-form')}/>}>
    {/* Week strip (`.wa-days`) */}
    <View style={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row', gap: 5 }}>{week.map(day => {
      const done = training.some(workout => workout.day === day);
      const restDay = rest.includes(day);
      return <View key={day} style={{ flex: 1, minWidth: 0, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? p.g1 : p.c8, borderWidth: day === today ? 1.5 : 1, borderColor: day === today ? p.text : p.c8Line }}>
        <Text style={{ color: done ? p.plInk : p.muted, fontFamily: fonts.bold, fontSize: 10.5 }}>{restDay && !done ? 'R' : new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(day))}</Text>
      </View>;
    })}</View>

    {openWorkout && <WorkoutInProgressCard workout={openWorkout}/>}

    {/* Routine gallery (`.wg`) */}
    {routines.length ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" disableIntervalMomentum onScroll={onScroll} scrollEventThrottle={32}
        style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 4, gap: 12 }}>
        {routines.map((routine, index) => {
          const lastDone = training.filter(workout => workout.name === routine.name).map(workout => workout.day).sort().at(-1);
          const count = links.filter(link => link.routine_id === routine.id).length;
          return <GalleryCard key={routine.id} width={cardWidth} index={index} on={index === active} cover={covers[index % covers.length]} eyebrow={lastDoneLabel(lastDone, today)} title={routine.name} meta={`${count} exercise${count === 1 ? '' : 's'}`}
            onStart={() => startRoutine(routine)} onMore={() => setRoutineMenu(routine)}/>;
        })}
      </ScrollView>
      {routines.length > 1 && <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>{routines.map((routine, index) => <View key={routine.id} style={{ width: index === active ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: index === active ? p.text : p.borderStrong }}/>)}</View>}
      {current && <>
        <SectionLink title={`${current.name} exercises`} action="Edit" onPress={() => router.push({ pathname: '/routine-form', params: { id: current.id } })}/>
        {currentLinks.length ? <View style={{ gap: 8 }}>{currentLinks.slice(0, 5).map((link, index) => <ExerciseRow key={link.id} index={index} number={index + 1} name={exerciseName.get(link.exercise_id)?.name ?? 'Exercise'} metric={exerciseName.get(link.exercise_id)?.metric}/>)}
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

    <BottomSheet visible={!!routineMenu} title={routineMenu?.name ?? 'Routine'} onClose={() => setRoutineMenu(null)}>{close => routineMenu && <View style={{ gap: 10 }}>
      <Button title="Start" onPress={() => close(() => startRoutine(routineMenu))}/>
      <Button title="Edit" kind="ghost" onPress={() => close(() => router.push({ pathname: '/routine-form', params: { id: routineMenu.id } }))}/>
      <Button title="Delete" kind="danger" onPress={() => confirm('Delete routine?', async () => { await repo.remove('routines', routineMenu.id); close(); changed(); })}/>
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
        <View style={{ position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={18} color="#1D2E8F"/></View>
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

function ExerciseRow({ number, name, metric, index }: { number: number; name: string; metric?: Exercise['metric']; index: number }) {
  const p = usePalette();
  const entering = useEntering(index);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p.soft1 }}><Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{number}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{name}</Text><Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{metric === 'duration' ? 'Timed' : metric === 'reps' ? 'Bodyweight reps' : 'Weight × reps'}</Text></View>
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
