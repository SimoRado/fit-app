import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay } from '../../core/date';
import { GymDayPlan, OVERRIDE_RETENTION_DAYS, gymOverridesPreferenceKey, gymPlanHistoryPreferenceKey, gymSchedulePreferenceKey, parseGymOverrides, parseGymPlanHistory, parseGymSchedule, planDayChange, planForWeekday, recordGymPlanChange, resolveDayPlan, serializeGymOverrides, serializeGymSchedule, setGymDayPlan, setGymOverride, type GymDayChoice, type GymDayOverride, type GymPlanEra } from '../../core/gymSchedule';
import { decodeRoutineTargets, routineSetsPreferenceKey, type TargetSet } from '../../core/routineDraft';
import { workoutStats } from '../../core/logic';
import { calendarAccess } from '../../core/calendarAccess';
import { monthKey } from '../../core/habitHistory';
import { workoutCalendarData, workoutDayStatus, type WorkoutDay } from '../../core/workoutCalendar';
import { Exercise, Routine, RoutineExercise, Workout } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { useLoadState } from '../../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonScreen } from '../../ui/Skeleton';
import { Button, Page, message, confirm } from '../../ui/components';
import { fonts, brand } from '../../ui/theme';
import { WorkoutInProgressCard } from '../../ui/WorkoutInProgressCard';
import { BottomSheet } from '../../ui/BottomSheet';
import { MotionPressable } from '../../ui/MotionPressable';
import { CircleButton, EmptyAction, IconBox, MenuItem, SectionLink, StatTrio, isLight, useEntering, usePalette } from '../../ui/voltKit';
import type { OpenWorkout } from '../../data/db';
import { useSubscription } from '../../state/subscriptions';
import { CalendarButtons, MonthCalendarSheet, YearCalendarSheet, useCalendarMonth } from '../../ui/ProgressCalendar';
import { dayLabel, type CalendarCell, type MiniCell } from '../../ui/HistoryCalendar';

/** Workout day → shared calendar tile: done = full colour, rest = light + moon, planned = dumbbell, otherwise neutral. */
function workoutCell(status: WorkoutDay, today: string, locale: string): CalendarCell {
  const date = dayLabel(status.day, locale);
  switch (status.kind) {
    case 'done': return { shade: 3, label: `${date}, ${status.workouts === 1 ? 'workout completed' : `${status.workouts} workouts completed`}` };
    case 'rest': return { shade: 1, icon: 'moon', label: `${date}, rest day` };
    case 'planned': return { shade: null, icon: 'barbell', label: `${date}, training planned` };
    case 'missed': return { shade: null, label: `${date}, no workout recorded` };
    case 'pending': return { shade: null, label: `${date}, nothing planned yet` };
    default: return { shade: null, tone: status.day > today ? 'future' : 'empty', label: `${date}, nothing planned` };
  }
}
const workoutMini = (status: WorkoutDay): MiniCell => status.kind === 'done' ? { shade: 3 } : status.kind === 'rest' ? { shade: 1 } : { shade: null, dot: status.kind === 'planned' };

/** Placeholder for compact routines, actions and history. */
function TrainSkeleton() {
  return <SkeletonScreen label="Loading your training">
    <SkeletonBlock width={112} height={15} radius={8} style={{ marginTop: 6 }}/>
    <View style={{ gap: 8 }}>{[0, 1, 2].map(index => <SkeletonCard key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 64 }}>
      <SkeletonBlock width={40} height={40} radius={13}/>
      <View style={{ flex: 1, gap: 7 }}><SkeletonBlock width="48%" height={13} radius={6}/><SkeletonBlock width="70%" height={10} radius={5}/></View>
      <SkeletonBlock width={34} height={34} radius={17}/><SkeletonBlock width={44} height={44} radius={22}/>
    </SkeletonCard>)}</View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><SkeletonBlock width={undefined} height={50} radius={25} style={{ flex: 1 }}/><SkeletonBlock width={undefined} height={50} radius={25} style={{ flex: 1 }}/></View>
    <SkeletonBlock width={80} height={15} radius={8} style={{ marginTop: 6 }}/>
    <View style={{ flexDirection: 'row', gap: 8 }}>{[0, 1, 2].map(index => <SkeletonBlock key={index} width={undefined} height={64} radius={18} style={{ flex: 1 }}/>)}</View>
  </SkeletonScreen>;
}

