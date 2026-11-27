import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, daysBetween, fromDay } from '../../core/date';
import { clampHomeDay, homeDaySelectable, homeWeekBounds, homeWeekLabel, shiftHomeWeek, sundayWeekStart } from '../../core/homeWeek';
import { useReducedMotion } from '../../ui/motion';
import { localize } from '../../core/i18n';
import { habitStreak, scheduled } from '../../core/logic';
import { Habit, HabitCompletion, HabitProgress, Routine, RoutineExercise, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { useLoadState } from '../../state/useLoadState';
import { Page, message } from '../../ui/components';
import { fonts, brand } from '../../ui/theme';
import { gymOverridesPreferenceKey, gymSchedulePreferenceKey, parseGymOverrides, parseGymSchedule, resolveDayPlan, type GymDayOverride, type GymDayPlan } from '../../core/gymSchedule';
import { dailyProgressPercent } from '../../core/voltGeometry';
import { foodEntries, nutritionTarget, type FoodEntry, type NutritionTarget } from '../../data/nutrition';
import { sumNutrients, type Meal, type Nutrients } from '../../core/nutrition';
import { BottomSheet } from '../../ui/BottomSheet';
import { FoodSheet } from '../../ui/NutritionSheets';
import { MotionPressable } from '../../ui/MotionPressable';
import { CubyMark } from '../../ui/CubyMark';
import { DayPills, HeroNumber, IconBox, SquareRings, VCard, VChip, cardShadow, useEntering, usePalette, type VoltIcon } from '../../ui/voltKit';
import { LotusFlower, candyStyle } from '../../ui/LotusArt';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonCircle, SkeletonScreen, SkeletonText } from '../../ui/Skeleton';
import type { OpenWorkout } from '../../data/db';

/** Background tab preloading after Home's first content (see Home). */
const TAB_PRELOAD_ORDER = ['/(tabs)/workouts', '/(tabs)/nutrition', '/(tabs)/habits', '/(tabs)/progress'] as const;
const TAB_PRELOAD_DELAY_MS = 900;
const TAB_PRELOAD_GAP_MS = 700;

