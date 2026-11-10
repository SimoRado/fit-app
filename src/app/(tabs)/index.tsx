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
import { Button, Card, Page, styles, message } from '../../ui/components';
import { HabitCheck, MotivationCard, SectionHeader, TickDial } from '../../ui/visuals';
import { colors, fonts } from '../../ui/theme';
import { cards } from '../../core/cards';
import { DisplayMetric } from '../../ui/DisplayMetric';
import { foodEntries, nutritionEnabled, nutritionTarget } from '../../data/nutrition';
import { calorieBalance, sumNutrients, type Nutrients } from '../../core/nutrition';
import { WorkoutInProgressCard } from '../../ui/WorkoutInProgressCard';
import type { OpenWorkout } from '../../data/db';

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
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [quote, setQuote] = useState(0);
  const [nutrition, setNutrition] = useState<{ enabled: boolean; target: Nutrients | null; consumed: Nutrients } | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    Promise.all([repo.habits(), repo.completions(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.routines(), repo.openWorkoutSession(profile.id)])
      .then(([h, c, m, mc, w, wt, r, open]) => { setHabits(h); setCompletions(c); setMissions(m); setManual(mc); setTraining(w); setWeights(wt); setRoutines(r); setOpenWorkout(open); }).catch(message);
  }, [revision, profile?.id]);
  useEffect(() => {
    const day = dayKey();
    Promise.all([nutritionEnabled(), nutritionTarget(day), foodEntries(day, day)]).then(([enabled, target, entries]) => setNutrition({ enabled, target, consumed: sumNutrients(entries) })).catch(message);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 28, height: 28, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 7, overflow: 'hidden' }}>{[colors.sun, colors.coral, colors.accent, colors.mint].map(c => <View key={c} style={{ width: 14, height: 14, backgroundColor: c }}/>)}</View><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .5, textTransform: 'uppercase' }}>{date}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Account" hitSlop={8} onPress={() => router.push('/account')} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lilac }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 18 }}>{profile?.name?.slice(0, 1).toUpperCase() ?? 'M'}</Text>
      </Pressable>
    </View>
    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: width < 375 ? 34 : 40, lineHeight: width < 375 ? 35 : 40, letterSpacing: -1.4, includeFontPadding: false }}>{greeting + ','}{'\n'}{profile?.name ?? 'friend'}</Text>
    <Text style={styles.muted}>{total ? total - done + ' left today. Keep going.' : 'Progress over perfection.'}</Text>
    <TickDial value={percent} label="Daily progress"/>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, borderRadius: 28, backgroundColor: colors.sun, padding: 16 }}>
      <DisplayMetric value={streak} size={58}/>
      <View style={{ flex: 1, gap: 3, paddingBottom: 6 }}><Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 10, letterSpacing: .7, textTransform: 'uppercase' }}>Day streak</Text><Text style={{ color: colors.ink, fontSize: 12 }}>{done === total && total > 0 ? 'Today is complete' : 'Finish today to extend it'}</Text></View>
      <View style={{ width: 80, height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>{streakBars.map((complete, index) => <View key={index} style={{ flex: 1, height: 12 + ((index * 17) % 29), borderRadius: 3, backgroundColor: complete ? colors.ink : 'rgba(30,27,46,.2)' }}/>)}</View>
    </View>
    {openWorkout && <WorkoutInProgressCard workout={openWorkout}/>}
    {nutrition?.enabled && (nutrition.target || nutrition.consumed.kcal > 0) && <Pressable accessibilityRole="button" accessibilityLabel="Open nutrition" onPress={() => router.push('/(tabs)/nutrition')} style={{ minHeight: 120, borderRadius: 28, backgroundColor: colors.card, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}><View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="restaurant-outline" size={28} color={colors.ink}/></View><View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .6 }}>NUTRITION TODAY</Text><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 29 }}>{Math.round(calorieBalance(nutrition.target?.kcal ?? null, nutrition.consumed.kcal).amount)} <Text style={{ fontSize: 12 }}>{calorieBalance(nutrition.target?.kcal ?? null, nutrition.consumed.kcal).label}</Text></Text><Text style={{ color: colors.muted, fontSize: 12 }}>Protein {Math.round(nutrition.consumed.protein)} g{nutrition.target?.protein ? ` / ${nutrition.target.protein} g` : ''}</Text></View><Ionicons name="arrow-forward" size={20} color={colors.ink}/></Pressable>}
    <View style={{ height: 18 }}/>
    <View style={{ minHeight: 310, padding: 22, justifyContent: 'flex-end', gap: 12, overflow: 'hidden', borderRadius: 38, backgroundColor: colors.lilac }}>
      <View pointerEvents="none" style={{ position: 'absolute', right: -32, top: -55, width: 210, height: 210, borderRadius: 110, backgroundColor: colors.sun }}/>
      <View pointerEvents="none" style={{ position: 'absolute', right: 45, top: 30, width: 95, height: 95, borderRadius: 48, backgroundColor: colors.coral, opacity: .75 }}/>
      <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .7, textTransform: 'uppercase' }}>{todayWorkout ? 'Completed today' : 'Featured workout'}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 44, lineHeight: 43, letterSpacing: -1.2, includeFontPadding: false }}>{todayWorkout?.name ?? routines[0]?.name ?? 'Log workout'}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{todayWorkout ? 'Open your saved session' : routines[0] ? 'Ready when you are' : 'Build your next session'}</Text>
      <View style={{ alignSelf: 'flex-start', minWidth: 170 }}><Button title={todayWorkout ? 'View log' : 'Start workout'} onPress={startWorkout}/></View>
    </View>
    <SectionHeader title="Today's missions" action="See all" onPress={() => router.push('/missions')}/>
    {activeMissions.length ? <View style={{ paddingBottom: 4 }}>{activeMissions.slice(0, 3).map((mission, index) => {
      const result = missionResults[index];
      const fill = index === 0 ? colors.coral : index === 1 ? colors.lilac : colors.mint;
      const ink = colors.ink;
      const doneMission = result.done;
      return <Pressable key={mission.id} accessibilityRole="button" accessibilityLabel={mission.title + ' ' + result.value + '/' + result.target} onPress={async () => {
        if (mission.type !== 'manual') { router.push('/missions'); return; }
        try { await repo.setMissionCompletion(mission.id, today, !doneMission); changed(); } catch (error) { message(error); }
      }} style={{ minHeight: 112, borderRadius: 24, backgroundColor: fill, marginBottom: index < Math.min(2, activeMissions.length - 1) ? -15 : 0, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 29, zIndex: index, flexDirection: 'row', alignItems: 'center', gap: 14, elevation: 2 + index }}>
        <Svg width={48} height={48} viewBox="0 0 48 48"><Circle cx={24} cy={24} r={21} fill="none" stroke={index < 2 ? 'rgba(27,10,2,.2)' : colors.border} strokeWidth={2.5}/><Circle cx={24} cy={24} r={21} fill="none" stroke={ink} strokeWidth={2.5} strokeDasharray={132} strokeDashoffset={132 * (1 - Math.min(1, result.value / Math.max(1, result.target)))} rotation={-90} origin="24,24"/></Svg>
        <View style={{ position: 'absolute', left: 30, top: 29 }}><Ionicons name={doneMission ? 'checkmark' : mission.type === 'manual' ? 'add' : 'ellipse-outline'} size={22} color={ink}/></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: ink, fontFamily: fonts.displayHeavy, fontSize: 25, lineHeight: 27, letterSpacing: -.5, includeFontPadding: false }}>{mission.title}</Text><Text style={{ color: colors.ink, fontSize: 12, opacity: .7 }}>{result.value}/{result.target} · {doneMission ? 'Done' : 'In progress'}</Text></View>
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
