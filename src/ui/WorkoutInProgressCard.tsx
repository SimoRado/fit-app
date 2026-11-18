import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elapsedWorkoutSeconds, formatWorkoutElapsed, workoutTimerFromRecord } from '../core/workoutTimer';
import type { OpenWorkout } from '../data/db';
import { Button, Card, styles } from './components';
import { Text } from './LocalizedText';
import { colors, fonts, brand } from './theme';

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

  // Volt: compact "up next" style card with a lime/accent play badge and a resume pill.
  return <Card accent>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime }}><Ionicons name={paused ? 'pause' : 'play'} size={18} color={brand.ink}/></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: .8, textTransform: 'uppercase' }}>Workout in progress · {paused ? 'Paused' : 'Running'}</Text>
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 18, lineHeight: 22 }}>{workout.name || 'Workout session'}</Text>
        <Text style={[styles.muted, { fontSize: 12.5 }]}>{elapsed} active · {workout.completed_sets}/{workout.total_sets} sets completed</Text>
      </View>
    </View>
    <Button title="Resume Workout" onPress={() => router.push({ pathname: '/workout-form', params: { session: workout.id } })}/>
  </Card>;
}
