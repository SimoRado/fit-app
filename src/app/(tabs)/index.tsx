import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, daysBetween, fromDay } from '../../core/date';
import { habitStreak, missionProgress, scheduled } from '../../core/logic';
import { Habit, HabitCompletion, HabitProgress, Mission, MissionCompletion, Routine, RoutineExercise, WeightEntry, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { Button, Page, message } from '../../ui/components';
import { colors, fonts } from '../../ui/theme';
import { cards } from '../../core/cards';
import { gymSchedulePreferenceKey, parseGymSchedule, resolveDayPlan, type GymDayPlan } from '../../core/gymSchedule';
import { dailyProgressPercent } from '../../core/voltGeometry';
import { foodEntries, nutritionTarget, type FoodEntry, type NutritionTarget } from '../../data/nutrition';
import { sumNutrients, type Meal, type Nutrients } from '../../core/nutrition';
import { BottomSheet } from '../../ui/BottomSheet';
import { FoodSheet } from '../../ui/NutritionSheets';
import { MotionPressable } from '../../ui/MotionPressable';
import { CubyMark } from '../../ui/CubyMark';
import { DayPills, HeroNumber, IconBox, SquareRings, VCard, VChip, useEntering, usePalette, type VoltIcon } from '../../ui/voltKit';
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
/** Prototype: next meal follows the clock (breakfast < 11h, lunch < 15h, dinner < 20h, then snacks). */
const mealForHour = (hour: number): Meal => hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 20 ? 'dinner' : 'snacks';
const mealTitle: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

export default function Home() {
  const { profile, language, changed } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [habitProgress, setHabitProgress] = useState<HabitProgress[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineLinks, setRoutineLinks] = useState<RoutineExercise[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<GymDayPlan[]>([]);
  const [restDays, setRestDays] = useState<string[]>([]);
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [selectedDay, setSelectedDay] = useState(dayKey());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => fromDay(dayKey()));
  const [nutrition, setNutrition] = useState<{ target: NutritionTarget | null; consumed: Nutrients; entries: FoodEntry[] } | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    Promise.all([repo.habits(), repo.completions(), repo.habitProgress(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.routines(), repo.routineExercises(), repo.openWorkoutSession(profile.id), repo.preferences(), repo.restDays()])
      .then(([h, c, hp, m, mc, w, wt, r, re, open, prefs, rd]) => {
        if (!active) return;
        setHabits(h); setCompletions(c); setHabitProgress(hp); setMissions(m); setManual(mc); setTraining(w); setWeights(wt); setRoutines(r); setRoutineLinks(re); setOpenWorkout(open); setWeeklyPlan(parseGymSchedule(prefs.find(item => item.key === gymSchedulePreferenceKey)?.value)); setRestDays(rd.map(row => row.day));
      }).catch(message);
    return () => { active = false; };
  }, [revision, profile?.id]);

  useEffect(() => {
    let active = true;
    Promise.all([nutritionTarget(selectedDay), foodEntries(selectedDay, selectedDay)])
      .then(([target, entries]) => { if (active) setNutrition({ target, consumed: sumNutrients(entries), entries }); })
      .catch(message);
    return () => { active = false; };
  }, [revision, selectedDay]);

  const today = dayKey();
  const locale = localeFor(language);
  const weekDays = useMemo(() => daysBetween(sundayWeekStart(selectedDay), addDays(sundayWeekStart(selectedDay), 6)), [selectedDay]);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(selectedDay));
  const selectedLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(selectedDay));
  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'friend';
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
    return { habit, complete, progress };
  });
  const habitsDone = habitItems.filter(item => item.complete).length;
  const activeMissions = missions.filter(mission => mission.active && mission.period === 'daily');
  const missionDone = activeMissions.filter(mission => missionProgress(mission, selectedDay, { completions, workouts: training, weights, manual }).done).length;
  const streak = Math.max(0, ...habits.filter(habit => !habit.archived && habit.frequency !== 'quota').map(habit => habitStreak(habit, completions, today).current));
  const selectedWorkout = training.find(workout => workout.day === selectedDay);
  const caloriesOn = !!nutrition?.target?.kcal;

  // Daily progress follows the prototype: three rings (calories when a target exists,
  // otherwise missions; habits; workout) and an overall percentage averaging the three.
  const firstRing = caloriesOn ? nutrition!.consumed.kcal / nutrition!.target!.kcal : activeMissions.length ? missionDone / activeMissions.length : null;
  const habitRing = habitItems.length ? habitsDone / habitItems.length : null;
  const workoutRing = selectedWorkout ? 1 : routines.length ? 0 : null;
  const ringValues = [firstRing ?? 0, habitRing ?? 0, workoutRing ?? 0];
  const percent = dailyProgressPercent([firstRing, habitRing, workoutRing]);

  const featured = cards[fromDay(selectedDay).getDay() % cards.length];
  const todo = habitItems.filter(item => !item.complete).sort((a, b) => (a.habit.reminder_time ?? '99:99').localeCompare(b.habit.reminder_time ?? '99:99'));
  const nextHabit = selectedDay === today ? todo[0] : undefined;
  const nextMeal = mealForHour(new Date().getHours());
  const nextMealKcal = sumNutrients(nutrition?.entries.filter(entry => entry.meal === nextMeal) ?? []).kcal;
  // Workout card follows the gym-day plan for the selected date, then falls back to the newest routine.
  const dayPlan = resolveDayPlan(weeklyPlan, selectedDay, restDays, new Set(routines.map(item => item.id)));
  const plannedRoutine = dayPlan?.kind === 'routine' ? routines.find(item => item.id === dayPlan.routineId) : undefined;
  const routine = plannedRoutine ?? (dayPlan?.kind === 'rest' ? undefined : routines[0]);
  const routineExerciseCount = routine ? routineLinks.filter(link => link.routine_id === routine.id).length : 0;

  const handleWorkoutPress = () => {
    if (openWorkout) router.push({ pathname: '/workout-form', params: { session: openWorkout.id } });
    else if (selectedWorkout) router.push({ pathname: '/workout-form', params: { id: selectedWorkout.id } });
    else if (routine) router.push({ pathname: '/workout-form', params: { routine: routine.id } });
    else router.push('/(tabs)/workouts');
  };
  const advanceHabit = async (habit: Habit, current: HabitProgress | undefined) => {
    try {
      if (habit.habit_type === 'quantity') {
        const amount = current?.amount ?? 0;
        await repo.setHabitAmount(habit.id, selectedDay, Math.round((amount + (habit.increment ?? 1)) * 10000) / 10000);
      }
      else await repo.setHabitCompletion(habit.id, selectedDay, true);
      changed();
    } catch (error) { message(error); }
  };
  const changeMonth = (offset: number) => setMonthCursor(current => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));
  const cardEntering = useEntering(0);

  return <Page title="">
    {/* .top8 — logo, greeting, account avatar */}
    <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden' }}><CubyMark size={40}/></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: -0.4 }}>Hi {firstName}</Text>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>FAST REFRESH CHECK: LIVE</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Account" hitSlop={8} onPress={() => router.push('/account')} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
        <Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{initials}</Text>
      </Pressable>
    </View>

    {/* Month chip + week pills */}
    <MotionPressable pressScale={0.96} accessibilityRole="button" accessibilityLabel={`Choose date, ${selectedLabel}`} onPress={() => { setMonthCursor(fromDay(selectedDay)); setCalendarOpen(true); }} style={{ alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 999, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
      <Ionicons name="calendar-outline" size={15} color={p.text}/><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{monthLabel}</Text><Ionicons name="chevron-down" size={14} color={p.text}/>
    </MotionPressable>
    <DayPills selected={selectedDay} onSelect={setSelectedDay} days={weekDays.map(day => ({
      key: day,
      number: String(fromDay(day).getDate()),
      label: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)),
      disabled: day > today,
      accessibilityLabel: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day)),
    }))}/>

    {/* .card8.dp — daily progress */}
    <Animated.View entering={cardEntering}>
      <VCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15.5 }}>Daily progress</Text>
          <VChip icon="flame-outline" text={`${streak} day streak`}/>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <SquareRings values={ringValues} size={124} accessibilityLabel={percent === null ? 'No goals to track for this day' : `${percent} percent of today's goals`}/>
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeroNumber value={percent === null ? '—' : String(percent)} sup={percent === null ? undefined : '%'} size={38} supColor={p.accent}/>
            <View style={{ gap: 7, marginTop: 10 }}>
              <Legend icon="restaurant-outline" color={p.q1} label={caloriesOn ? 'Calories' : 'Missions'} value={caloriesOn ? `${Math.round(nutrition!.consumed.kcal).toLocaleString(locale)} / ${nutrition!.target!.kcal.toLocaleString(locale)}` : activeMissions.length ? `${missionDone} / ${activeMissions.length}` : 'Not set'}/>
              <Legend icon="checkmark-circle-outline" color={p.q2} label="Habits" value={habitItems.length ? `${habitsDone} / ${habitItems.length}` : 'None due'}/>
              <Legend icon="barbell-outline" color={p.q3} label="Workout" value={selectedWorkout ? 'Done' : routines.length ? (selectedDay === today ? 'To do' : 'Rest') : 'Not planned'}/>
            </View>
          </View>
        </View>
      </VCard>
    </Animated.View>

    {/* .sc8 — shortcuts */}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Shortcut icon="restaurant-outline" title="Nutrition" onPress={() => router.push('/(tabs)/nutrition')}/>
      <Shortcut icon="barbell-outline" title="Train" onPress={() => router.push('/(tabs)/workouts')}/>
      <Shortcut icon="checkmark-circle-outline" title="Habits" onPress={() => router.push('/(tabs)/habits')}/>
      <Shortcut icon="bar-chart-outline" title="Progress" onPress={() => router.push('/(tabs)/progress')}/>
    </View>

    {/* Workout session in progress (existing session state) */}
    {openWorkout && <UpNextRow icon="play" caption={openWorkout.session_status === 'paused' ? 'Workout paused' : 'Workout in progress'} title={openWorkout.name || 'Workout session'} detail={`${openWorkout.completed_sets}/${openWorkout.total_sets} sets`} onOpen={handleWorkoutPress} action={{ icon: 'play', label: 'Resume workout', onPress: handleWorkoutPress }}/>}

    {/* .nx — up next habit */}
    {selectedDay === today && (habits.filter(habit => !habit.archived).length === 0
      ? <UpNextRow icon="add" caption="Get started" title="Add your first habit" onOpen={() => router.push('/habit-form')} emphasis/>
      : nextHabit
        ? <UpNextRow icon={nextHabit.habit.habit_type === 'quantity' ? 'water-outline' : 'checkmark-circle-outline'} caption={`Up next${nextHabit.habit.reminder_time ? ` · ${nextHabit.habit.reminder_time}` : ''}`} title={nextHabit.habit.name}
            detail={nextHabit.habit.habit_type === 'quantity' ? `${nextHabit.progress?.amount ?? 0} / ${nextHabit.progress?.target_snapshot ?? nextHabit.habit.target_value ?? 1} ${nextHabit.habit.unit ?? ''}`.trim() : undefined}
            onOpen={() => router.push('/(tabs)/habits')}
            action={{ icon: nextHabit.habit.habit_type === 'quantity' ? 'add' : 'checkmark', label: `${nextHabit.habit.habit_type === 'quantity' ? 'Add progress to' : 'Complete'} ${nextHabit.habit.name}`, onPress: () => advanceHabit(nextHabit.habit, nextHabit.progress) }}/>
        : habitItems.length > 0 ? <UpNextRow icon="checkmark" caption="Habits" title="All done today. Nice." onOpen={() => router.push('/(tabs)/progress')} done link="See progress"/> : null)}

    {/* .duo — training and meal cards */}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <VCard tone="soft1" raised onPress={handleWorkoutPress} accessibilityLabel={selectedWorkout ? `View workout ${selectedWorkout.name}` : routine ? `Start ${routine.name}` : 'Open workouts'} style={{ flex: 1, minHeight: 132, padding: 14, gap: 3 }}>
        <IconBox icon="barbell-outline" size={36} iconSize={18}/>
        <View style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: p.g1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={selectedWorkout ? 'checkmark' : 'play'} size={15} color={p.plInk}/></View>
        <View style={{ marginTop: 'auto' }}>
          <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{selectedWorkout?.name ?? routine?.name ?? 'Workout'}</Text>
          <Text numberOfLines={2} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{selectedWorkout ? `Done${selectedWorkout.duration_min ? ` · ${selectedWorkout.duration_min} min` : ''}` : routine ? `${plannedRoutine ? 'Planned · ' : ''}${routineExerciseCount} exercise${routineExerciseCount === 1 ? '' : 's'}` : dayPlan?.kind === 'rest' ? 'Rest day' : 'Create your first routine'}</Text>
        </View>
      </VCard>
      <VCard tone="soft2" raised onPress={() => setFoodOpen(true)} accessibilityLabel={`Add food to ${mealTitle[nextMeal]}`} style={{ flex: 1, minHeight: 132, padding: 14, gap: 3 }}>
          <IconBox icon="restaurant-outline" size={36} iconSize={18}/>
          <View style={{ marginTop: 'auto' }}>
            <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{mealTitle[nextMeal]}</Text>
            <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{nextMealKcal ? `${Math.round(nextMealKcal).toLocaleString(locale)} kcal logged` : 'Not logged yet'}</Text>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: p.g1 }}><Ionicons name="add" size={14} color={p.plInk}/><Text style={{ color: p.plInk, fontFamily: fonts.bold, fontSize: 11.5 }}>Add meal</Text></View>
          </View>
        </VCard>
    </View>

    {/* .q8 — daily quote */}
    <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel="Open motivation center" onPress={() => router.push('/motivation')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: p.borderStrong }}>
      <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.84, textTransform: 'uppercase' }}>Daily</Text>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: p.text, fontFamily: fonts.displayHeavy, fontSize: 13.5, textTransform: 'uppercase' }}>{featured.text[language]}</Text>
      <Ionicons name="chevron-forward" size={16} color={p.text}/>
    </MotionPressable>

    {/* Secondary destinations (the prototype reaches these from its side panel). */}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
      <MoreLink icon="flag-outline" label="Missions" onPress={() => router.push('/missions')}/>
      <MoreLink icon="scale-outline" label="Weight" onPress={() => router.push('/weight')}/>
      <MoreLink icon="sparkles-outline" label="Motivation" onPress={() => router.push('/motivation')}/>
    </View>

    <View style={{ height: 8 }}/>
    <BottomSheet visible={foodOpen} title="Add food" onClose={() => setFoodOpen(false)}>{close => <FoodSheet key={`${nextMeal}:${selectedDay}`} entry={null} meal={nextMeal} day={selectedDay} close={close} onSaved={() => changed()}/>}</BottomSheet>
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
          return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected, disabled: future }} accessibilityLabel={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromDay(day))} disabled={future} onPress={() => { setSelectedDay(day); close(() => setCalendarOpen(false)); }} style={{ width: '14.285%', minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.g1 : 'transparent', opacity: future ? .32 : outside ? .48 : 1 }}><Text style={{ color: selected ? colors.plInk : colors.text, fontFamily: selected ? fonts.bold : fonts.body, fontSize: 13 }}>{fromDay(day).getDate()}</Text></View></Pressable>;
        })}
      </View>
      <Button title="Today" kind="ghost" disabled={selectedDay === today} onPress={() => { setSelectedDay(today); close(() => setCalendarOpen(false)); }}/>
    </View>}</BottomSheet>
  </Page>;
}

