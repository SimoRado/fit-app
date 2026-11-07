import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay, weekStart } from '../../core/date';
import { workoutStats } from '../../core/logic';
import { Routine, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Empty, Page, styles, message, confirm } from '../../ui/components';
import { SectionHeader } from '../../ui/visuals';
import { colors, fonts } from '../../ui/theme';
import { DisplayMetric } from '../../ui/DisplayMetric';
import { WorkoutInProgressCard } from '../../ui/WorkoutInProgressCard';
import type { OpenWorkout } from '../../data/db';

export default function Workouts() {
  const { profile, language, revision, changed } = useApp();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [rest, setRest] = useState<string[]>([]);
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    Promise.all([repo.workouts(), repo.trainingWorkouts(), repo.routines(), repo.restDays(), repo.openWorkoutSession(profile.id)])
      .then(([allWorkouts, completedWorkouts, savedRoutines, days, open]) => {
        setWorkouts(allWorkouts); setTraining(completedWorkouts); setRoutines(savedRoutines); setRest(days.map(x => x.day)); setOpenWorkout(open);
      }).catch(message);
  }, [revision, profile?.id]);

  const stats = workoutStats(training);
  const recentWorkouts = workouts.filter(workout => workout.id !== openWorkout?.id);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart(today), index));
  return <Page title="Workouts">
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}><DisplayMetric value={stats.week} size={118}/><View style={{ flex: 1, paddingBottom: 19 }}><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: .7, textTransform: 'uppercase' }}>sessions this week</Text><Text style={styles.muted}>{stats.month} this month · {stats.total} total</Text></View></View>
    <View style={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row', gap: 6 }}>{week.map(day => {
      const done = training.some(workout => workout.day === day);
      return <View key={day} style={{ flex: 1, minWidth: 0, gap: 7, alignItems: 'center' }}><View style={{ width: '100%', aspectRatio: 1, maxHeight: 45, borderRadius: 24, borderWidth: day === today ? 2 : 0, borderColor: colors.accent, backgroundColor: done ? colors.sun : colors.card, alignItems: 'center', justifyContent: 'center' }}>{done && <Text style={{ color: colors.ink, fontSize: 18 }}>✓</Text>}</View><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 9, textAlign: 'center' }}>{new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(day))}</Text></View>;
    })}</View>
    {openWorkout && <WorkoutInProgressCard workout={openWorkout}/>}
    <Button title="Start workout" size="hero" onPress={() => router.push('/workout-form')}/>
    <Button title={rest.includes(today) ? 'Undo rest day' : 'Mark today as rest day'} kind="ghost" onPress={async () => { await repo.toggleRest(profile!.id, today); changed(); }}/>
    <SectionHeader title="Saved routines"/>
    <Button title="Create routine" kind="ghost" onPress={() => router.push('/routine-form')}/>
    {routines.map(routine => <View key={routine.id} style={{ padding: 20, borderRadius: 30, backgroundColor: colors.card, gap: 13, shadowColor: '#46328C', shadowOpacity: .07, shadowRadius: 12, elevation: 2 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 30, includeFontPadding: false }}>{routine.name}</Text>
      <View style={styles.row}>
        <Button title="Start" onPress={() => router.push({ pathname: '/workout-form', params: { routine: routine.id } })}/>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/routine-form', params: { id: routine.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete routine?', async () => { await repo.remove('routines', routine.id); changed(); })}/>
      </View>
    </View>)}
    <SectionHeader title="Recent workouts"/>
    {recentWorkouts.length ? recentWorkouts.map(workout => <View key={workout.id} style={{ padding: 18, borderRadius: 28, backgroundColor: colors.card, gap: 9 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 25, lineHeight: 28 }}>{workout.name}</Text>
      <Text style={styles.muted}>{workout.day}</Text>
      <Text style={styles.muted}>{workout.completed ? 'Completed' : 'Draft'}{workout.duration_min ? ` · ${workout.duration_min} min` : ''}</Text>
      <View style={styles.row}>
        <Button title="Open / edit" kind="ghost" onPress={() => router.push({ pathname: '/workout-form', params: { id: workout.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete workout?', async () => { await repo.remove('workouts', workout.id); changed(); })}/>
      </View>
    </View>) : workouts.length > 0 && openWorkout ? <Empty text="Your current workout is shown above."/> : <Empty/>}
  </Page>;
}
