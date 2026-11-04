import React, { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey } from '../../core/date';
import { habitRate, habitStreak, missionProgress, scheduled, weightSummary } from '../../core/logic';
import { Habit, HabitCompletion, Mission, MissionCompletion, Routine, WeightEntry, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { AngularBackground, Button, Card, Page, styles, message } from '../../ui/components';
import { Artwork, HabitCheck, MotivationCard, SectionHeader, TickDial } from '../../ui/visuals';
import { colors, fonts } from '../../ui/theme';
import { cards } from '../../core/cards';
import { DisplayMetric } from '../../ui/DisplayMetric';

export default function Home() {
  const { width } = useWindowDimensions();
  const { profile, language, revision, changed } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [quote, setQuote] = useState(0);

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.routines()])
      .then(([h, c, m, mc, w, wt, r]) => { setHabits(h); setCompletions(c); setMissions(m); setManual(mc); setTraining(w); setWeights(wt); setRoutines(r); }).catch(message);
  }, [revision]);

  const today = dayKey();
  const dailyHabits = habitRate(habits, completions, today, today);
  const activeMissions = missions.filter(m => m.active && m.period === 'daily');
  const missionResults = activeMissions.map(m => missionProgress(m, today, { completions, workouts: training, weights, manual }));
  const missionDone = missionResults.filter(result => result.done).length;
  const todayWorkout = training.find(workout => workout.day === today);
  const weight = weightSummary(weights);
  // Daily progress counts fixed-schedule habit occurrences and active daily missions once.
  const total = dailyHabits.due + activeMissions.length;
  const done = dailyHabits.done + missionDone;
  const percent = total ? Math.round(done / total * 100) : 0;
  const streak = Math.max(0, ...habits.filter(habit => !habit.archived && habit.frequency !== 'quota').map(habit => habitStreak(habit, completions, today).current));
  const due = habits.filter(habit => scheduled(habit, today));
  const featured = cards[quote % cards.length];
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const streakBars = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(today, index - 13);
    const result = habitRate(habits, completions, day, day);
    return result.due > 0 && result.done === result.due;
  });
  const startWorkout = () => todayWorkout ? router.push({ pathname: '/workout-form', params: { id: todayWorkout.id } }) : routines[0] ? router.push({ pathname: '/workout-form', params: { routine: routines[0].id } }) : router.push('/workout-form');

  return <Page title="">
    <View style={[styles.row, { marginBottom: 4 }]}>
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1 }}>{'×  ' + date}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/(tabs)/profile')} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card2 }}>
        <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 20 }}>{profile?.name?.slice(0, 1).toUpperCase() ?? '×'}</Text>
      </Pressable>
    </View>
    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: width < 375 ? 44 : 58, lineHeight: width < 375 ? 43 : 54, textTransform: 'uppercase', includeFontPadding: false }}>{greeting + ','}{'\n'}{profile?.name ?? 'friend'}</Text>
    <Text style={styles.muted}>{total ? total - done + ' left today. Keep going.' : 'Progress over perfection.'}</Text>
    <TickDial value={percent} label="Daily progress"/>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 10 }}>
      <DisplayMetric value={streak} size={58}/>
      <View style={{ flex: 1, gap: 3, paddingBottom: 6 }}><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' }}>Day streak</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{done === total && total > 0 ? 'Today is complete' : 'Finish today to extend it'}</Text></View>
      <View style={{ width: 106, height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>{streakBars.map((complete, index) => <View key={index} style={{ flex: 1, height: 12 + ((index * 17) % 29), backgroundColor: complete ? colors.accent : colors.elevated }}/>)}</View>
    </View>
    <View style={{ height: 18 }}/>
    <View style={{ minHeight: 350, padding: 22, justifyContent: 'flex-end', gap: 12, overflow: 'hidden' }}>
      <AngularBackground color={colors.card2} cut={44} border={colors.border}/>
      <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 44, width: '100%', height: 250, opacity: .7 }}><Artwork category="Fitness"/></View>
      <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase' }}>{todayWorkout ? 'Completed today' : 'Featured workout'}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 56, lineHeight: 51, textTransform: 'uppercase', includeFontPadding: false }}>{todayWorkout?.name ?? routines[0]?.name ?? 'Log workout'}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{todayWorkout ? 'Open your saved session' : routines[0] ? 'Ready when you are' : 'Build your next session'}</Text>
      <View style={{ alignSelf: 'flex-start', minWidth: 170 }}><Button title={todayWorkout ? 'View log' : 'Start workout'} onPress={startWorkout}/></View>
    </View>
    <SectionHeader title="Today's missions" action="See all" onPress={() => router.push('/missions')}/>
    {activeMissions.length ? <View style={{ paddingBottom: 4 }}>{activeMissions.slice(0, 3).map((mission, index) => {
      const result = missionResults[index];
      const fill = index === 0 ? colors.accent : index === 1 ? '#EDEBE4' : colors.card2;
      const ink = index < 2 ? colors.accentText : colors.text;
      const doneMission = result.done;
      return <Pressable key={mission.id} accessibilityRole="button" accessibilityLabel={mission.title + ' ' + result.value + '/' + result.target} onPress={async () => {
        if (mission.type !== 'manual') { router.push('/missions'); return; }
        try { await repo.setMissionCompletion(mission.id, today, !doneMission); changed(); } catch (error) { message(error); }
      }} style={{ minHeight: 112, borderRadius: 24, backgroundColor: fill, marginBottom: index < Math.min(2, activeMissions.length - 1) ? -15 : 0, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 29, zIndex: index, flexDirection: 'row', alignItems: 'center', gap: 14, elevation: 2 + index }}>
        <Svg width={48} height={48} viewBox="0 0 48 48"><Circle cx={24} cy={24} r={21} fill="none" stroke={index < 2 ? 'rgba(27,10,2,.2)' : colors.border} strokeWidth={2.5}/><Circle cx={24} cy={24} r={21} fill="none" stroke={ink} strokeWidth={2.5} strokeDasharray={132} strokeDashoffset={132 * (1 - Math.min(1, result.value / Math.max(1, result.target)))} rotation={-90} origin="24,24"/></Svg>
        <View style={{ position: 'absolute', left: 30, top: 29 }}><Ionicons name={doneMission ? 'checkmark' : mission.type === 'manual' ? 'add' : 'ellipse-outline'} size={22} color={ink}/></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: ink, fontFamily: fonts.displayHeavy, fontSize: 27, lineHeight: 27, textTransform: 'uppercase', includeFontPadding: false }}>{mission.title}</Text><Text style={{ color: index === 1 ? '#555B63' : index === 0 ? 'rgba(27,10,2,.7)' : colors.muted, fontSize: 12 }}>{result.value}/{result.target} · {doneMission ? 'Done' : 'In progress'}</Text></View>
        <Ionicons name={doneMission ? 'checkmark' : 'arrow-forward'} size={20} color={ink}/>
      </Pressable>;
    })}</View> : <Card><Text style={styles.muted}>Create a manual or activity-based mission.</Text></Card>}
    <SectionHeader title="Habits" action="History" onPress={() => router.push('/(tabs)/habits')}/>
    {due.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {due.slice(0, 6).map(habit => {
        const completed = completions.some(c => c.habit_id === habit.id && c.day === today);
        return <View key={habit.id} style={{ width: '30%', minWidth: 86, alignItems: 'center', gap: 4 }}>
          <HabitCheck checked={completed} label={habit.name} onPress={async () => { await repo.setHabitCompletion(habit.id, today, !completed); changed(); }}/>
          <Text numberOfLines={2} style={{ textAlign: 'center', color: colors.text, fontSize: 12 }}>{habit.name}</Text>
        </View>;
      })}
    </View> : <Text style={styles.muted}>No habits scheduled today. Create one or check your schedule.</Text>}
    <SectionHeader title="Weight" action="Weight history" onPress={() => router.push('/weight')}/>
    <Card>
      <View style={styles.row}>
        <View><Text style={{ color: colors.text, fontFamily: fonts.display, fontWeight: '800', fontSize: 52, lineHeight: 58 }}>{weight.latest ? weight.latest.kg : '—'}</Text><Text style={styles.muted}>kg</Text></View>
        <View style={{ flexShrink: 1 }}><Text style={styles.muted}>Target: {profile?.target_weight ?? 'Not set'}</Text><Text style={styles.muted}>Change: {weight.change === null ? '—' : weight.change}</Text></View>
      </View>
      <Button title="Add weight" kind="ghost" onPress={() => router.push('/weight-form')}/>
    </Card>
    <SectionHeader title="Motivation" action="Motivation center" onPress={() => router.push('/motivation')}/>
    <MotivationCard compact category={featured.category} text={featured.text[language]}/>
    <View style={styles.row}><Button title="Another card" kind="ghost" onPress={() => setQuote(x => x + 1)}/><Button title="Open progress" kind="ghost" onPress={() => router.push('/(tabs)/progress')}/></View>
    <Card><Text style={styles.text}>Fitness goal: {profile?.fitness_goal}</Text><Text style={styles.muted}>Personal growth goals</Text>{profile?.growth_goals.split(',').filter(Boolean).map(goal => <Text key={goal} style={styles.muted}>· {goal}</Text>)}</Card>
  </Page>;
}