const localeFor = (language: string) => language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
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
  const [training, setTraining] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineLinks, setRoutineLinks] = useState<RoutineExercise[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<GymDayPlan[]>([]);
  const [dayOverrides, setDayOverrides] = useState<Map<string, GymDayOverride>>(new Map());
  const [restDays, setRestDays] = useState<string[]>([]);
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [selectedDay, setSelectedDay] = useState(dayKey());
  const [weekStart, setWeekStart] = useState(() => sundayWeekStart(dayKey()));
  const [foodOpen, setFoodOpen] = useState(false);
  // Tagged with its day: a read for a previously selected date can never be shown under the current one.
  const [nutrition, setNutrition] = useState<{ day: string; target: NutritionTarget | null; consumed: Nutrients; entries: FoodEntry[] } | null>(null);
  // First-load state: skeletons only until each read has completed once; refreshes keep content.
  const dataLoad = useLoadState('index');
  const nutritionLoad = useLoadState();
  const { attempt: dataAttempt, succeed: dataReady, fail: dataFailed } = dataLoad;
  const { attempt: nutritionAttempt, succeed: nutritionReady, fail: nutritionFailed } = nutritionLoad;

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    Promise.all([repo.habits(), repo.completions(), repo.habitProgress(), repo.trainingWorkouts(), repo.routines(), repo.routineExercises(), repo.openWorkoutSession(profile.id), repo.preferences(), repo.restDays()])
      .then(([h, c, hp, w, r, re, open, prefs, rd]) => {
        if (!active) return;
        setHabits(h); setCompletions(c); setHabitProgress(hp); setTraining(w); setRoutines(r); setRoutineLinks(re); setOpenWorkout(open); setWeeklyPlan(parseGymSchedule(prefs.find(item => item.key === gymSchedulePreferenceKey)?.value)); setDayOverrides(parseGymOverrides(prefs.find(item => item.key === gymOverridesPreferenceKey)?.value)); setRestDays(rd.map(row => row.day));
        dataReady();
      }).catch(error => { if (active && !dataFailed()) message(error); });
    return () => { active = false; };
  }, [revision, profile?.id, dataAttempt, dataReady, dataFailed]);

  useEffect(() => {
    let active = true;
    Promise.all([nutritionTarget(selectedDay), foodEntries(selectedDay, selectedDay)])
      .then(([target, entries]) => { if (active) { setNutrition({ day: selectedDay, target, consumed: sumNutrients(entries), entries }); nutritionReady(); } })
      .catch(error => { if (active && !nutritionFailed()) message(error); });
    return () => { active = false; };
  }, [revision, selectedDay, nutritionAttempt, nutritionReady, nutritionFailed]);
  const homeStatus = dataLoad.status === 'error' || nutritionLoad.status === 'error' ? 'error' : dataLoad.status === 'ready' && nutritionLoad.status === 'ready' ? 'ready' : 'loading';
  // Mount the other tabs in the background, one at a time, once Home shows real content. A tab's
  // first mount is the costly part of its first visit (measured on a Redmi dev build: 0.75–1.7 s of
  // JS before the destination appeared); a preloaded tab opens like a repeat visit and already has
  // its local data. Spaced out so a tap during preloading waits for at most one screen.
  const preloadStarted = useRef(false);
  useEffect(() => {
    if (homeStatus !== 'ready' || preloadStarted.current) return;
    preloadStarted.current = true;
    const queue = [...TAB_PRELOAD_ORDER];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = (delay: number) => {
      timer = setTimeout(() => {
        const href = queue.shift();
        if (!href) return;
        try { router.prefetch(href); if (__DEV__) console.info(`[perf] preload ${href}`); } catch (error) { if (__DEV__) console.warn('[perf] preload failed', href, error); }
        next(TAB_PRELOAD_GAP_MS);
      }, delay);
    };
    next(TAB_PRELOAD_DELAY_MS);
    return () => { if (timer) clearTimeout(timer); };
  }, [homeStatus]);
  const retryHome = () => { if (dataLoad.status === 'error') dataLoad.retry(); if (nutritionLoad.status === 'error') nutritionLoad.retry(); };

  const today = dayKey();
  const locale = localeFor(language);
  const weekDays = useMemo(() => daysBetween(weekStart, addDays(weekStart, 6)), [weekStart]);
  const weekBounds = homeWeekBounds(weekStart, today);
  const weekLabel = homeWeekLabel(weekStart, today, locale);
  const reducedMotion = useReducedMotion();
  // Keep the selection inside the Home range (e.g. after midnight while the app stayed open).
  useEffect(() => {
    const clamped = clampHomeDay(selectedDay, today);
    if (clamped !== selectedDay) { setSelectedDay(clamped); setWeekStart(sundayWeekStart(clamped)); }
  }, [selectedDay, today]);
  const changeWeek = (direction: -1 | 1) => {
    const next = shiftHomeWeek(weekStart, selectedDay, direction, today);
    setWeekStart(next.weekStart); setSelectedDay(next.selected);
  };
  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'friend';
  const initials = profile?.name?.trim().slice(0, 1).toLocaleUpperCase() || 'C';

  const habitItems = habits.filter(habit => !habit.archived && scheduled(habit, selectedDay)).map(habit => {
    const progress = habitProgress.find(item => item.habit_id === habit.id && item.day === selectedDay);
    const complete = habit.habit_type === 'quantity'
      ? !!progress && progress.amount >= progress.target_snapshot
      : completions.some(item => item.habit_id === habit.id && item.day === selectedDay);
    return { habit, complete, progress };
  });
  const habitsDone = habitItems.filter(item => item.complete).length;
  const streak = Math.max(0, ...habits.filter(habit => !habit.archived && habit.frequency !== 'quota').map(habit => habitStreak(habit, completions, today).current));
  const selectedWorkout = training.find(workout => workout.day === selectedDay);
  // Only the selected day's nutrition is ever shown. Right after a date change (one local read)
  // the calorie values wait for that day instead of showing the previous day's numbers.
  const dayNutrition = nutrition?.day === selectedDay ? nutrition : null;
  const caloriesOn = !!(dayNutrition ?? nutrition)?.target?.kcal;

  // Daily progress tracks only active release features: calories, habits and workout.
  const firstRing = caloriesOn && dayNutrition?.target?.kcal ? dayNutrition.consumed.kcal / dayNutrition.target.kcal : null;
  const habitRing = habitItems.length ? habitsDone / habitItems.length : null;
  const workoutRing = selectedWorkout ? 1 : routines.length ? 0 : null;
  const ringValues = [firstRing ?? 0, habitRing ?? 0, workoutRing ?? 0];
  const percent = dailyProgressPercent([firstRing, habitRing, workoutRing]);

  const todo = habitItems.filter(item => !item.complete).sort((a, b) => (a.habit.reminder_time ?? '99:99').localeCompare(b.habit.reminder_time ?? '99:99'));
  const nextHabit = selectedDay === today ? todo[0] : undefined;
  const nextMeal = mealForHour(new Date().getHours());
  const nextMealKcal = sumNutrients(dayNutrition?.entries.filter(entry => entry.meal === nextMeal) ?? []).kcal;
  // Workout card follows the gym-day plan for the selected date, then falls back to the newest routine.
  const dayPlan = resolveDayPlan(weeklyPlan, selectedDay, restDays, new Set(routines.map(item => item.id)), dayOverrides);
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
  const cardEntering = useEntering(0);

  return <Page title="">
    {/* .top8 — logo, greeting, account avatar */}
    <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden' }}>
        <CubyMark size={40} variant="brand"/>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: -0.4 }}>Hi {firstName}</Text>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>Here&apos;s your day so far</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Profile" hitSlop={8} onPress={() => router.navigate('/profile')} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: p.light ? p.soft1 : p.c8, borderWidth: 1.5, borderColor: p.borderStrong }}>
        <Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{initials}</Text>
      </Pressable>
    </View>

    {/* Week navigator + week pills (Home looks back 30 days at most; no future weeks). */}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <WeekArrow direction={-1} disabled={!weekBounds.canGoBack} onPress={() => changeWeek(-1)}/>
      <Text accessibilityRole="header" numberOfLines={1} style={{ minWidth: 112, textAlign: 'center', color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{weekLabel}</Text>
      <WeekArrow direction={1} disabled={!weekBounds.canGoForward} onPress={() => changeWeek(1)}/>
    </View>
    <Animated.View key={weekStart} entering={reducedMotion ? undefined : FadeIn.duration(220)}>
    <DayPills selected={selectedDay} onSelect={day => { if (homeDaySelectable(day, today)) setSelectedDay(day); }} days={weekDays.map(day => ({
      key: day,
      number: String(fromDay(day).getDate()),
      label: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)),
      disabled: !homeDaySelectable(day, today),
      accessibilityLabel: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day)),
    }))}/>
    </Animated.View>

    {/* .card8.dp — daily progress */}
    {homeStatus === 'error' ? <LoadError text="Could not load today's progress." onRetry={retryHome}/> : homeStatus === 'loading' ? <HomeProgressSkeleton/> : <Animated.View entering={cardEntering}>
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
              <Legend icon="restaurant-outline" color={p.q1} label="Calories" value={caloriesOn ? (dayNutrition?.target?.kcal ? `${Math.round(dayNutrition.consumed.kcal).toLocaleString(locale)} / ${dayNutrition.target.kcal.toLocaleString(locale)}` : '…') : 'Not set'}/>
              <Legend icon="checkmark-circle-outline" color={p.q2} label="Habits" value={habitItems.length ? `${habitsDone} / ${habitItems.length}` : 'None due'}/>
              <Legend icon="barbell-outline" color={p.light && p.style === 'volt' ? p.chipFg : p.q3} background={p.light && p.style === 'volt' ? p.softLime : undefined} label="Workout" value={selectedWorkout ? 'Done' : routines.length ? (selectedDay === today ? 'To do' : 'Rest') : 'Not planned'}/>
            </View>
          </View>
        </View>
      </VCard>
    </Animated.View>}

    {/* .sc8 — shortcuts (static destinations: shown immediately, also while data loads) */}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Shortcut icon="restaurant-outline" title="Nutrition" onPress={() => router.push('/(tabs)/nutrition')}/>
      <Shortcut icon="barbell-outline" title="Train" onPress={() => router.push('/(tabs)/workouts')}/>
      <Shortcut icon="checkmark-circle-outline" title="Habits" onPress={() => router.push('/(tabs)/habits')}/>
      <Shortcut icon="bar-chart-outline" title="Progress" onPress={() => router.push('/(tabs)/progress')}/>
    </View>

    {homeStatus === 'loading' && <HomeCardsSkeleton showUpNext={selectedDay === today}/>}
    {homeStatus === 'ready' && <>
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
        <View style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', ...candyStyle(p) }}><Ionicons name={selectedWorkout ? 'checkmark' : 'play'} size={15} color={p.candyInk}/></View>
        <View style={{ marginTop: 'auto' }}>
          <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{selectedWorkout?.name ?? routine?.name ?? 'Workout'}</Text>
          <Text numberOfLines={2} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{selectedWorkout ? `Done${selectedWorkout.duration_min ? ` · ${selectedWorkout.duration_min} min` : ''}` : routine ? `${plannedRoutine ? 'Planned · ' : ''}${routineExerciseCount} exercise${routineExerciseCount === 1 ? '' : 's'}` : dayPlan?.kind === 'rest' ? 'Rest day' : 'Create your first routine'}</Text>
        </View>
      </VCard>
      <VCard tone="soft2" raised onPress={() => setFoodOpen(true)} accessibilityLabel={`Add food to ${mealTitle[nextMeal]}`} style={{ flex: 1, minHeight: 132, padding: 14, gap: 3, overflow: 'hidden', backgroundImage: p.style !== 'lotus' ? undefined : p.light ? 'linear-gradient(160deg, #FBE4FB, #F3E9FE)' : 'linear-gradient(160deg, rgba(226,110,229,0.16), rgba(126,48,225,0.10))' }}>
          {/* Lotus `.ml8`: violet line flower in the bottom-right corner. */}
          {p.light && p.style === 'lotus' && <LotusFlower size={150} color={brand.violet} fillOpacity={0.06} strokeOpacity={0.18} style={{ right: -34, bottom: -26 }}/>}
          <IconBox icon="restaurant-outline" size={36} iconSize={18}/>
          <View style={{ marginTop: 'auto' }}>
            <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{mealTitle[nextMeal]}</Text>
            <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{nextMealKcal ? `${Math.round(nextMealKcal).toLocaleString(locale)} kcal logged` : 'Not logged yet'}</Text>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, ...candyStyle(p) }}><Ionicons name="add" size={14} color={p.candyInk}/><Text style={{ color: p.candyInk, fontFamily: fonts.bold, fontSize: 11.5 }}>Add meal</Text></View>
          </View>
        </VCard>
    </View>
    </>}

    {/* Secondary destinations (the prototype reaches these from its side panel). */}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
      <MoreLink icon="scale-outline" label="Weight" onPress={() => router.push('/weight')}/>
      <MoreLink icon="sparkles-outline" label="Motivation" onPress={() => router.push('/motivation')}/>
    </View>

    <View style={{ height: 8 }}/>
    <BottomSheet visible={foodOpen} title="Add food" onClose={() => setFoodOpen(false)}>{close => <FoodSheet key={`${nextMeal}:${selectedDay}`} entry={null} meal={nextMeal} day={selectedDay} close={close} onSaved={() => changed()}/>}</BottomSheet>
  </Page>;
}