/** Train: compact routine list, weekly plan, history and workout actions. */
export default function Workouts() {
  const { profile, language, changed } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [training, setTraining] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [links, setLinks] = useState<RoutineExercise[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [rest, setRest] = useState<string[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<GymDayPlan[]>([]);
  const [overrides, setOverrides] = useState<Map<string, GymDayOverride>>(new Map());
  const [planHistory, setPlanHistory] = useState<GymPlanEra[]>([]);
  const [monthOpen, setMonthOpen] = useState(false);
  // Set when a day tapped in the month sheet opened the planning sheet: the month sheet comes back after planning.
  const reopenMonth = useRef(false);
  const [preferences, setPreferences] = useState<Map<string, string>>(new Map());
  const [planningDay, setPlanningDay] = useState<string | null>(null);
  const [calendarDay, setCalendarDay] = useState(dayKey());
  const [yearOpen, setYearOpen] = useState(false);
  const [year, setYear] = useState(() => Number(dayKey().slice(0, 4)));
  const subscription = useSubscription();
  const [openWorkout, setOpenWorkout] = useState<OpenWorkout | null>(null);
  const [routineMenu, setRoutineMenu] = useState<Routine | null>(null);
  const [routineDetails, setRoutineDetails] = useState<Routine | null>(null);
  // Loading, "no routines yet" and a failed read are different states: empty states wait for the first read.
  const load = useLoadState('workouts');
  const { attempt, succeed, fail } = load;

  useEffect(() => {
    if (!profile?.id) return;
    let current = true;
    // Exercise names: only the exercises used by routines, not the whole catalog.
    Promise.all([repo.workouts(), repo.trainingWorkouts(), repo.routines(), repo.routineExercises(), repo.routineExerciseList(), repo.restDays(), repo.preferences(), repo.openWorkoutSession(profile.id)])
      .then(([allWorkouts, completedWorkouts, savedRoutines, routineLinks, routineExercises, days, preferences, open]) => {
        if (!current) return;
        setWorkouts(allWorkouts); setTraining(completedWorkouts); setRoutines(savedRoutines); setLinks(routineLinks); setExercises(routineExercises); setRest(days.map(x => x.day)); setWeeklyPlan(parseGymSchedule(preferences.find(item => item.key === gymSchedulePreferenceKey)?.value)); setOverrides(parseGymOverrides(preferences.find(item => item.key === gymOverridesPreferenceKey)?.value)); setPlanHistory(parseGymPlanHistory(preferences.find(item => item.key === gymPlanHistoryPreferenceKey)?.value)); setPreferences(new Map(preferences.map(item => [item.key, item.value]))); setOpenWorkout(open);
        succeed();
      }).catch(error => { if (current && !fail()) message(error); });
    return () => { current = false; };
  }, [revision, profile?.id, attempt, succeed, fail]);

  const loaded = load.status === 'ready';
  const stats = workoutStats(training);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const recentWorkouts = workouts.filter(workout => workout.id !== openWorkout?.id);
  const last30 = training.filter(workout => workout.day >= addDays(today, -29));
  const avgMinutes = last30.filter(workout => workout.duration_min).length ? Math.round(last30.reduce((sum, workout) => sum + (workout.duration_min ?? 0), 0) / last30.filter(workout => workout.duration_min).length) : null;
  const exerciseName = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise])), [exercises]);
  const startRoutine = (routine: Routine) => router.push({ pathname: '/workout-form', params: { routine: routine.id } });
  const routineIds = useMemo(() => new Set(routines.map(routine => routine.id)), [routines]);
  const linksOf = (routineId: string) => links.filter(link => link.routine_id === routineId);
  /** Planned sets for a routine, aligned with its exercise order (empty when none were planned). */
  const plannedSets = (routineId: string) => decodeRoutineTargets(preferences.get(routineSetsPreferenceKey(routineId)), linksOf(routineId).map(link => link.exercise_id));
  const setCountOf = (routineId: string) => plannedSets(routineId).reduce((sum, sets) => sum + Math.max(1, sets.length), 0);
  const todayPlan = resolveDayPlan(weeklyPlan, today, rest, routineIds, overrides);
  const todayRoutine = todayPlan?.kind === 'routine' ? routines.find(routine => routine.id === todayPlan.routineId) : undefined;
  const trainedToday = training.some(workout => workout.day === today);
  // Calendar: everything is computed in memory from the rows above (no per-day queries).
  // Free: this month and planning ahead; Pro (verified entitlement): earlier months and the year.
  // A separate key for the memoised calendar values (the screen's `today` is also handed to callbacks below).
  const calendarToday = dayKey();
  const access = useMemo(() => calendarAccess(subscription.isPremium, calendarToday, 12), [subscription.isPremium, calendarToday]);
  const calendar = useCalendarMonth(access);
  const calendarData = useMemo(() => workoutCalendarData(training, rest, weeklyPlan, routineIds, overrides, planHistory), [training, rest, weeklyPlan, routineIds, overrides, planHistory]);
  const statusOf = useCallback((day: string) => workoutDayStatus(day, calendarToday, calendarData), [calendarData, calendarToday]);
  const cellFor = useMemo(() => loaded ? (day: string) => workoutCell(statusOf(day), calendarToday, locale) : null, [loaded, statusOf, calendarToday, locale]);
  const firstDay = useMemo(() => [...training.map(workout => workout.day), ...rest].reduce<string | null>((min, day) => !min || day < min ? day : min, null), [training, rest]);
  const firstMonth = firstDay ? monthKey(firstDay) : access.current;
  const selectedStatus = statusOf(calendarDay);
  const selectedWorkouts = training.filter(workout => workout.day === calendarDay);
  const selectedRoutine = selectedStatus.plan?.kind === 'routine' ? routines.find(routine => routine.id === (selectedStatus.plan as { routineId: string }).routineId) : undefined;
  /** Today or later opens the scheduling sheet for exactly that date; earlier days only show their record in the month sheet. */
  const pickDay = (day: string, close: (after?: () => void) => void) => { setCalendarDay(day); if (day >= today) close(() => { reopenMonth.current = true; setPlanningDay(day); }); };
  const openMonth = () => { calendar.focus(calendarDay); setMonthOpen(true); };
  const openYear = () => { setYear(Number(calendar.month.slice(0, 4))); setYearOpen(true); };
  const closePlanning = () => { setPlanningDay(null); if (reopenMonth.current) { reopenMonth.current = false; setMonthOpen(true); } };
  function deleteRoutineConfirmed(routine: Routine, close: (after?: () => void) => void) {
    confirm(`Delete “${routine.name}”?`, async () => {
      if (!profile) return;
      await repo.deleteRoutine(profile.id, routine.id);
      close(); changed();
    }, 'The routine and its planned sets are removed and it is cleared from your weekly plan. Workouts you already completed stay in your history.', 'Delete routine');
  }
  /**
   * Every schedule change goes through here: state updates first (the calendar and today's card
   * change at once), then one SQLite transaction on the existing synced tables. A failed write
   * restores the previous state.
   */
  async function saveSchedule(change: { plan?: GymDayPlan[]; overrides?: Map<string, GymDayOverride>; rest?: { day: string; on: boolean } }) {
    if (!profile) return;
    const before = { weeklyPlan, overrides, planHistory, rest };
    const preferencesToSave: Record<string, string> = {};
    if (change.plan) {
      const history = recordGymPlanChange(planHistory, weeklyPlan, today);
      setWeeklyPlan(change.plan); setPlanHistory(history);
      preferencesToSave[gymSchedulePreferenceKey] = serializeGymSchedule(change.plan);
      preferencesToSave[gymPlanHistoryPreferenceKey] = JSON.stringify(history);
    }
    if (change.overrides) { setOverrides(change.overrides); preferencesToSave[gymOverridesPreferenceKey] = serializeGymOverrides(change.overrides, addDays(today, -OVERRIDE_RETENTION_DAYS)); }
    if (change.rest) { const { day, on } = change.rest; setRest(days => on ? (days.includes(day) ? days : [...days, day]) : days.filter(item => item !== day)); }
    try { await repo.saveTrainingSchedule(profile.id, { preferences: preferencesToSave, rest: change.rest }); changed(); }
    catch (error) { setWeeklyPlan(before.weeklyPlan); setOverrides(before.overrides); setPlanHistory(before.planHistory); setRest(before.rest); message(error); }
  }
  /** "This day only": changes exactly one date, never the weekly plan. */
  function saveDay(day: string, choice: GymDayChoice) {
    const next = planDayChange(weeklyPlan, day, choice);
    return saveSchedule({ overrides: setGymOverride(overrides, day, next.override), rest: { day, on: next.rest } });
  }
  /** "Every <weekday>": changes the weekly plan from today on (earlier days keep the plan they had); the tapped date follows it. */
  function saveWeekly(day: string, next: GymDayPlan | null) {
    const plan = setGymDayPlan(weeklyPlan, fromDay(day).getDay(), next);
    return saveSchedule({ plan, overrides: setGymOverride(overrides, day, null), rest: { day, on: false } });
  }

  return <Page title="Train" eyebrow={loaded ? `${stats.week} session${stats.week === 1 ? '' : 's'} this week` : ''} headerAction={<><CalendarButtons onYear={openYear} onMonth={openMonth} yearLocked={!access.canOpenYear}/><CircleButton icon="add" tone="accent" label="Create routine" onPress={() => router.push('/routine-form')}/></>}>
    {load.status === 'error' && <LoadError text="Could not load your training data." onRetry={load.retry}/>}
    {load.status === 'loading' && <TrainSkeleton/>}
    {loaded && <>
    {/* Today's plan (`.nx` style): start the scheduled routine in one tap. */}
    {!openWorkout && (todayRoutine ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: 22, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
      <IconBox icon={trainedToday ? 'checkmark' : 'calendar-outline'} size={42} radius={14} background={trainedToday ? p.lime : p.soft1} color={trainedToday ? brand.ink : p.accent}/>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${todayRoutine.name}`} onPress={() => router.push({ pathname: '/routine-form', params: { id: todayRoutine.id } })} style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{trainedToday ? 'Planned today · done' : 'Planned today'}</Text>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{todayRoutine.name}</Text>
        <Text style={{ color: p.accent, fontFamily: fonts.semibold, fontSize: 11.5 }}>{linksOf(todayRoutine.id).length} exercises · {setCountOf(todayRoutine.id)} sets</Text>
      </Pressable>
      <MotionPressable pressScale={0.86} accessibilityRole="button" accessibilityLabel={`Start ${todayRoutine.name}`} onPress={() => startRoutine(todayRoutine)} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: p.g1 }}><Ionicons name="play" size={20} color={p.plInk}/></MotionPressable>
    </View> : todayPlan?.kind === 'rest' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 22, backgroundColor: p.soft2 }}>
      <IconBox icon="moon-outline" size={42} radius={14}/>
      <View style={{ flex: 1 }}><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>Rest day</Text><Text style={{ color: p.muted, fontSize: 12 }}>{todayPlan.oneOff ? 'Marked for today only.' : 'Part of your weekly plan.'} Recovery is training too.</Text></View>
    </View> : null)}

    {openWorkout && <WorkoutInProgressCard workout={openWorkout}/>}

    {/* Compact routine list */}
    <SectionLink title="My routines" action="New" onPress={() => router.push('/routine-form')}/>
    {routines.length ? <View style={{ gap: 8, marginTop: 4 }}>
      {routines.map((routine, index) => {
        const exerciseCount = linksOf(routine.id).length;
        const setCount = setCountOf(routine.id);
        return <RoutineRow key={routine.id} index={index} title={routine.name} meta={`${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'} · ${setCount} ${setCount === 1 ? 'set' : 'sets'}`}
          onDetails={() => setRoutineDetails(routine)} onMore={() => setRoutineMenu(routine)} onStart={() => startRoutine(routine)}/>;
      })}</View>
      : <EmptyAction text="Create your first routine to start training faster." onPress={() => router.push('/routine-form')}/>}

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <View style={{ flex: 1 }}><Button title="Empty workout" onPress={() => router.push('/workout-form')}/></View>
      {/* Rest today, or undo it whether it came from this date or from the weekly plan (then only today is changed). */}
      <View style={{ flex: 1 }}><Button title={todayPlan?.kind === 'rest' ? 'Undo rest day' : 'Rest day'} kind="ghost" onPress={() => todayPlan?.kind === 'rest' ? (todayPlan.oneOff ? saveSchedule({ rest: { day: today, on: false } }) : saveDay(today, { kind: 'none' })) : saveDay(today, { kind: 'rest' })}/></View>
    </View>

    {/* History (`.wa-rec`) */}
    <SectionLink title="History"/>
    <StatTrio items={[{ label: 'Sessions', value: String(last30.length) }, { label: 'This month', value: String(stats.month) }, { label: 'Avg time', value: avgMinutes === null ? '—' : `${avgMinutes}m` }]}/>
    <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>Recent sessions · {stats.total} total</Text>
    {recentWorkouts.length ? <View>{recentWorkouts.slice(0, 20).map((workout, index) => <HistoryRow key={workout.id} index={index} workout={workout} locale={locale}
      onOpen={() => router.push({ pathname: '/workout-form', params: { id: workout.id } })}
      onDelete={() => confirm('Delete workout?', async () => { await repo.remove('workouts', workout.id); changed(); })}/>)}</View>
      : <EmptyAction text={workouts.length > 0 && openWorkout ? 'Your current workout is shown above.' : 'Finished workouts will appear here.'}/>}
    </>}

    <BottomSheet visible={!!routineMenu} title={routineMenu?.name ?? 'Routine'} onClose={() => setRoutineMenu(null)}>{close => routineMenu && <View style={{ gap: 6 }}>
      <MenuItem icon="list-outline" label="View routine details" onPress={() => close(() => setRoutineDetails(routineMenu))}/>
      <MenuItem icon="play" label="Start workout" onPress={() => close(() => startRoutine(routineMenu))}/>
      <MenuItem icon="create-outline" label="Edit routine" onPress={() => close(() => router.push({ pathname: '/routine-form', params: { id: routineMenu.id } }))}/>
      <MenuItem icon="trash-outline" label="Delete routine" danger onPress={() => deleteRoutineConfirmed(routineMenu, close)}/>
    </View>}</BottomSheet>

    <BottomSheet visible={!!routineDetails} title={routineDetails?.name ?? 'Routine details'} onClose={() => setRoutineDetails(null)}>{close => routineDetails && <View style={{ gap: 10 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>{linksOf(routineDetails.id).length} exercises · {setCountOf(routineDetails.id)} sets</Text>
      {linksOf(routineDetails.id).length ? <View style={{ gap: 8 }}>{linksOf(routineDetails.id).map((link, index) => <ExerciseRow key={link.id} index={index} number={index + 1} name={exerciseName.get(link.exercise_id)?.name ?? 'Exercise'} metric={exerciseName.get(link.exercise_id)?.metric} sets={plannedSets(routineDetails.id)[index]}/>)}</View>
        : <EmptyAction text="This routine has no exercises yet. Add some." onPress={() => close(() => router.push({ pathname: '/routine-form', params: { id: routineDetails.id } }))}/>}
      <Button title="Edit routine" kind="ghost" onPress={() => close(() => router.push({ pathname: '/routine-form', params: { id: routineDetails.id } }))}/>
    </View>}</BottomSheet>

    <MonthCalendarSheet visible={monthOpen} onClose={() => setMonthOpen(false)} title="Training calendar" state={calendar} access={access} firstMonth={firstMonth} today={today} selected={calendarDay} locale={locale}
      cellFor={cellFor} legend="workout" onSelect={pickDay} checking={!subscription.ready && !subscription.error} onUpgrade={() => router.push('/paywall')}
      details={close => loaded && <WorkoutDayCard day={calendarDay} today={today} locale={locale} status={selectedStatus} workouts={selectedWorkouts} routineName={selectedRoutine?.name}
        onPlan={() => close(() => { reopenMonth.current = true; setPlanningDay(calendarDay); })} onOpen={workout => close(() => router.push({ pathname: '/workout-form', params: { id: workout.id } }))}/>}/>
    <YearCalendarSheet visible={yearOpen} onClose={() => setYearOpen(false)} access={access} year={year} onYear={setYear} firstYear={Number(firstMonth.slice(0, 4))} today={today} locale={locale} legend="workout"
      miniFor={loaded ? day => workoutMini(statusOf(day)) : null}
      summaryFor={month => { let done = 0; for (const [day, count] of calendarData.completed) if (day.startsWith(month)) done += count; return done ? `${done} workout${done === 1 ? '' : 's'}` : 'no workouts'; }}
      onMonth={month => { calendar.go(month); setMonthOpen(true); }} checking={!subscription.ready && !subscription.error} onUpgrade={() => router.push('/paywall')}/>

    <BottomSheet visible={!!planningDay} title={planningDay ? `Plan ${new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(planningDay))}` : 'Plan day'} onClose={closePlanning}>{close => planningDay && <PlanDay
      day={planningDay} today={today} locale={locale} routines={routines} detailOf={routine => `${linksOf(routine.id).length} exercises · ${setCountOf(routine.id)} sets`}
      weeklyPlan={weeklyPlan} resolved={resolveDayPlan(weeklyPlan, planningDay, rest, routineIds, overrides)}
      hasException={rest.includes(planningDay) || overrides.has(planningDay)}
      onDay={async choice => { await saveDay(planningDay, choice); close(); }}
      onWeekly={async next => { await saveWeekly(planningDay, next); close(); }}
      onResetDay={async () => { await saveSchedule({ overrides: setGymOverride(overrides, planningDay, null), rest: { day: planningDay, on: false } }); close(); }}
      onCreateRoutine={() => { reopenMonth.current = false; close(() => router.push('/routine-form')); }}
      onStart={routine => { reopenMonth.current = false; close(() => startRoutine(routine)); }}/>}</BottomSheet>
  </Page>;
}

/**
 * Planning sheet for one date (today or later). "This day only" changes just that date; "Every
 * <weekday>" changes the weekly plan from today on and says so before a recurring entry is removed
 * or replaced. Earlier days always keep the status they had.
 */
function PlanDay({ day, today, locale, routines, detailOf, weeklyPlan, resolved, hasException, onDay, onWeekly, onResetDay, onCreateRoutine, onStart }: {
  day: string; today: string; locale: string; routines: Routine[]; detailOf: (routine: Routine) => string; weeklyPlan: GymDayPlan[];
  resolved: ReturnType<typeof resolveDayPlan>; hasException: boolean;
  onDay: (choice: GymDayChoice) => Promise<void>; onWeekly: (next: GymDayPlan | null) => Promise<void>; onResetDay: () => Promise<void>;
  onCreateRoutine: () => void; onStart: (routine: Routine) => void;
}) {
  const p = usePalette();
  const [scope, setScope] = useState<'day' | 'week'>('day');
  const weekday = fromDay(day).getDay();
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(fromDay(day));
  const plural = `${weekdayName}s`;
  const dateName = day === today ? 'today' : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(fromDay(day));
  const weekly = planForWeekday(weeklyPlan, weekday);
  const weeklyRoutine = weekly?.kind === 'routine' ? routines.find(routine => routine.id === weekly.routineId) : undefined;
  const weeklyName = weekly?.kind === 'rest' ? 'Rest' : weeklyRoutine?.name ?? null;
  const resolvedRoutine = resolved?.kind === 'routine' ? routines.find(routine => routine.id === resolved.routineId) : undefined;
  const status = resolved?.kind === 'rest' ? `Rest day · ${resolved.oneOff ? 'this date only' : `every ${weekdayName}`}`
    : resolvedRoutine ? `${resolvedRoutine.name} · ${resolved?.kind === 'routine' && resolved.oneOff ? 'this date only' : `every ${weekdayName}`}` : 'Nothing planned';
  /** Replacing or removing a recurring entry is confirmed first, with its effect spelled out. */
  const weeklyChange = (next: GymDayPlan | null, label: string) => {
    if (!weekly) return onWeekly(next);
    return new Promise<void>(resolve => confirm(next ? `${label} every ${weekdayName}?` : `Remove the plan for every ${weekdayName}?`,
      async () => { await onWeekly(next); resolve(); },
      `${plural} from today on will ${next ? `use ${label}` : 'have no plan'} instead of ${weeklyName ?? 'the current plan'}. Earlier ${plural} keep their record, and dates you changed individually keep their own plan.`,
      next ? 'Change every week' : 'Remove weekly plan'));
  };
  return <View style={{ gap: 6 }}>
    <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>{status}</Text>
    <ScopeSwitch scope={scope} onChange={setScope} weekdayName={weekdayName}/>
    <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 11.5, marginBottom: 2 }}>{scope === 'day' ? `Changes ${dateName} only. Your weekly plan stays as it is.` : `Repeats every ${weekdayName} from today on. Earlier days keep their record.`}</Text>
    {scope === 'day' ? <>
      {routines.map(routine => <PlanOption key={routine.id} icon="barbell-outline" label={routine.name} detail={detailOf(routine)} selected={resolved?.kind === 'routine' && resolved.routineId === routine.id} onPress={() => onDay({ kind: 'routine', routineId: routine.id })}/>)}
      <PlanOption icon="moon-outline" label={`Rest on ${dateName}`} selected={resolved?.kind === 'rest'} onPress={() => onDay({ kind: 'rest' })}/>
      <PlanOption icon="remove-circle-outline" label={`No plan on ${dateName}`} detail={weeklyName ? `Skips ${weeklyName} for this date only` : undefined} selected={!resolved} onPress={() => onDay({ kind: 'none' })}/>
      {hasException && <PlanOption icon="refresh" label="Use the weekly plan" detail={weeklyName ? `${weeklyName} · every ${weekdayName}` : `No weekly plan for ${plural}`} selected={false} onPress={onResetDay}/>}
    </> : <>
      {routines.map(routine => <PlanOption key={routine.id} icon="barbell-outline" label={routine.name} detail={detailOf(routine)} selected={weekly?.kind === 'routine' && weekly.routineId === routine.id}
        onPress={() => weekly?.kind === 'routine' && weekly.routineId === routine.id ? undefined : weeklyChange({ weekday, kind: 'routine', routineId: routine.id }, routine.name)}/>)}
      <PlanOption icon="moon-outline" label={`Rest every ${weekdayName}`} selected={weekly?.kind === 'rest'} onPress={() => weekly?.kind === 'rest' ? undefined : weeklyChange({ weekday, kind: 'rest' }, 'Rest')}/>
      <PlanOption icon="remove-circle-outline" label="No weekly plan" detail={weekly ? `Stops repeating ${weeklyName ?? 'this plan'} on ${plural}` : undefined} selected={!weekly || (weekly.kind === 'routine' && !weeklyRoutine)} onPress={() => weekly ? weeklyChange(null, '') : undefined}/>
    </>}
    {!routines.length && <EmptyAction text="Create a routine to plan it on this day." onPress={onCreateRoutine}/>}
    {resolvedRoutine && day === today && <View style={{ marginTop: 8 }}><Button title={`Start ${resolvedRoutine.name}`} onPress={() => onStart(resolvedRoutine)}/></View>}
  </View>;
}