/** `.lg8r` — ring legend row. */
function Legend({ icon, color, label, value }: { icon: VoltIcon; color: string; label: string; value: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: p.lgi }}><Ionicons name={icon} size={13} color={color}/></View>
    <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{label}</Text>
    <Text numberOfLines={1} style={{ maxWidth: '62%', color: p.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{value}</Text>
  </View>;
}

/** `.sc8b` — shortcut tile. */
function Shortcut({ icon, title, onPress }: { icon: VoltIcon; title: string; onPress: () => void }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.93} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 7, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
    <IconBox icon={icon} size={42} radius={14} background={p.soft1} iconSize={20}/>
    <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 11.5 }}>{title}</Text>
  </MotionPressable>;
}

/** `.nx` — "Up next" row with a round completion button. */
function UpNextRow({ icon, caption, title, detail, onOpen, action, done = false, emphasis = false, link }: { icon: VoltIcon; caption: string; title: string; detail?: string; onOpen: () => void; action?: { icon: VoltIcon; label: string; onPress: () => void | Promise<void> }; done?: boolean; emphasis?: boolean; link?: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: 22, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onOpen} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconBox icon={icon} size={42} radius={14} background={done ? p.lime : emphasis ? p.g1 : p.soft1} color={done ? '#0B1446' : emphasis ? p.plInk : p.accent} iconSize={18}/>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{caption}</Text>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{title}</Text>
        {!!detail && <Text numberOfLines={1} style={{ color: p.accent, fontFamily: fonts.semibold, fontSize: 11.5 }}>{detail}</Text>}
      </View>
    </Pressable>
    {action ? <MotionPressable pressScale={0.86} accessibilityRole="button" accessibilityLabel={action.label} onPress={() => { void action.onPress(); }} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: p.g1 }}><Ionicons name={action.icon} size={20} color={p.plInk}/></MotionPressable>
      : link ? <Pressable accessibilityRole="button" onPress={onOpen} style={{ paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>{link}</Text></Pressable>
        : <Ionicons name="chevron-forward" size={16} color={p.text}/>}
  </View>;
}

function MoreLink({ icon, label, onPress }: { icon: VoltIcon; label: string; onPress: () => void }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.95} accessibilityRole="button" onPress={onPress} style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line, borderRadius: 16, paddingHorizontal: 7 }}><Ionicons name={icon} size={15} color={p.accent}/><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 11.5 }}>{label}</Text></MotionPressable>;
}
