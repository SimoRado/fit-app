import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text } from '../../ui/LocalizedText';
import Svg, { Circle, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { addDays, dayKey, weekStart } from '../../core/date';
import { habitRate, habitStreak, missionProgress, missionRate, personalRecords, weightGoalProgress, weightSummary, workoutStats } from '../../core/logic';
import { Exercise, Habit, HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Choices, Empty, Page, styles, message } from '../../ui/components';

type Period = '7' | '30' | '90';
const dateLabel = (day: string, language: string = 'en') => new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US', { month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00`));

export default function Progress() {
  const { revision, profile } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [links, setLinks] = useState<WorkoutExercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [period, setPeriod] = useState<Period>('7');

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.workoutExercises(), repo.workoutSets(), repo.exercises()])
      .then(([h, c, m, mc, w, wt, l, s, e]) => {
        setHabits(h); setCompletions(c); setMissions(m); setManual(mc); setWorkouts(w);
        setWeights(wt); setLinks(l); setSets(s); setExercises(e);
      }).catch(message);
  }, [revision]);

  const today = dayKey();
  const start = addDays(today, 1 - Number(period));
  const selectedDays = Array.from({ length: Number(period) }, (_, index) => addDays(start, index));
  const selectedWeights = weights.filter(entry => entry.day >= start && entry.day <= today);
  const chronologicalWeights = selectedWeights.slice().sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  const selectedWorkouts = workouts.filter(workout => workout.day >= start && workout.day <= today);
  const selectedHabitRate = habitRate(habits, completions, start, today, true);
  const selectedMissionRate = missionRate(missions, { completions, workouts, weights, manual }, start, today);
  const selectedWeight = weightSummary(selectedWeights);
  const workoutSummary = workoutStats(selectedWorkouts, today);
  const fixedStreaks = habits.filter(habit => !habit.archived && habit.frequency !== 'quota').map(habit => habitStreak(habit, completions));
  const quotaStreaks = habits.filter(habit => !habit.archived && habit.frequency === 'quota').map(habit => habitStreak(habit, completions));
  const trainingDays = new Set(selectedWorkouts.map(workout => workout.day));
  const weightDays = new Set(selectedWeights.map(entry => entry.day));
  const habitDays = new Set(completions.filter(entry => entry.day >= start && entry.day <= today).map(entry => entry.day));
  const manualDays = new Set(manual.filter(entry => entry.day >= start && entry.day <= today).map(entry => entry.day));
  const activeDays = selectedDays.filter(day => trainingDays.has(day) || weightDays.has(day) || manualDays.has(day) || habitDays.has(day));

  const weeklyCounts = new Map<string, number>();
  for (const workout of selectedWorkouts) {
    const week = weekStart(workout.day);
    weeklyCounts.set(week, (weeklyCounts.get(week) ?? 0) + 1);
  }
  const bins: { week: string; count: number }[] = [];
  for (let week = weekStart(start); week <= weekStart(today); week = addDays(week, 7)) bins.push({ week, count: weeklyCounts.get(week) ?? 0 });
  const maxWorkouts = Math.max(1, ...bins.map(bin => bin.count));
  const weightMin = selectedWeights.length ? Math.min(...selectedWeights.map(entry => entry.kg)) : 0;
  const weightMax = selectedWeights.length ? Math.max(...selectedWeights.map(entry => entry.kg)) : 0;
  const locale = profile?.language ?? 'en';
  const weightPoints = chronologicalWeights.map((entry, index) => `${10 + index * 280 / Math.max(1, chronologicalWeights.length - 1)},${90 - (entry.kg - weightMin) * 70 / Math.max(1, weightMax - weightMin)}`).join(' ');

  const records = personalRecords(exercises, links, sets, workouts);
  const missionDoneToday = missions.filter(mission => mission.active && mission.period === 'daily' && missionProgress(mission, today, { completions, workouts, weights, manual }).done).length;
  const dailyMissionCount = missions.filter(mission => mission.active && mission.period === 'daily').length;
  const goalProgress = selectedWeight.latest && profile ? weightGoalProgress(profile.start_weight, selectedWeight.latest.kg, profile.target_weight) : null;

  return <Page title="Progress">
    <Choices label="Activity period" options={['7', '30', '90'] as const} value={period} onChange={setPeriod}/>
    <Card>
      <Text style={styles.text}>Habits</Text>
      <Text style={styles.muted}>{selectedHabitRate.done}/{selectedHabitRate.due} scheduled habit targets completed · {selectedHabitRate.percent}%</Text>
      <Text style={styles.muted}>{`Fixed-habit streaks: ${Math.max(0, ...fixedStreaks.map(streak => streak.current))} current · ${Math.max(0, ...fixedStreaks.map(streak => streak.longest))} longest scheduled occurrences`}</Text>
      <Text style={styles.muted}>{`Weekly quota streaks: ${Math.max(0, ...quotaStreaks.map(streak => streak.current))} current · ${Math.max(0, ...quotaStreaks.map(streak => streak.longest))} longest weeks`}</Text>
    </Card>
    <Card>
      <Text style={styles.text}>Workouts</Text>
      <Text style={styles.muted}>{workoutSummary.total} completed sessions · {workoutSummary.minutes} training minutes · peak {workoutSummary.mostInWeek} in one week</Text>
      {bins.some(bin => bin.count) ? <>
        <Svg width="100%" height={148} viewBox="0 0 300 148" accessibilityLabel="Completed workouts per week">
          {bins.map((bin, index) => {
            const barWidth = Math.min(20, 240 / bins.length);
            const x = 14 + index * 280 / bins.length;
            const height = bin.count * 72 / maxWorkouts;
            return <React.Fragment key={bin.week}>
              <Rect x={x} y={94 - height} width={barWidth} height={height} rx={3} fill="#8BE0B0"/>
              {index === 0 || index === bins.length - 1 || index === Math.floor(bins.length / 2) ? <SvgText x={x + barWidth / 2} y={116} fill="#B6C3BD" fontSize="9" textAnchor="middle">{dateLabel(bin.week, locale)}</SvgText> : null}
              <SvgText x={x + barWidth / 2} y={Math.max(12, 87 - height)} fill="#F4F7F5" fontSize="9" textAnchor="middle">{bin.count.toLocaleString(locale === 'ar' ? 'ar-u-nu-arab' : locale === 'fr' ? 'fr-FR' : 'en-US')}</SvgText>
            </React.Fragment>;
          })}
        </Svg>
        <Text style={styles.muted}>Sessions per week · {dateLabel(start, locale)} to {dateLabel(today, locale)}</Text>
      </> : <Empty text="No completed workout sessions in this period."/>}
    </Card>
    <Card>
      <Text style={styles.text}>Weight</Text>
      <Text style={styles.muted}>Latest in period: {selectedWeight.latest ? `${selectedWeight.latest.kg} kg · ${selectedWeight.latest.day}` : 'No entries'} · Change: {selectedWeight.change === null ? '—' : `${selectedWeight.change} kg`}</Text>
      {goalProgress !== null && <Text style={styles.muted}>Progress toward target: {goalProgress}%</Text>}
      {selectedWeights.length > 1 ? <>
        <Svg width="100%" height={112} viewBox="0 0 300 105" accessibilityLabel="Weight history for selected period">
          <Polyline points={weightPoints} fill="none" stroke="#8BE0B0" strokeWidth={3}/>
          {chronologicalWeights.map((entry, index) => <Circle key={entry.id} cx={10 + index * 280 / Math.max(1, chronologicalWeights.length - 1)} cy={90 - (entry.kg - weightMin) * 70 / Math.max(1, weightMax - weightMin)} r={3} fill="#8BE0B0"/>)}
        </Svg>
        <Text style={styles.muted}>{dateLabel(chronologicalWeights[0].day, locale)} · {chronologicalWeights[0].kg} kg → {dateLabel(chronologicalWeights.at(-1)!.day, locale)} · {chronologicalWeights.at(-1)!.kg} kg</Text>
      </> : <Empty text={selectedWeights.length ? 'Add another entry in this period to draw a trend.' : 'No weight entries in this period.'}/>}
      <Button title="Weight history and chart" kind="ghost" onPress={() => router.push('/weight')}/>
    </Card>
    <Card>
      <Text style={styles.text}>Missions</Text>
      <Text style={styles.muted}>{selectedMissionRate.done}/{selectedMissionRate.due} daily and weekly mission periods complete · {selectedMissionRate.percent}%</Text>
      <Text style={styles.muted}>Today: {missionDoneToday}/{dailyMissionCount} daily missions complete</Text>
      <Button title="Open missions" kind="ghost" onPress={() => router.push('/missions')}/>
    </Card>
    <Card>
      <Text style={styles.text}>All-time exercise records</Text>
      {records.length ? records.map(record => <Text key={record.name} style={styles.muted}>{record.name}: {record.metric === 'duration' ? `${record.value} sec` : record.metric === 'reps' ? `${record.value} reps` : record.value ? `${record.value} kg best load${record.reps ? ` · ${record.reps} reps` : ''}` : `${record.reps} reps (bodyweight)`}</Text>) : <Empty/>}
    </Card>
    <Card>
      <Text style={styles.text}>Activity summary</Text>
      <Text style={styles.muted}>{activeDays.length} active days out of {period} · {dateLabel(start, locale)} to {dateLabel(today, locale)}</Text>
      {activeDays.length ? activeDays.slice(-8).reverse().map(day => {
        const habitsForDay = habitRate(habits, completions, day, day, true);
        const workoutsForDay = workouts.filter(workout => workout.day === day).length;
        return <Text key={day} style={styles.muted}>{dateLabel(day, locale)} · {habitsForDay.done} habit targets · {workoutsForDay} workouts{weightDays.has(day) ? ' · weight entry' : ''}</Text>;
      }) : <Empty text="No activity recorded in this period."/>}
    </Card>
  </Page>;
}
