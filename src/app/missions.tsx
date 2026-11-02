import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from '../ui/LocalizedText';
import { addDays, dayKey, weekStart } from '../core/date';
import { missionProgress } from '../core/logic';
import { HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Empty, Page, styles, confirm, message } from '../ui/components';

export default function Missions() {
  const { revision, changed } = useApp();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  useEffect(() => {
    Promise.all([repo.missions(), repo.completions(), repo.trainingWorkouts(), repo.weights(), repo.manual()])
      .then(([m, c, w, wt, mc]) => { setMissions(m); setCompletions(c); setWorkouts(w); setWeights(wt); setManual(mc); })
      .catch(message);
  }, [revision]);

  const today = dayKey(), data = { completions, workouts, weights, manual };
  const recentDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return <Page title="Daily missions">
    <Button title="Create mission" onPress={() => router.push('/mission-form')}/>
    {missions.length ? missions.map(m => {
      const progress = missionProgress(m, today, data);
      const history = m.period === 'weekly'
        ? Array.from({ length: 4 }, (_, index) => addDays(weekStart(today), (index - 3) * 7))
          .filter(week => missionProgress(m, week > today ? today : addDays(week, 6) > today ? today : addDays(week, 6), data).done)
          .map(week => `${week} – ${addDays(week, 6) > today ? today : addDays(week, 6)}`)
        : recentDays.filter(day => missionProgress(m, day, data).done);
      return <Card key={m.id}>
        <View style={styles.row}><Text style={styles.text}>{m.title}</Text><Text style={styles.muted}>{progress.value}/{progress.target}</Text></View>
        <Text style={styles.muted}>{m.period} · {m.type} · {progress.done ? 'Complete' : 'In progress'}</Text>
        {m.type === 'manual' && <Button title={progress.done ? 'Undo' : 'Complete'} onPress={async () => { if (m.period === 'weekly') await repo.setWeeklyMissionCompletion(m.id, weekStart(today), !progress.done); else await repo.setMissionCompletion(m.id, today, !progress.done); changed(); }}/>}
        <Text style={styles.muted}>Recent completion: {history.length ? history.join(' · ') : 'No completed days in the last 7 days'}</Text>
        <View style={styles.row}>
          <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/mission-form', params: { id: m.id } })}/>
          <Button title="Delete" kind="danger" onPress={() => confirm('Delete mission?', async () => { await repo.remove('missions', m.id); changed(); })}/>
        </View>
      </Card>;
    }) : <Empty text="Create a manual or activity-based mission."/>}
  </Page>;
}
