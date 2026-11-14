import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '../ui/LocalizedText';
import { addDays, dayKey, weekStart } from '../core/date';
import { missionProgress } from '../core/logic';
import { HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Page, confirm, message } from '../ui/components';
import { BottomSheet } from '../ui/BottomSheet';
import { fonts } from '../ui/theme';
import { MotionPressable } from '../ui/MotionPressable';
import { CircleButton, EmptyAction, MiniBar, SectionLink, useEntering, usePalette } from '../ui/voltKit';

const typeIcon: Record<Mission['type'], React.ComponentProps<typeof Ionicons>['name']> = { manual: 'flag-outline', habits: 'checkmark-circle-outline', workouts: 'barbell-outline', weight: 'scale-outline' };

/** Volt Missions: hero counter, "Today" and "This week" mission cards with progress rings. */
export default function Missions() {
  const { revision, changed } = useApp();
  const p = usePalette();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [menu, setMenu] = useState<Mission | null>(null);
  useEffect(() => {
    Promise.all([repo.missions(), repo.completions(), repo.trainingWorkouts(), repo.weights(), repo.manual()])
      .then(([m, c, w, wt, mc]) => { setMissions(m); setCompletions(c); setWorkouts(w); setWeights(wt); setManual(mc); })
      .catch(message);
  }, [revision]);

  const today = dayKey(), data = { completions, workouts, weights, manual };
  const recentDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const daily = missions.filter(m => m.active && m.period === 'daily');
  const dailyDone = daily.filter(m => missionProgress(m, today, data).done).length;
  const daysLeft = 6 - Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${weekStart(today)}T12:00:00`).getTime()) / 86400000);
  const toggle = async (m: Mission) => {
    const progress = missionProgress(m, today, data);
    if (m.period === 'weekly') await repo.setWeeklyMissionCompletion(m.id, weekStart(today), !progress.done); else await repo.setMissionCompletion(m.id, today, !progress.done);
    changed();
  };
  const heroEntering = useEntering(0);

  return <Page title="Missions" headerAction={<CircleButton icon="add" tone="accent" label="Create mission" onPress={() => router.push('/mission-form')}/>}>
    <Animated.View entering={heroEntering} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 78, lineHeight: 80, letterSpacing: -4 }}>{dailyDone}/{daily.length}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>Completed today</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 4 }}>{daily.length ? (daily.length - dailyDone ? `${daily.length - dailyDone} remaining` : 'Day locked in') : 'Create your first mission'}</Text>
      </View>
    </Animated.View>

    {missions.length ? (['daily', 'weekly'] as const).map(period => {
      const list = missions.filter(m => m.period === period);
      if (!list.length) return null;
      return <React.Fragment key={period}>
        <SectionLink title={period === 'daily' ? 'Today' : 'This week'}/>
        <View style={{ gap: 8 }}>{list.map((m, index) => {
          const progress = missionProgress(m, today, data);
          const ratio = Math.min(1, progress.value / Math.max(1, progress.target));
          const history = m.period === 'weekly' ? [] : recentDays.filter(day => missionProgress(m, day, data).done);
          return <MissionCard key={m.id} index={index} icon={typeIcon[m.type]} title={m.title}
            sub={`${progress.value} / ${progress.target}${m.active ? '' : ' · paused'}${m.period === 'daily' && history.length ? ` · ${history.length}/7 days` : ''}`}
            done={progress.done} ratio={ratio} weekly={m.period === 'weekly'} daysLeft={daysLeft}
            onRing={m.type === 'manual' ? () => { void toggle(m).catch(message); } : undefined}
            onOpen={() => setMenu(m)}/>;
        })}</View>
      </React.Fragment>;
    }) : <EmptyAction text="Create a manual or activity-based mission." onPress={() => router.push('/mission-form')}/>}

    <BottomSheet visible={!!menu} title={menu?.title ?? 'Mission'} onClose={() => setMenu(null)}>{close => menu && <View style={{ gap: 10 }}>
      {menu.type === 'manual' && <Button title={missionProgress(menu, today, data).done ? 'Undo' : 'Complete'} onPress={() => close(() => { void toggle(menu).catch(message); })}/>}
      <Button title="Edit mission" kind="ghost" onPress={() => close(() => router.push({ pathname: '/mission-form', params: { id: menu.id } }))}/>
      <Button title="Delete mission" kind="danger" onPress={() => confirm('Delete mission?', async () => { await repo.remove('missions', menu.id); close(); changed(); })}/>
    </View>}</BottomSheet>
  </Page>;
}

function MissionCard({ icon, title, sub, done, ratio, weekly, daysLeft, onRing, onOpen, index }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; done: boolean; ratio: number; weekly: boolean; daysLeft: number; onRing?: () => void; onOpen: () => void; index: number }) {
  const p = usePalette();
  const entering = useEntering(index);
  const C = 2 * Math.PI * 21;
  const ring = <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={52} height={52} viewBox="0 0 52 52"><Circle cx={26} cy={26} r={21} fill="none" stroke={p.qTrack} strokeWidth={3.5}/><Circle cx={26} cy={26} r={21} fill="none" stroke={p.g1} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - ratio)} rotation={-90} origin="26,26"/></Svg>
    <Ionicons name={done ? 'checkmark' : icon} size={done ? 20 : 17} color={p.accent} style={{ position: 'absolute' }}/>
  </View>;
  return <Animated.View entering={entering}>
    <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel={`${title}. Options`} onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 22, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
      {onRing ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={done ? `Undo ${title}` : `Complete ${title}`} onPress={onRing} hitSlop={4}>{ring}</Pressable> : ring}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={2} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{sub}</Text>
        {weekly && <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><MiniBar value={ratio} color={p.pgBar} track={p.qTrack} height={5}/></View><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.6 }}>{daysLeft} DAYS LEFT</Text></View>}
      </View>
      {done ? <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: p.g1 }}><Text style={{ color: p.plInk, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.6 }}>LOGGED</Text></View> : <Ionicons name="chevron-forward" size={16} color={p.muted}/>}
    </MotionPressable>
  </Animated.View>;
}
