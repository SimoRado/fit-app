import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '../ui/LocalizedText';
import { addDays, dayKey, weekStart } from '../core/date';
import { missionProgress } from '../core/logic';
import { HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Empty, Page, styles, confirm, message } from '../ui/components';
import { ProgressBar, SectionHeader } from '../ui/visuals';
import { colors, fonts } from '../ui/theme';
import { DisplayMetric } from '../ui/DisplayMetric';

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
  const daily = missions.filter(m => m.active && m.period === 'daily');
  const dailyDone = daily.filter(m => missionProgress(m, today, data).done).length;
  return <Page title="Missions">
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}><DisplayMetric value={dailyDone + '/' + daily.length} size={112}/><View style={{ flex: 1, paddingBottom: 22 }}><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' }}>Completed today</Text><Text style={styles.muted}>{daily.length ? daily.length - dailyDone + ' remaining' : 'Create your first mission'}</Text></View></View>
    {daily.length > 0 && dailyDone === daily.length && <View style={{ borderRadius: 28, backgroundColor: colors.lilac, padding: 18, flexDirection: 'row', gap: 12, alignItems: 'center' }}><Ionicons name="trophy-outline" size={23} color={colors.ink}/><View><Text style={{ color: colors.text, fontWeight: '700' }}>Day locked in</Text><Text style={styles.muted}>Every mission is done.</Text></View></View>}
    <Button title="Create mission" onPress={() => router.push('/mission-form')}/>
    {missions.length ? (['daily', 'weekly'] as const).map(period => <React.Fragment key={period}>
      {missions.some(m => m.period === period) && <SectionHeader title={period === 'daily' ? 'Daily missions' : 'Weekly challenges'}/>}
      {missions.filter(m => m.period === period).map(m => {
      const progress = missionProgress(m, today, data);
      const history = m.period === 'weekly'
        ? Array.from({ length: 4 }, (_, index) => addDays(weekStart(today), (index - 3) * 7))
          .filter(week => missionProgress(m, week > today ? today : addDays(week, 6) > today ? today : addDays(week, 6), data).done)
          .map(week => `${week} – ${addDays(week, 6) > today ? today : addDays(week, 6)}`)
        : recentDays.filter(day => missionProgress(m, day, data).done);
      const toggle = async () => { if (m.period === 'weekly') await repo.setWeeklyMissionCompletion(m.id, weekStart(today), !progress.done); else await repo.setMissionCompletion(m.id, today, !progress.done); changed(); };
      return <View key={m.id} style={{ backgroundColor: colors.card, borderRadius: 30, padding: 18, gap: 11, marginBottom: 4, shadowColor: '#46328C', shadowOpacity: .07, shadowRadius: 12, elevation: 2 }}>
        <View style={[styles.row, { flexWrap: 'nowrap' }]}><Pressable accessibilityRole="button" accessibilityLabel={m.type === 'manual' ? progress.done ? 'Undo' : 'Complete' : m.title} disabled={m.type !== 'manual'} onPress={() => { void toggle().catch(message); }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Svg width={48} height={48} viewBox="0 0 48 48"><Circle cx={24} cy={24} r={21} fill="none" stroke={colors.border} strokeWidth={2.5}/><Circle cx={24} cy={24} r={21} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeDasharray={132} strokeDashoffset={132 * (1 - Math.min(1, progress.value / Math.max(1, progress.target)))} rotation={-90} origin="24,24"/></Svg>{m.type === 'manual' && <Ionicons name={progress.done ? 'checkmark' : 'add'} size={20} color={colors.accent} style={{ position: 'absolute' }}/>}</Pressable><View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.text, { fontFamily: fonts.displayHeavy, fontSize: 21, lineHeight: 24 }]}>{m.title}</Text><Text style={styles.muted}>{progress.value}/{progress.target} · {m.period} · {progress.done ? 'Complete' : 'In progress'}</Text></View>{progress.done && <Text style={{ color: colors.ink, backgroundColor: colors.sun, borderRadius: 999, padding: 6, fontFamily: fonts.bold, fontSize: 11 }}>LOGGED</Text>}</View>
        {m.period === 'weekly' && <ProgressBar value={progress.target ? progress.value / progress.target : 0}/>}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text numberOfLines={1} style={[styles.muted, { flex: 1, fontSize: 11 }]}>{history.length ? 'Recent: ' + history.join(' · ') : m.type === 'manual' ? 'Tap the circle to complete or undo' : m.type}</Text><Pressable accessibilityRole="button" accessibilityLabel="Edit mission" onPress={() => router.push({ pathname: '/mission-form', params: { id: m.id } })} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="create-outline" size={19} color={colors.muted}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete mission" onPress={() => confirm('Delete mission?', async () => { await repo.remove('missions', m.id); changed(); })} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="trash-outline" size={19} color={colors.muted}/></Pressable></View>
      </View>;
    })}</React.Fragment>) : <Empty text="Create a manual or activity-based mission."/>}
  </Page>;
}