/** This day only | Every <weekday> — same segmented look as the History tabs. */
function ScopeSwitch({ scope, onChange, weekdayName }: { scope: 'day' | 'week'; onChange: (scope: 'day' | 'week') => void; weekdayName: string }) {
  const p = usePalette();
  const light = isLight(p);
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: light ? p.soft1 : p.card2 }}>
    {(['day', 'week'] as const).map(item => {
      const on = scope === item;
      return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(item)}
        style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: on ? (light ? p.c8 : p.lime) : 'transparent', ...(on && light ? { boxShadow: '0px 2px 8px rgba(11,20,70,0.12)' } : {}) }}>
        <Text style={{ color: on ? (light ? p.text : brand.ink) : p.muted, fontFamily: fonts.bold, fontSize: 12.5 }}>{item === 'day' ? 'This day only' : `Every ${weekdayName}`}</Text>
      </Pressable>;
    })}
  </View>;
}

/** Selected calendar day: what happened (past) or what is planned (today and later). */
function WorkoutDayCard({ day, today, locale, status, workouts, routineName, onPlan, onOpen }: { day: string; today: string; locale: string; status: WorkoutDay; workouts: Workout[]; routineName?: string; onPlan: () => void; onOpen: (workout: Workout) => void }) {
  const p = usePalette();
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day));
  const restText = status.plan?.kind === 'rest' ? (status.plan.oneOff ? 'Rest day · this date only' : 'Rest day · weekly plan') : null;
  const summary = status.kind === 'done' ? `${workouts.length} workout${workouts.length === 1 ? '' : 's'} completed${restText ? ' · on a rest day' : ''}`
    : status.kind === 'rest' ? restText!
    : status.kind === 'planned' ? `Planned · ${routineName ?? 'Routine'}`
    : status.kind === 'missed' ? 'No workout recorded'
    : status.kind === 'pending' ? 'Nothing planned yet' : 'Nothing planned';
  return <View style={{ gap: 8, padding: 12, borderRadius: 20, backgroundColor: isLight(p) ? p.c8 : p.card2, borderWidth: 1, borderColor: p.c8Line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconBox icon={status.kind === 'done' ? 'checkmark' : status.kind === 'rest' ? 'moon-outline' : status.kind === 'planned' ? 'barbell-outline' : 'calendar-outline'} size={38} radius={13} background={status.kind === 'done' ? p.lime : p.soft1} color={status.kind === 'done' ? brand.ink : p.accent}/>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14.5 }}>{day === today ? `Today · ${date}` : date}</Text>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{summary}</Text>
      </View>
      {day >= today && <Pressable accessibilityRole="button" accessibilityLabel={`Plan ${date}`} hitSlop={6} onPress={onPlan} style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: isLight(p) ? p.soft1 : p.card }}>
        <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12 }}>Plan</Text>
      </Pressable>}
    </View>
    {workouts.map(workout => <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`Open ${workout.name || 'workout'}`} onPress={() => onOpen(workout)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{workout.name || 'Workout'}</Text>
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{workout.duration_min ? `${workout.duration_min} min` : 'Completed'}</Text>
      <Ionicons name="chevron-forward" size={14} color={p.muted}/>
    </Pressable>)}
  </View>;
}

