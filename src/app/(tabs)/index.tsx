import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, daysBetween, fromDay } from '../../core/date';
import { habitStreak, missionProgress, scheduled } from '../../core/logic';
import { Habit, HabitCompletion, HabitProgress, Mission, MissionCompletion, Routine, WeightEntry, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Page, message } from '../../ui/components';
import { HabitCheck, SectionHeader } from '../../ui/visuals';
import { colors, fonts, radii } from '../../ui/theme';
import { cards } from '../../core/cards';
import { foodEntries, nutritionEnabled, nutritionTarget, type FoodEntry, type NutritionTarget } from '../../data/nutrition';
import { sumNutrients, type Nutrients } from '../../core/nutrition';
import { BottomSheet } from '../../ui/BottomSheet';
import { VoltIconTile, VoltProgressRings } from '../../ui/volt';
import type { OpenWorkout } from '../../data/db';

const localeFor = (language: string) => language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
const sundayWeekStart = (day: string) => {
  const date = fromDay(day);
  date.setDate(date.getDate() - date.getDay());
  return dayKey(date);
};
const monthGridStart = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  start.setDate(start.getDate() - start.getDay());
  return dayKey(start);
};

export default function Home() {
  const { width } = useWindowDimensions();
  const { profile, language, revision, changed } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [habitProgress, setHabitProgress] = useState<HabitProgress[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [selectedDay, setSelectedDay] = useState(dayKey());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => fromDay(dayKey()));
  const [nutrition, setNutrition] = useState<{ enabled: boolean; target: NutritionTarget | null; consumed: Nutrients; entries: FoodEntry[] } | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    Promise.all([repo.habits(), repo.completions(), repo.habitProgress(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.routines(), repo.openWorkoutSession(profile.id)])
      .then(([h, c, hp, m, mc, w, wt, r, open]) => {
        if (!active) return;
        setHabits(h); setCompletions(c); setHabitProgress(hp); setMissions(m); setManual(mc); setTraining(w); setWeights(wt); setRoutines(r); setOpenWorkout(open);
      }).catch(message);
    return () => { active = false; };
  }, [revision, profile?.id]);

  useEffect(() => {
    let active = true;
    Promise.all([nutritionEnabled(), nutritionTarget(selectedDay), foodEntries(selectedDay, selectedDay)])
      .then(([enabled, target, entries]) => { if (active) setNutrition({ enabled, target, consumed: sumNutrients(entries), entries }); })
      .catch(message);
    return () => { active = false; };
  }, [revision, selectedDay]);

  const today = dayKey();
  const locale = localeFor(language);
  const weekDays = useMemo(() => daysBetween(sundayWeekStart(selectedDay), addDays(sundayWeekStart(selectedDay), 6)), [selectedDay]);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(selectedDay));
  const selectedLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(selectedDay));
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const initials = profile?.name?.trim().slice(0, 1).toLocaleUpperCase() || 'C';
  const monthGrid = useMemo(() => daysBetween(monthGridStart(monthCursor), addDays(monthGridStart(monthCursor), 41)), [monthCursor]);
  const monthGridTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthCursor);
  const currentMonth = fromDay(today);
  const nextMonthAvailable = monthCursor.getFullYear() < currentMonth.getFullYear() || (monthCursor.getFullYear() === currentMonth.getFullYear() && monthCursor.getMonth() < currentMonth.getMonth());

  const habitItems = habits.filter(habit => !habit.archived && scheduled(habit, selectedDay)).map(habit => {
    const progress = habitProgress.find(item => item.habit_id === habit.id && item.day === selectedDay);
    const complete = habit.habit_type === 'quantity'
      ? !!progress && progress.amount >= progress.target_snapshot
      : completions.some(item => item.habit_id === habit.id && item.day === selectedDay);
    return { habit, complete };
  });
  const activeMissions = missions.filter(mission => mission.active && mission.period === 'daily');
  const missionResults = activeMissions.map(mission => missionProgress(mission, selectedDay, { completions, workouts: training, weights, manual }));
  const missionDone = missionResults.filter(result => result.done).length;
  const done = habitItems.filter(item => item.complete).length + missionDone;
  const total = habitItems.length + activeMissions.length;
  const percent = total ? Math.round(done / total * 100) : null;
  const streak = Math.max(0, ...habits.filter(habit => !habit.archived && habit.frequency !== 'quota').map(habit => habitStreak(habit, completions, today).current));
  const selectedWorkout = training.find(workout => workout.day === selectedDay);
  const calorieProgress = nutrition?.enabled && nutrition.target?.kcal ? Math.min(1, nutrition.consumed.kcal / nutrition.target.kcal) : null;
  const habitProgressValue = habitItems.length ? (done - missionDone) / habitItems.length : null;
  const workoutProgress = selectedWorkout ? 1 : routines.length ? 0 : null;
  const featured = cards[fromDay(selectedDay).getDay() % cards.length];
  const timedHabits = habitItems.map(item => item.habit).filter(habit => habit.reminder_time).sort((a, b) => (a.reminder_time ?? '').localeCompare(b.reminder_time ?? ''));
  const upcomingHabit = timedHabits.find(habit => !completions.some(item => item.habit_id === habit.id && item.day === selectedDay));
  const lastMeal = nutrition?.entries.at(-1);

  const handleWorkoutPress = () => {
    if (selectedWorkout) router.push({ pathname: '/workout-form', params: { id: selectedWorkout.id } });
    else if (routines[0]) router.push({ pathname: '/workout-form', params: { routine: routines[0].id } });
    else router.push('/(tabs)/workouts');
  };
  const completeHabit = async (habit: Habit, complete: boolean) => {
    try {
      if (habit.habit_type === 'quantity') {
        const target = habitProgress.find(item => item.habit_id === habit.id && item.day === selectedDay)?.target_snapshot ?? habit.target_value ?? 1;
        await repo.setHabitAmount(habit.id, selectedDay, complete ? 0 : target);
      }
      else await repo.setHabitCompletion(habit.id, selectedDay, !complete);
      changed();
    } catch (error) { message(error); }
  };
  const changeMonth = (offset: number) => setMonthCursor(current => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));

  return <Page title="">
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View accessibilityLabel="Cubyfit" style={{ width: 34, height: 34, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 10, overflow: 'hidden' }}>{[colors.accent, colors.blue, colors.lime, colors.paleBlue].map((color, index) => <View key={index} style={{ width: 17, height: 17, backgroundColor: color }}/>)}</View>
        <View style={{ flex: 1 }}><Text numberOfLines={1} accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: width < 360 ? 22 : 25, lineHeight: 29 }}>{greeting}, {profile?.name ?? 'friend'}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11.5 }}>Your day, one step at a time</Text></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Account" hitSlop={8} onPress={() => router.push('/account')} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleBlue }}>
        <Text style={{ color: colors.accentInk, fontFamily: fonts.displayHeavy, fontSize: 18 }}>{initials}</Text>
      </Pressable>
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel={`Choose date, ${selectedLabel}`} onPress={() => { setMonthCursor(fromDay(selectedDay)); setCalendarOpen(true); }} style={{ alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, marginTop: 4, borderRadius: radii.pill, backgroundColor: colors.card2 }}>
      <Ionicons name="calendar-outline" size={15} color={colors.accent}/><Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 12 }}>{monthLabel}</Text><Ionicons name="chevron-down" size={14} color={colors.muted}/>
    </Pressable>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginTop: 2 }}>
      {weekDays.map(day => {
        const selected = day === selectedDay;
        const isFuture = day > today;
        return <Pressable key={day} accessibilityRole="tab" accessibilityState={{ selected, disabled: isFuture }} accessibilityLabel={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day))} disabled={isFuture} onPress={() => setSelectedDay(day)} style={{ flex: 1, minWidth: 0, height: 54, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 18, backgroundColor: selected ? colors.navActiveBackground : colors.card, borderWidth: selected ? 0 : 1, borderColor: colors.border, opacity: isFuture ? .38 : 1 }}>
          <Text style={{ color: selected ? colors.navActiveText : colors.muted, fontFamily: fonts.bold, fontSize: 9.5 }}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day))}</Text>
          <Text style={{ color: selected ? colors.navActiveText : colors.text, fontFamily: fonts.displayHeavy, fontSize: 17, lineHeight: 20 }}>{fromDay(day).getDate()}</Text>
        </Pressable>;
      })}
    </View>

    <View style={{ padding: width < 360 ? 13 : 16, borderRadius: 26, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: width < 360 ? 7 : 12 }}>
        <VoltProgressRings overall={percent === null ? 0 : percent / 100} calories={calorieProgress} habits={habitProgressValue} workout={workoutProgress}/>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>Daily progress</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.softLime }}><Ionicons name="flame" size={11} color={colors.softLimeText}/><Text style={{ color: colors.softLimeText, fontFamily: fonts.bold, fontSize: 9 }}>{streak} day streak</Text></View></View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: width < 360 ? 36 : 42, lineHeight: 43, letterSpacing: -1.6 }}>{percent === null ? '—' : percent}</Text>{percent !== null && <Text style={{ color: colors.accent, fontFamily: fonts.displayHeavy, fontSize: 17 }}>%</Text>}</View>
          <View style={{ gap: 5 }}>
            <ProgressMetric icon="flame-outline" label="Calories" value={nutrition?.enabled && nutrition.target?.kcal ? `${Math.round(nutrition.consumed.kcal).toLocaleString(locale)} / ${nutrition.target.kcal.toLocaleString(locale)}` : 'Not set'}/>
            <ProgressMetric icon="checkmark-circle-outline" label="Habits" value={habitItems.length ? `${done - missionDone} / ${habitItems.length}` : 'No habits due'}/>
            <ProgressMetric icon="barbell-outline" label="Workout" value={selectedWorkout ? 'Done' : routines.length ? 'To do' : 'Not planned'}/>
          </View>
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 10.5 }}>{percent === null ? 'Add a habit or mission to start tracking this day.' : `${done} of ${total} daily goals completed`}</Text>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <VoltIconTile icon="restaurant-outline" title="Nutrition" onPress={() => router.push('/(tabs)/nutrition')}/>
      <VoltIconTile icon="barbell-outline" title="Train" onPress={() => router.push('/(tabs)/workouts')}/>
      <VoltIconTile icon="checkmark-circle-outline" title="Habits" onPress={() => router.push('/(tabs)/habits')}/>
      <VoltIconTile icon="stats-chart-outline" title="Progress" onPress={() => router.push('/(tabs)/progress')}/>
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel={openWorkout ? 'Resume workout' : upcomingHabit ? `Open habit ${upcomingHabit.name}` : 'Open training'} onPress={() => {
      if (openWorkout) router.push({ pathname: '/workout-form', params: { session: openWorkout.id } });
      else if (upcomingHabit) router.push('/(tabs)/habits');
      else handleWorkoutPress();
    }} style={{ minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card2 }}><Ionicons name={openWorkout ? 'play' : upcomingHabit ? 'checkmark-circle-outline' : 'time-outline'} size={20} color={colors.accent}/></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: .6, textTransform: 'uppercase' }}>{openWorkout ? 'In progress' : upcomingHabit ? (upcomingHabit.reminder_time ? `Up next · ${upcomingHabit.reminder_time}` : 'Up next') : 'No scheduled activity'}</Text><Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>{openWorkout ? 'Resume workout' : upcomingHabit?.name ?? 'Nothing scheduled'}</Text></View>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navActiveBackground, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-forward" size={19} color={colors.navActiveText}/></View>
    </Pressable>

    <View style={{ flexDirection: 'row', gap: 9 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={selectedWorkout ? `View workout ${selectedWorkout.name}` : 'Open workouts'} onPress={handleWorkoutPress} style={{ flex: 1, minHeight: 140, borderRadius: 24, padding: 13, justifyContent: 'space-between', backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><Ionicons name="barbell-outline" size={17} color={colors.accent}/></View><Ionicons name={selectedWorkout ? 'checkmark-circle' : 'play-circle'} size={27} color={selectedWorkout ? colors.lime : colors.accent}/></View>
        <View><Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>{selectedWorkout?.name ?? routines[0]?.name ?? 'Workout'}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 10.5 }}>{selectedWorkout ? `${selectedWorkout.duration_min ?? '—'} min · saved session` : routines[0] ? 'Routine ready to start' : 'Create your first routine'}</Text></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={lastMeal ? `Open meal ${lastMeal.name}` : 'Add a meal'} onPress={() => router.push('/(tabs)/nutrition')} style={{ flex: 1, minHeight: 140, borderRadius: 24, padding: 13, justifyContent: 'space-between', backgroundColor: colors.surfaceWarm, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><Ionicons name="restaurant-outline" size={17} color={colors.accent}/></View><Ionicons name="add-circle" size={27} color={colors.navActiveBackground}/></View>
        <View><Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>{lastMeal?.name ?? 'Nutrition'}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5 }}>{lastMeal ? `${Math.round(lastMeal.kcal)} kcal · ${lastMeal.meal}` : 'No meal logged for this day'}</Text></View>
        <Text style={{ alignSelf: 'flex-start', color: colors.navActiveText, backgroundColor: colors.navActiveBackground, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, fontFamily: fonts.bold, fontSize: 10 }}>{lastMeal ? 'View meals' : 'Add meal'}</Text>
      </Pressable>
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel="Open motivation center" onPress={() => router.push('/motivation')} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderRadius: radii.pill, backgroundColor: colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}>
      <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 9, letterSpacing: .7 }}>DAILY</Text><Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 13 }}>{featured.text[language]}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted}/>
    </Pressable>

    {habitItems.length > 0 && <>
      <SectionHeader title={selectedDay === today ? "Today's habits" : 'Habits'} action="See all" onPress={() => router.push('/(tabs)/habits')}/>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {habitItems.slice(0, 4).map(({ habit, complete }) => <View key={habit.id} style={{ flexBasis: '48%', flexGrow: 1, minWidth: 130, minHeight: 62, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border }}><HabitCheck checked={complete} label={habit.name} onPress={() => completeHabit(habit, complete)}/><Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 12 }}>{habit.name}</Text></View>)}
      </View>
    </>}

    <SectionHeader title="More"/>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <MoreLink icon="flag-outline" label="Missions" onPress={() => router.push('/missions')}/>
      <MoreLink icon="scale-outline" label="Weight" onPress={() => router.push('/weight')}/>
      <MoreLink icon="sparkles-outline" label="Motivation" onPress={() => router.push('/motivation')}/>
      <MoreLink icon="person-outline" label="Profile" onPress={() => router.push('/(tabs)/profile')}/>
    </View>

    <View style={{ height: 8 }}/>
    <BottomSheet visible={calendarOpen} title="Choose a date" onClose={() => setCalendarOpen(false)}>{close => <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={20} color={colors.text}/></Pressable>
        <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 18 }}>{monthGridTitle}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !nextMonthAvailable }} disabled={!nextMonthAvailable} onPress={() => changeMonth(1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: nextMonthAvailable ? 1 : .35 }}><Ionicons name="chevron-forward" size={20} color={colors.text}/></Pressable>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{weekDays.map(day => <Text key={day} style={{ width: '13%', color: colors.muted, textAlign: 'center', fontFamily: fonts.bold, fontSize: 10 }}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)).slice(0, 2)}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
        {monthGrid.map(day => {
          const selected = day === selectedDay;
          const outside = fromDay(day).getMonth() !== monthCursor.getMonth();
          const future = day > today;
          return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected, disabled: future }} accessibilityLabel={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromDay(day))} disabled={future} onPress={() => { setSelectedDay(day); close(() => setCalendarOpen(false)); }} style={{ width: '14.285%', minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.navActiveBackground : 'transparent', opacity: future ? .32 : outside ? .48 : 1 }}><Text style={{ color: selected ? colors.navActiveText : colors.text, fontFamily: selected ? fonts.bold : fonts.body, fontSize: 13 }}>{fromDay(day).getDate()}</Text></View></Pressable>;
        })}
      </View>
      <Button title="Today" kind="ghost" disabled={selectedDay === today} onPress={() => { setSelectedDay(today); close(() => setCalendarOpen(false)); }}/>
    </View>}</BottomSheet>
  </Page>;
}

function ProgressMetric({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 17 }}><View style={{ width: 17, height: 17, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card2 }}><Ionicons name={icon} size={11} color={colors.accent}/></View><Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.muted, fontSize: 10.5 }}>{label}</Text><Text numberOfLines={1} style={{ maxWidth: '58%', color: colors.text, fontFamily: fonts.bold, fontSize: 10.5, textAlign: 'right' }}>{value}</Text></View>;
}

function MoreLink({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ flexGrow: 1, flexBasis: '48%', minWidth: 130, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.card2, borderRadius: 16, paddingHorizontal: 7 }}><Ionicons name={icon} size={16} color={colors.accent}/><Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 11 }}>{label}</Text></Pressable>;
}