/** Daily progress card placeholder: same card, ring square, big number and three legend rows. */
function HomeProgressSkeleton() {
  return <SkeletonScreen label="Loading today's progress">
    <SkeletonCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><SkeletonText size={15.5} width={118}/><SkeletonBlock width={104} height={28} radius={14}/></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2 }}>
        <SkeletonBlock width={124} height={124} radius={34}/>
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <SkeletonBlock width={64} height={34} radius={10}/>
          {[0, 1, 2].map(row => <View key={row} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><SkeletonBlock width={22} height={22} radius={7}/><SkeletonBlock width="38%" height={10} radius={5}/><View style={{ flex: 1 }}/><SkeletonBlock width="26%" height={10} radius={5}/></View>)}
        </View>
      </View>
    </SkeletonCard>
  </SkeletonScreen>;
}

/** Up-next row and the workout / meal duo placeholders (announced once, by the card above). */
function HomeCardsSkeleton({ showUpNext }: { showUpNext: boolean }) {
  return <SkeletonScreen>
    {showUpNext && <SkeletonCard style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: 22 }}>
      <SkeletonBlock width={42} height={42} radius={14}/>
      <View style={{ flex: 1, gap: 7 }}><SkeletonBlock width="34%" height={9} radius={5}/><SkeletonBlock width="56%" height={13} radius={7}/></View>
      <SkeletonCircle size={46}/>
    </SkeletonCard>}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {[0, 1].map(card => <SkeletonCard key={card} tone="soft" style={{ flex: 1, minHeight: 132, padding: 14, gap: 3 }}>
        <SkeletonBlock width={36} height={36} radius={12}/>
        <View style={{ marginTop: 'auto', gap: 7 }}><SkeletonBlock width="62%" height={13} radius={7}/><SkeletonBlock width="80%" height={9} radius={5}/></View>
      </SkeletonCard>)}
    </View>
  </SkeletonScreen>;
}