/** Compact routine row with details on the left and distinct menu/start actions on the right. */
function RoutineRow({ index, title, meta, onDetails, onMore, onStart }: { index: number; title: string; meta: string; onDetails: () => void; onMore: () => void; onStart: () => void }) {
  const p = usePalette();
  const entering = useEntering(index);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, minHeight: 64, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
    <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel={`${title} details`} onPress={onDetails} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 1 }}>
      <IconBox icon="barbell-outline" size={40} radius={13} background={p.soft1} color={p.accent}/>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>{meta}</Text>
      </View>
    </MotionPressable>
    <MotionPressable pressScale={0.88} accessibilityRole="button" accessibilityLabel={`${title} options`} onPress={onMore} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: p.soft1, ...(!p.light ? { borderWidth: 1, borderColor: p.c8Line } : {}) }}><Ionicons name="ellipsis-horizontal" size={18} color={p.muted}/></MotionPressable>
    <CircleButton icon="play" label={`Start ${title}`} onPress={onStart} tone="accent" size={44}/>
  </Animated.View>;
}

function ExerciseRow({ number, name, metric, index, sets }: { number: number; name: string; metric?: Exercise['metric']; index: number; sets?: TargetSet[] }) {
  const p = usePalette();
  const entering = useEntering(index);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p.soft1 }}><Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{number}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{name}</Text><Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{plannedSummary(sets, metric)}</Text></View>
    <IconBox icon={metric === 'duration' ? 'timer-outline' : 'barbell-outline'} size={30} radius={10} background="transparent" color={isLight(p) ? p.line3 : p.muted}/>
  </Animated.View>;
}

