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

export default function Workouts() {
  const { profile, language, revision, changed } = useApp();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [rest, setRest] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([repo.workouts(), repo.trainingWorkouts(), repo.routines(), repo.restDays()])
      .then(([allWorkouts, completedWorkouts, savedRoutines, days]) => {
        setWorkouts(allWorkouts); setTraining(completedWorkouts); setRoutines(savedRoutines); setRest(days.map(x => x.day));
      }).catch(message);
  }, [revision]);

  const stats = workoutStats(training);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart(today), index));
  return <Page title="Workouts">
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}><DisplayMetric value={stats.week} size={126}/><View style={{ flex: 1, paddingBottom: 19 }}><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' }}>sessions this week</Text><Text style={styles.muted}>{stats.month} this month · {stats.total} total</Text></View></View>
    <View style={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row', gap: 6 }}>{week.map(day => {
      const done = training.some(workout => workout.day === day);
      return <View key={day} style={{ flex: 1, minWidth: 0, gap: 7, alignItems: 'center' }}><View style={{ width: '100%', aspectRatio: 1, maxHeight: 45, borderWidth: 1, borderColor: day === today ? colors.accent : colors.border, backgroundColor: done ? colors.accent : colors.card2, alignItems: 'center', justifyContent: 'center' }}>{done && <Text style={{ color: colors.accentText, fontSize: 18 }}>✓</Text>}</View><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 9, textAlign: 'center' }}>{new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(day))}</Text></View>;
    })}</View>
    <Button title="Start workout" size="hero" onPress={() => router.push('/workout-form')}/>
    <Button title={rest.includes(today) ? 'Undo rest day' : 'Mark today as rest day'} kind="ghost" onPress={async () => { await repo.toggleRest(profile!.id, today); changed(); }}/>
    <SectionHeader title="Saved routines"/>
    <Button title="Create routine" kind="ghost" onPress={() => router.push('/routine-form')}/>
    {routines.map(routine => <View key={routine.id} style={{ paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 11 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 40, lineHeight: 39, textTransform: 'uppercase', includeFontPadding: false }}>{routine.name}</Text>
      <View style={styles.row}>
        <Button title="Start" onPress={() => router.push({ pathname: '/workout-form', params: { routine: routine.id } })}/>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/routine-form', params: { id: routine.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete routine?', async () => { await repo.remove('routines', routine.id); changed(); })}/>
      </View>
    </View>)}
    <SectionHeader title="Recent workouts"/>
    {workouts.length ? workouts.map(workout => <View key={workout.id} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 9 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 32, textTransform: 'uppercase' }}>{workout.name}</Text>
      <Text style={styles.muted}>{workout.day}</Text>
      <Text style={styles.muted}>{workout.completed ? 'Completed' : 'Draft'}{workout.duration_min ? ` · ${workout.duration_min} min` : ''}</Text>
      <View style={styles.row}>
        <Button title="Open / edit" kind="ghost" onPress={() => router.push({ pathname: '/workout-form', params: { id: workout.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete workout?', async () => { await repo.remove('workouts', workout.id); changed(); })}/>
      </View>
    </View>) : <Empty/>}
  </Page>;
}
