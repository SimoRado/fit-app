import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { elapsedWorkoutSeconds, formatWorkoutElapsed, workoutTimerFromRecord } from '../core/workoutTimer';
import type { OpenWorkout } from '../data/db';
import { Button, Card, styles } from './components';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';

export function WorkoutInProgressCard({ workout }: { workout: OpenWorkout }) {
  const [now, setNow] = useState(() => Date.now());
  const paused = workout.session_status === 'paused';
  useEffect(() => {
    if (paused) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [paused, workout.id]);
  const elapsed = formatWorkoutElapsed(elapsedWorkoutSeconds(workoutTimerFromRecord(workout), now));

  return <Card accent>
    <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .7, textTransform: 'uppercase' }}>Workout in progress · {paused ? 'Paused' : 'Running'}</Text>
    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 33, includeFontPadding: false }}>{workout.name || 'Workout session'}</Text>
    <Text style={styles.muted}>{elapsed} active · {workout.completed_sets}/{workout.total_sets} sets completed</Text>
    <Button title="Resume Workout" onPress={() => router.push({ pathname: '/workout-form', params: { session: workout.id } })}/>
  </Card>;
}