/** `.wa-h` — history row with a date block. */
function HistoryRow({ workout, locale, onOpen, onDelete, index }: { workout: Workout; locale: string; onOpen: () => void; onDelete: () => void; index: number }) {
  const p = usePalette();
  const entering = useEntering(index);
  const date = fromDay(workout.day);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.border }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${workout.name || 'workout'}`} onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 44, alignItems: 'center' }}><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, lineHeight: 20 }}>{date.getDate()}</Text><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 9.5, textTransform: 'uppercase', marginTop: 3 }}>{new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)}</Text></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15.5 }}>{workout.name || 'Workout'}</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{workout.completed ? 'Completed' : 'Draft'}{workout.duration_min ? ` · ${workout.duration_min} min` : ''}</Text>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Delete workout" hitSlop={6} onPress={onDelete} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isLight(p) ? p.soft1 : p.card2 }}><Ionicons name="trash-outline" size={16} color={p.muted}/></Pressable>
  </Animated.View>;
}

/** "3 sets · 10 reps · 60 kg" style summary of a routine exercise's planned sets. */
function plannedSummary(sets: TargetSet[] | undefined, metric: Exercise['metric'] = 'weight_reps') {
  const count = Math.max(1, sets?.length ?? 0);
  const first = sets?.[0];
  const parts = [`${count} set${count === 1 ? '' : 's'}`];
  if (metric === 'duration') { if (first?.durationSec) parts.push(`${first.durationSec} s`); }
  else {
    if (first?.reps) parts.push(`${first.reps} reps`);
    if (metric === 'weight_reps' && first?.weightKg !== null && first?.weightKg !== undefined) parts.push(`${first.weightKg} kg`);
  }
  return parts.join(' · ');
}

/** Selectable plan option row with a check when selected. */
function PlanOption({ icon, label, detail, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; detail?: string; selected: boolean; onPress: () => void | Promise<void> }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.98} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { void Promise.resolve(onPress()).catch(message); }}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: p.c8, borderWidth: 1.5, borderColor: selected ? p.text : p.c8Line }}>
    <IconBox icon={icon} size={36} background={isLight(p) ? p.soft1 : p.card2}/>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14.5 }}>{label}</Text>{!!detail && <Text numberOfLines={1} style={{ color: p.muted, fontSize: 12 }}>{detail}</Text>}</View>
    {selected && <Ionicons name="checkmark" size={20} color={p.text}/>}
  </MotionPressable>;
}
