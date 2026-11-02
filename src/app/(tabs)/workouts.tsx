import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from '../../ui/LocalizedText';
import { dayKey } from '../../core/date';
import { workoutStats } from '../../core/logic';
import { Routine, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Empty, Page, styles, message, confirm } from '../../ui/components';

export default function Workouts() {
  const { profile, revision, changed } = useApp();
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
  return <Page title="Workouts">
    <Card>
      <Text style={styles.text}>{stats.week} this week · {stats.month} this month · {stats.total} total</Text>
      <Text style={styles.muted}>Only completed sessions with at least one recorded set count in these totals.</Text>
      <Button title="Log workout" onPress={() => router.push('/workout-form')}/>
      <Button title={rest.includes(today) ? 'Undo rest day' : 'Mark today as rest day'} kind="ghost" onPress={async () => { await repo.toggleRest(profile!.id, today); changed(); }}/>
    </Card>
    <Text style={styles.subtitle}>Routines</Text>
    <Button title="Create routine" kind="ghost" onPress={() => router.push('/routine-form')}/>
    {routines.map(routine => <Card key={routine.id}>
      <Text style={styles.text}>{routine.name}</Text>
      <View style={styles.row}>
        <Button title="Start" onPress={() => router.push({ pathname: '/workout-form', params: { routine: routine.id } })}/>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/routine-form', params: { id: routine.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete routine?', async () => { await repo.remove('routines', routine.id); changed(); })}/>
      </View>
    </Card>)}
    <Text style={styles.subtitle}>Session history</Text>
    {workouts.length ? workouts.map(workout => <Card key={workout.id}>
      <Text style={styles.text}>{workout.name} · {workout.day}</Text>
      <Text style={styles.muted}>{workout.completed ? 'Completed' : 'Draft'}{workout.duration_min ? ` · ${workout.duration_min} min` : ''}</Text>
      <View style={styles.row}>
        <Button title="Open / edit" kind="ghost" onPress={() => router.push({ pathname: '/workout-form', params: { id: workout.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete workout?', async () => { await repo.remove('workouts', workout.id); changed(); })}/>
      </View>
    </Card>) : <Empty/>}
  </Page>;
}
