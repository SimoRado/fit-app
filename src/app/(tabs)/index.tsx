import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text } from '../../ui/LocalizedText';
import { dayKey, weekStart } from '../../core/date';
import { habitRate, habitStreak, missionProgress, scheduled, weightSummary } from '../../core/logic';
import { Habit, HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Page, styles, message } from '../../ui/components';
import { cards } from '../../core/cards';

export default function Home() {
  const { profile, revision, changed } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [quote, setQuote] = useState(0);

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions(), repo.missions(), repo.manual(), repo.workouts(), repo.trainingWorkouts(), repo.weights()])
      .then(([h, c, m, mc, w, t, wt]) => {
        setHabits(h); setCompletions(c); setMissions(m); setManual(mc);
        setWorkouts(w); setTraining(t); setWeights(wt);
      }).catch(message);
  }, [revision]);

  const today = dayKey();
  const dailyHabits = habitRate(habits, completions, today, today);
  const weeklyHabits = habitRate(habits, completions, weekStart(today), today, true);
  const activeMissions = missions.filter(m => m.active && m.period === 'daily');
  const missionResults = activeMissions.map(m => missionProgress(m, today, { completions, workouts: training, weights, manual }));
  const missionDone = missionResults.filter(result => result.done).length;
  const workoutDone = training.some(workout => workout.day === today);
  const weight = weightSummary(weights);
  // Daily progress is completed scheduled fixed-frequency habits plus active daily missions.
  // A workout is visible as a status and affects a workout mission, so it is not counted twice.
  const total = dailyHabits.due + activeMissions.length;
  const done = dailyHabits.done + missionDone;
  const percent = total ? Math.round(done / total * 100) : 0;
  const streak = Math.max(0, ...habits
    .filter(habit => !habit.archived && habit.frequency !== 'quota')
    .map(habit => habitStreak(habit, completions, today).current));

  return <Page title={`Hello, ${profile?.name ?? 'friend'}`}>
    <Text style={styles.subtitle}>Progress over perfection.</Text>
    <Card>
      <Text style={styles.text}>{total ? `Daily progress: ${done}/${total} objectives · ${percent}%` : 'No objectives scheduled today.'}</Text>
      <Text style={styles.muted}>Counts fixed-schedule habits and active daily missions once each. Weekly quota habits appear in the habits summary; workouts affect progress through missions.</Text>
      <Text style={styles.muted}>Habits {dailyHabits.done}/{dailyHabits.due} today · {weeklyHabits.done}/{weeklyHabits.due} this week · Missions {missionDone}/{activeMissions.length}</Text>
      <Text style={styles.muted}>{`Best fixed-habit streak: ${streak} scheduled occurrences`}</Text>
    </Card>
    <Card>
      <Text style={styles.text}>{dailyHabits.due ? `Today's habits · ${dailyHabits.percent}%` : 'No fixed-schedule habits today.'}</Text>
      {habits.filter(habit => scheduled(habit, today) && habit.frequency !== 'quota').slice(0, 3).map(habit =>
        <Button key={habit.id} title={`${completions.some(c => c.habit_id === habit.id && c.day === today) ? '✓' : '○'} ${habit.name}`} kind="ghost" onPress={async () => { const completed = completions.some(c => c.habit_id === habit.id && c.day === today); await repo.setHabitCompletion(habit.id, today, !completed); changed(); }}/>,
      )}
      <Button title="Create habit" onPress={() => router.push('/habit-form')}/>
    </Card>
    <Card>
      <Text style={styles.text}>Missions · {missionDone}/{activeMissions.length}</Text>
      {activeMissions.slice(0, 3).map((mission, i) => <Text key={mission.id} style={styles.muted}>{missionResults[i].done ? '✓' : '○'} {mission.title}</Text>)}
      <Button title="View missions" kind="ghost" onPress={() => router.push('/missions')}/>
    </Card>
    <Card>
      <Text style={styles.text}>Workout: {workoutDone ? 'Completed today' : 'No completed workout today'}</Text>
      <Text style={styles.muted}>Latest: {workouts[0]?.name ?? 'None yet'}</Text>
      <Button title="Log workout" onPress={() => router.push('/workout-form')}/>
    </Card>
    <Card>
      <Text style={styles.text}>Weight: {weight.latest ? `${weight.latest.kg} kg` : 'No entries yet'}</Text>
      <Text style={styles.muted}>Target: {profile?.target_weight ? `${profile.target_weight} kg` : 'Not set'} · Change: {weight.change === null ? '—' : `${weight.change} kg`}</Text>
      <Button title="Add weight" kind="ghost" onPress={() => router.push('/weight-form')}/>
    </Card>
    <Card>
      <Text style={styles.text}>Fitness goal: {profile?.fitness_goal}</Text>
      <Text style={styles.muted}>Personal growth goals</Text>
      {profile?.growth_goals.split(',').filter(Boolean).map(goal => <Text key={goal} style={styles.muted}>· {goal}</Text>)}
    </Card>
    <Card>
      <Text style={styles.text}>{cards[quote % cards.length].text[profile?.language ?? 'en']}</Text>
      <Button title="Another card" kind="ghost" onPress={() => setQuote(x => x + 1)}/>
      <Button title="Motivation center" kind="ghost" onPress={() => router.push('/motivation')}/>
    </Card>
    <Button title="Open progress" onPress={() => router.push('/(tabs)/progress')}/>
  </Page>;
}