/** `.lg8r` — ring legend row. */
function Legend({ icon, color, background, label, value }: { icon: VoltIcon; color: string; background?: string; label: string; value: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: background ?? p.lgi }}><Ionicons name={icon} size={13} color={color}/></View>
    <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{label}</Text>
    <Text numberOfLines={1} style={{ maxWidth: '62%', color: p.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{value}</Text>
  </View>;
}

/**
 * `.sc8b` — Home shortcut: a 54px ringed orb with the label underneath. One layout for
 * Volt and Lotus; every colour (surface, ring, glow, icon) comes from the active palette.
 * The whole column (orb + label, a quarter of the row) is the touch target.
 */
function Shortcut({ icon, title, onPress }: { icon: VoltIcon; title: string; onPress: () => void }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.93} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', gap: 7, paddingTop: 4, paddingBottom: 2, paddingHorizontal: 2 }}>
    <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundImage: `radial-gradient(circle at 35% 30%, ${p.orbFrom}, ${p.orbTo})`, boxShadow: `inset 0px 0px 0px 1.5px ${p.orbRing}, ${p.orbGlow}` }}><Ionicons name={icon} size={22} color={p.orbIcon}/></View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 11.5 }}>{title}</Text>
  </MotionPressable>;
}

/** `.nx` — "Up next" row with a round completion button. */
function UpNextRow({ icon, caption, title, detail, onOpen, action, done = false, emphasis = false, link }: { icon: VoltIcon; caption: string; title: string; detail?: string; onOpen: () => void; action?: { icon: VoltIcon; label: string; onPress: () => void | Promise<void> }; done?: boolean; emphasis?: boolean; link?: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: 22, backgroundColor: p.c8, borderWidth: 1, borderColor: p.light ? 'transparent' : p.c8Line, ...cardShadow(p) }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onOpen} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconBox icon={icon} size={42} radius={14} background={done ? p.lime : emphasis ? p.g1 : p.soft1} color={done ? (p.light ? brand.white : brand.ink) : emphasis ? p.plInk : p.accent} iconSize={18}/>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{caption}</Text>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{title}</Text>
        {!!detail && <Text numberOfLines={1} style={{ color: p.accent, fontFamily: fonts.semibold, fontSize: 11.5 }}>{detail}</Text>}
      </View>
    </Pressable>
    {action ? <MotionPressable pressScale={0.86} accessibilityRole="button" accessibilityLabel={action.label} onPress={() => { void action.onPress(); }} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', ...candyStyle(p) }}><Ionicons name={action.icon} size={20} color={p.candyInk}/></MotionPressable>
      : link ? <Pressable accessibilityRole="button" onPress={onOpen} style={{ paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>{link}</Text></Pressable>
        : <Ionicons name="chevron-forward" size={16} color={p.text}/>}
  </View>;
}

function MoreLink({ icon, label, onPress }: { icon: VoltIcon; label: string; onPress: () => void }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.95} accessibilityRole="button" onPress={onPress} style={{ flex: 1, minWidth: 0, minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: p.c8, borderWidth: 1, borderColor: p.light ? 'transparent' : p.c8Line, borderRadius: 16, paddingHorizontal: 7, ...cardShadow(p) }}><Ionicons name={icon} size={15} color={p.accent}/><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 11.5 }}>{label}</Text></MotionPressable>;
}

/** Small round chevron used by the Home week navigator. */
function WeekArrow({ direction, disabled, onPress }: { direction: -1 | 1; disabled: boolean; onPress: () => void }) {
  const p = usePalette();
  const { language } = useApp();
  const icon = (direction < 0) !== (language === 'ar') ? 'chevron-back' : 'chevron-forward';
  return <MotionPressable pressScale={0.9} accessibilityRole="button" accessibilityLabel={localize(direction < 0 ? 'Previous week' : 'Next week', language)} accessibilityState={{ disabled }} disabled={disabled} hitSlop={8} onPress={onPress}
    style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: p.c8, opacity: disabled ? 0.35 : 1, ...(p.light ? { boxShadow: '0px 2px 8px rgba(11,20,70,0.10)' } : { borderWidth: 1, borderColor: p.borderStrong }) }}>
    <Ionicons name={icon} size={16} color={p.text}/>
  </MotionPressable>;
}
