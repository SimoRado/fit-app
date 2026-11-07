import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '../ui/LocalizedText';
import { uid } from '../core/date';
import { Exercise, Routine } from '../core/types';
import { repo, db } from '../data/db';
import { useApp } from '../state/app';
import { BottomSheet } from '../ui/BottomSheet';
import { ExerciseBrowser } from '../ui/ExerciseBrowser';
import { Button, Card, Field, message, Page, styles } from '../ui/components';

export default function RoutineForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, changed } = useApp();
  const [name, setName] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [original, setOriginal] = useState<Routine | null>(null);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => {
    repo.exercises().then(setExercises).catch(message);
    if (id) Promise.all([repo.one<Routine>('routines', id), repo.routineExercises()]).then(([routine, links]) => {
      setOriginal(routine);
      setName(routine?.name ?? '');
      setExerciseIds(links.filter(link => link.routine_id === id).map(link => link.exercise_id));
    }).catch(message);
  }, [id]);
  async function save() {
    try {
      if (!name.trim()) throw Error('Enter a routine name.');
      if (!profile) throw Error('Sign in before saving a routine.');
      const routine: Routine = { id: original?.id ?? uid(), owner_id: profile.id, name: name.trim(), created_at: original?.created_at ?? new Date().toISOString() };
      const database = await db();
      await database.withExclusiveTransactionAsync(async tx => {
        await tx.runAsync('INSERT INTO routines VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', routine.id, routine.owner_id, routine.name, routine.created_at);
        await tx.runAsync('DELETE FROM routine_exercises WHERE routine_id=?', routine.id);
        for (let index = 0; index < exerciseIds.length; index++) await tx.runAsync('INSERT INTO routine_exercises VALUES (?,?,?,?)', uid(), routine.id, exerciseIds[index], index);
      });
      changed(); router.back();
    } catch (error) { message(error); }
  }
  function select(exercise: Exercise) {
    setExercises(current => current.some(row => row.id === exercise.id) ? current : [...current, exercise]);
    setExerciseIds(current => editing === null ? [...current, exercise.id] : current.map((value, index) => index === editing ? exercise.id : value));
  }
  return <Page title={id ? 'Edit routine' : 'Create routine'}>
    <Card>
      <Field label="Routine name" value={name} onChangeText={setName}/>
      {exerciseIds.map((exerciseId, index) => <Card key={index}>
        <Text style={styles.text}>{index + 1}. {exercises.find(exercise => exercise.id === exerciseId)?.name ?? 'Exercise'}</Text>
        <Button title="Change exercise" kind="ghost" onPress={() => { setEditing(index); setPicker(true); }}/>
        <Button title="Remove" kind="ghost" onPress={() => setExerciseIds(current => current.filter((_, position) => position !== index))}/>
      </Card>)}
      <Button title="Add exercise" kind="ghost" onPress={() => { setEditing(null); setPicker(true); }}/>
      <Button title="Save routine" onPress={save}/>
    </Card>
    <Text style={styles.muted}>Routine changes do not alter past workouts.</Text>
    <BottomSheet visible={picker} title="Choose exercise" onClose={() => setPicker(false)}>{close => <ExerciseBrowser onSelect={exercise => { select(exercise); close(); }}/>}</BottomSheet>
  </Page>;
}
