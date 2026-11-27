import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { TapPressable as Pressable } from '../../ui/MotionPressable';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, daysBetween, fromDay } from '../../core/date';
import { personalRecords } from '../../core/logic';
import { bestWeekday, comparePeriods, dayBars, habitBreakdown, periodStats } from '../../core/habitStats';
import type { HistoryDay } from '../../core/habitHistory';
import { chartGeometry, dailyWeights, pointsInWindow, windowStart } from '../../core/weightChart';
import { weightGoal } from '../../core/weightPolicy';
import { Exercise, Habit, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useSubscription } from '../../state/subscriptions';
import { canViewProgressPeriod, guardProgressPeriod, progressFloor, progressRange, visibleProgressRange, type ProgressPeriod } from '../../core/progressAccess';
import { useScreenRevision } from '../../state/useScreenRevision';
import { useLoadState } from '../../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonRow, SkeletonScreen } from '../../ui/Skeleton';
import { Page, message } from '../../ui/components';
import { fonts } from '../../ui/theme';
import { useReducedMotion } from '../../ui/motion';
import { HeroWaves, LotusFlower, linearGradient } from '../../ui/LotusArt';
import { localeFor, shortDay } from '../../ui/dates';
import { EmptyAction, KpiRow, ListRow, MiniBar, SectionLink, UnderlineTabs, useEntering, usePalette } from '../../ui/voltKit';

type Period = ProgressPeriod;
type WeightRange = 'All' | 'Month' | 'Week';
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const monthEnd = (day: string) => { const date = fromDay(monthStart(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)); };
const previousLabel: Record<Period, string> = { Day: 'vs yesterday', Week: 'vs last week', Month: 'vs last month', Year: 'vs last year' };

const periodRange = progressRange;

/** Progress (prototype "Statistics"): Lotus weight card, then habit statistics from history snapshots. */
export default function Progress() {
  const { profile, language } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [links, setLinks] = useState<WorkoutExercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [requestedPeriod, setPeriod] = useState<Period>('Week');
  const [requestedOffset, setOffset] = useState(0);
  const subscription = useSubscription();
  const isPro = subscription.isPremium;
  // While the entitlement is still being checked, nothing historical is shown and nothing is
  // locked: Pro users are not mistaken for Free, Free users see no Pro data.
  const checking = !subscription.ready && !subscription.error;
  const [focusDay, setFocusDay] = useState<string | null>(null);
  // Records and habit-history reads each finish once before content replaces the skeleton.
  const dataLoad = useLoadState();
  const historyLoad = useLoadState('progress');
  const { attempt: dataAttempt, succeed: dataReady, fail: dataFailed } = dataLoad;
  const { attempt: historyAttempt, succeed: historyReady, fail: historyFailed } = historyLoad;

  const today = dayKey();
  const locale = localeFor(language);
  // Every render resolves the selection through the access rules, so a stale or expired selection
  // can never show locked data, even for one frame.
  const { period, offset } = guardProgressPeriod(requestedPeriod, requestedOffset, today, isPro);
  useEffect(() => {
    if (checking) return;
    if (period !== requestedPeriod || offset !== requestedOffset) { setPeriod(period); setOffset(offset); setFocusDay(null); }
  }, [checking, period, offset, requestedPeriod, requestedOffset]);
  const floor = progressFloor(today, isPro);
  const fullRange = periodRange(period, offset, today);
  const { start, end } = visibleProgressRange(fullRange, today, isPro);
  const until = end < today ? end : today;
  const fullPrevious = periodRange(period, offset - 1, today);
  // Free comparisons only use this month's dates; a previous period entirely before it has none.
  const { start: prevStart, end: prevEnd } = floor && fullPrevious.end < floor ? { start: fullPrevious.end, end: addDays(fullPrevious.end, -1) } : visibleProgressRange(fullPrevious, today, isPro);
  /** Locked period requests open the existing paywall and leave the selection where it is. */
  const openPaywall = () => { if (!checking) router.push('/paywall'); };
  const choosePeriod = (value: Period) => {
    if (!canViewProgressPeriod(value, 0, today, isPro)) { openPaywall(); return; }
    setPeriod(value); setOffset(0); setFocusDay(null);
  };
  const previousPeriod = () => {
    if (!canViewProgressPeriod(period, offset - 1, today, isPro)) { openPaywall(); return; }
    setOffset(offset - 1); setFocusDay(null);
  };
  const historyFrom = [prevStart, addDays(today, -89)].sort()[0];

  useEffect(() => {
    let active = true;
    // Records only need exercises that were logged in a workout, not the whole catalog.
    Promise.all([repo.habits(), repo.trainingWorkouts(), repo.weights(), repo.workoutExercises(), repo.workoutSets(), repo.workoutExerciseList()])
      .then(([h, w, wt, l, s, e]) => {
        if (!active) return;
        setHabits(h); setWorkouts(w);
        setWeights(wt); setLinks(l); setSets(s); setExercises(e);
        dataReady();
      }).catch(error => { if (active && !dataFailed()) message(error); });
    return () => { active = false; };
  }, [revision, dataAttempt, dataReady, dataFailed]);
  useEffect(() => {
    let active = true;
    repo.habitHistory(historyFrom, today, true).then(rows => { if (active) { setHistory(rows); historyReady(); } }).catch(error => { if (active && !historyFailed()) message(error); });
    return () => { active = false; };
  }, [revision, historyFrom, today, historyAttempt, historyReady, historyFailed]);
  // Recomputed only when workout data changes — not on period, chart or weight-range taps.
  const records = useMemo(() => personalRecords(exercises, links, sets, workouts), [exercises, links, sets, workouts]);

  // Free plans only ever count rows from this month (weeks crossing the month, comparisons, insights).
  const visibleHistory = floor ? history.filter(row => row.day >= floor) : history;
  // Snapshot statistics: habits eligible on each day, fully completed measured habits only.
  const stats = periodStats(visibleHistory, start, until);
  const previous = periodStats(visibleHistory, prevStart, prevEnd);
  const delta = comparePeriods(stats, previous);
  const periodWorkouts = workouts.filter(workout => workout.day >= start && workout.day <= until);
  const rangeLabel = period === 'Day' ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(start))
    : period === 'Week' ? `${shortDay(locale, fullRange.start, false)} – ${shortDay(locale, end, false)}`
      : period === 'Month' ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(start)) : start.slice(0, 4);

  const bars = period === 'Day' ? [] : period === 'Year'
    ? Array.from({ length: 12 }, (_, month) => {
      const first = `${start.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`;
      const last = monthEnd(first);
      const s = periodStats(visibleHistory, first, last < today ? last : today);
      return { key: first, label: new Intl.DateTimeFormat(locale, { month: 'narrow' }).format(fromDay(first)), value: s.percent === null ? null : s.percent / 100, future: first > today, now: first === monthStart(today), due: s.due, done: s.done };
    })
    : dayBars(visibleHistory, daysBetween(fullRange.start, end), today).map(bar => ({ key: bar.day, label: period === 'Week' ? new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(bar.day)) : String(fromDay(bar.day).getDate()), value: bar.value, future: bar.future, now: bar.today, due: bar.due, done: bar.done }));

  const byHabit = habitBreakdown(visibleHistory, start, until);
  const strongest = byHabit[0], weakest = byHabit.length > 1 ? byHabit.at(-1) : undefined;
  const bestDay = bestWeekday(visibleHistory.filter(row => row.day >= addDays(today, -89)), day => fromDay(day).getDay());
  const bestDayName = bestDay === null ? null : new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + bestDay, 12));
  const habitIds = new Set(habits.map(habit => habit.id));

  const focus = focusDay ? bars.find(bar => bar.key === focusDay) : undefined;

  // Waiting on the entitlement only matters if the shown range reaches before this month.
  const waitingForPlan = checking && fullRange.start < (floor ?? fullRange.start);
  const status = dataLoad.status === 'error' || historyLoad.status === 'error' ? 'error' : dataLoad.status === 'ready' && historyLoad.status === 'ready' && !waitingForPlan ? 'ready' : 'loading';
  if (status !== 'ready') return <Page title="Progress" eyebrow="Statistics">
    {status === 'error' ? <LoadError text="Could not load your progress." onRetry={() => { if (dataLoad.status === 'error') dataLoad.retry(); if (historyLoad.status === 'error') historyLoad.retry(); }}/> : <ProgressSkeleton/>}
  </Page>;

  return <Page title="Progress" eyebrow="Statistics">
    <WeightCard weights={weights} startWeight={profile?.start_weight ?? null} target={profile?.target_weight ?? null} locale={locale}/>

    <View style={{ marginTop: 6 }}><UnderlineTabs options={['Day', 'Week', 'Month', 'Year'] as const} value={period} icons={isPro ? undefined : { Year: 'lock-closed' }} hints={isPro ? undefined : { Year: 'Cubyfit Pro' }} onChange={choosePeriod}/></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous period" accessibilityHint={canViewProgressPeriod(period, offset - 1, today, isPro) ? undefined : 'Cubyfit Pro'} onPress={previousPeriod} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={18} color={p.text}/></Pressable>
      <View style={{ alignItems: 'center', gap: 2 }}><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14.5 }}>{rangeLabel}</Text>{offset === 0 && period !== 'Week' && <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 11 }}>{period === 'Day' ? 'Today' : `This ${period.toLowerCase()}`}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next period" accessibilityState={{ disabled: offset >= 0 }} disabled={offset >= 0} onPress={() => { setOffset(Math.min(0, offset + 1)); setFocusDay(null); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: offset >= 0 ? 0.25 : 1 }}><Ionicons name="chevron-forward" size={18} color={p.text}/></Pressable>
    </View>

    {/* .pg-hero */}
    <Hero key={`${period}:${offset}`} value={stats.percent === null ? '—' : String(stats.percent)} delta={delta} deltaLabel={previousLabel[period]} caption={stats.percent === null ? 'No habits recorded in this period' : 'of habits completed'} noComparison={stats.percent !== null && delta === null}/>
    <KpiRow items={[{ value: `${stats.done}/${stats.due}`, label: 'Habits done' }, { value: `${stats.consistentDays}/${stats.trackedDays}`, label: 'Consistent days' }, { value: String(periodWorkouts.length), label: periodWorkouts.length === 1 ? 'Workout' : 'Workouts' }]}/>

    {bars.length > 0 && <View style={{ marginTop: 14 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5, marginBottom: 10 }}>{focus ? `${new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(focus.key))} · ${focus.due ? `${focus.done}/${focus.due} habits` : 'no habits recorded'}` : period === 'Year' ? 'Completion by month' : 'Tap a day'}</Text>
      <View style={{ flexDirection: 'row', gap: bars.length > 12 ? 2 : 8, height: 150, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: p.border, borderStyle: 'dashed' }}>
        {bars.map((bar, index) => <Bar key={bar.key} index={index} value={bar.value ?? 0} empty={bar.value === null} future={bar.future || (!!floor && bar.key < floor)} now={bar.now} on={bar.key === focusDay} label={bars.length > 12 ? (index % 5 === 0 ? bar.label : '') : bar.label} onPress={period === 'Year' || bar.future || (!!floor && bar.key < floor) ? undefined : () => setFocusDay(bar.key === focusDay ? null : bar.key)}/>)}
      </View>
    </View>}

    {/* .pg-h — by habit */}
    <SectionLink title="By habit" right={<Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{byHabit.length ? 'tap for detail' : rangeLabel}</Text>}/>
    {byHabit.length ? <View>{byHabit.map((item, index) => <HabitBar key={item.id} index={index} name={item.name} value={item.percent} onPress={habitIds.has(item.id) ? () => router.push({ pathname: '/habit-history', params: { id: item.id } }) : undefined}/>)}</View>
      : <EmptyAction text="No habits were recorded as due in this period." onPress={() => router.push('/habit-form')}/>}

    {/* .pg-in — insights */}
    {(strongest || bestDayName) && <>
      <SectionLink title="Worth knowing"/>
      {strongest && <Insight icon="trophy-outline" title="Strongest habit" body={`${strongest.name}, done ${strongest.percent}% of the time.`}/>}
      {weakest && weakest.percent < 100 && <Insight icon="leaf-outline" title="Needs attention" body={`${weakest.name} at ${weakest.percent}%. A smaller version can help.`}/>}
      {bestDayName && <Insight icon="calendar-outline" title="Your best day" body={`${bestDayName}s, based on ${floor ? 'this month' : 'the last 90 days'}.`}/>}
    </>}

    <SectionLink title="More"/>
    <View style={{ gap: 8 }}>
      <ListRow icon="scale-outline" title="Weight & measurements" subtitle="History, chart and body measurements" onPress={() => router.push('/weight')} right={<Ionicons name="chevron-forward" size={16} color={p.text}/>}/>
    </View>

    <SectionLink title="Records"/>
    {records.length ? <View>{records.map(record => <View key={record.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border }}>
      <Ionicons name="ribbon-outline" size={16} color={p.accent}/>
      <Text numberOfLines={1} style={{ flex: 1, color: p.text, fontFamily: fonts.semibold, fontSize: 14 }}>{record.name}</Text>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{record.metric === 'duration' ? `${record.value} sec` : record.metric === 'reps' ? `${record.value} reps` : record.value ? `${record.value} kg${record.reps ? ` × ${record.reps}` : ''}` : `${record.reps} reps`}</Text>
    </View>)}</View> : <EmptyAction text="Complete a workout to set your first records."/>}
  </Page>;
}

/** Placeholder for the weight card (with chart area), period tabs, hero number, KPIs, bars and rows. */
function ProgressSkeleton() {
  return <SkeletonScreen label="Loading progress">
    <SkeletonCard tone="soft" style={{ marginTop: 4, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 14, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><SkeletonBlock width={78} height={17} radius={8}/><SkeletonBlock width={32} height={32} radius={16}/></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{[0, 1, 2].map(index => <View key={index} style={{ flex: 1, gap: 8 }}><SkeletonBlock width="70%" height={26} radius={8}/><SkeletonBlock width="50%" height={10} radius={5}/></View>)}</View>
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>{[0, 1, 2].map(index => <SkeletonBlock key={index} width={40} height={12} radius={6}/>)}</View>
      <SkeletonBlock height={118} radius={14}/>
    </SkeletonCard>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 }}>{[0, 1, 2, 3].map(index => <SkeletonBlock key={index} width={48} height={12} radius={6}/>)}</View>
    <View style={{ alignItems: 'center' }}><SkeletonBlock width={150} height={13} radius={7}/></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 6 }}><SkeletonBlock width={110} height={70} radius={14}/><View style={{ flex: 1, gap: 8, paddingBottom: 6 }}><SkeletonBlock width="70%" height={11} radius={6}/><SkeletonBlock width="45%" height={11} radius={6}/></View></View>
    <View style={{ flexDirection: 'row', gap: 8 }}>{[0, 1, 2].map(index => <SkeletonBlock key={index} width={undefined} height={64} radius={18} style={{ flex: 1 }}/>)}</View>
    <View style={{ flexDirection: 'row', gap: 8, height: 150, alignItems: 'flex-end', marginTop: 14 }}>{[0.45, 0.7, 0.35, 0.8, 0.55, 0.25, 0.6].map((value, index) => <SkeletonBlock key={index} width={undefined} height={`${value * 100}%`} radius={7} style={{ flex: 1, maxWidth: 30 }}/>)}</View>
    <SkeletonBlock width={90} height={15} radius={8} style={{ marginTop: 8 }}/>
    <View style={{ gap: 8 }}>{[0, 1].map(index => <SkeletonRow key={index}/>)}</View>
  </SkeletonScreen>;
}

function Hero({ value, delta, deltaLabel, caption, noComparison }: { value: string; delta: number | null; deltaLabel: string; caption: string; noComparison: boolean }) {
  const p = usePalette();
  const entering = useEntering(0);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 78, lineHeight: 74, letterSpacing: -4.6, includeFontPadding: false }}>{value}</Text>
      {value !== '—' && <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 26, marginLeft: 2 }}>%</Text>}
    </View>
    <View style={{ flex: 1, gap: 6, paddingBottom: 6 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 13 }}>{caption}</Text>
      {delta !== null ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name={delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'remove'} size={13} color={delta >= 0 ? p.pgUp : p.muted}/><Text style={{ color: delta >= 0 ? p.pgUp : p.muted, fontFamily: fonts.bold, fontSize: 12.5 }}>{Math.abs(delta)} pts {deltaLabel}</Text></View>
        : noComparison ? <Text style={{ color: p.subtle, fontFamily: fonts.semibold, fontSize: 12 }}>No earlier records to compare</Text> : null}
    </View>
  </Animated.View>;
}

/** `.pg-b` — single animated bar; today is orchid, past days lavender, future a stub. */
function Bar({ value, empty, future, now, on, label, index, onPress }: { value: number; empty: boolean; future: boolean; now: boolean; on: boolean; label: string; index: number; onPress?: () => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const height = useSharedValue(reduced ? value : 0);
  useEffect(() => { height.value = reduced ? value : withDelay(Math.min(index, 14) * 30, withTiming(value, { duration: 700, easing: Easing.bezier(0.22, 1, 0.36, 1) })); }, [height, index, reduced, value]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(3, height.value * 100)}%` }));
  const highlight = now || on;
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label ? `${label}, ${empty ? 'no habits recorded' : `${Math.round(value * 100)} percent`}` : undefined} disabled={!onPress} onPress={onPress} style={{ flex: 1, height: '100%', alignItems: 'center', gap: 8 }}>
    <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
      {future || empty ? <View style={{ width: '70%', maxWidth: 22, height: 4, borderRadius: 2, backgroundColor: p.borderStrong }}/>
        : <Animated.View style={[{ width: '100%', maxWidth: 30, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: highlight ? p.pgHl : p.pgBar, opacity: highlight ? 1 : 0.32, borderWidth: highlight && p.light ? 1.5 : 0, borderColor: p.pgBar }, style]}/>}
    </View>
    <Text style={{ height: 14, color: highlight ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 11 }}>{label}</Text>
  </Pressable>;
}

function HabitBar({ name, value, index, onPress }: { name: string; value: number; index: number; onPress?: () => void }) {
  const p = usePalette();
  const entering = useEntering(index);
  return <Animated.View entering={entering}><Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${name}, ${value} percent${onPress ? '. Open history' : ''}`} disabled={!onPress} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.border }}>
    <Text numberOfLines={1} style={{ flex: 1.2, color: p.text, fontFamily: fonts.semibold, fontSize: 14 }}>{name}</Text>
    <View style={{ flex: 1 }}><MiniBar value={value / 100} color={p.pgBar} track={p.soft1} height={7}/></View>
    <Text style={{ width: 44, textAlign: 'right', color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{value}%</Text>
  </Pressable></Animated.View>;
}

function Insight({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border }}>
    <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.pgSoft }}><Ionicons name={icon} size={15} color={p.accent}/></View>
    <View style={{ flex: 1 }}><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{title}</Text><Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 }}>{body}</Text></View>
  </View>;
}

const WC_W = 300, WC_H = 118;
/**
 * Lotus `.wc` — hero-gradient weight card with the line flower, soft waves,
 * Current / Goal / Progress, All / Month / Week and a tappable line chart.
 * Points sit at their real dates; tapping the card opens Weight details.
 */
function WeightCard({ weights, startWeight, target, locale }: { weights: WeightEntry[]; startWeight: number | null; target: number | null; locale: string }) {
  const p = usePalette();
  const [range, setRange] = useState<WeightRange>('Week');
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const today = dayKey();
  const daily = dailyWeights(weights);
  const latest = daily.at(-1);
  const from = range === 'Week' ? windowStart(today, 7) : range === 'Month' ? windowStart(today, 30) : daily[0]?.day ?? today;
  const points = pointsInWindow(daily, from, today);
  const goal = latest && startWeight !== null ? weightGoal(startWeight, latest.kg, target) : null;
  const s = width / WC_W, height = WC_H * s;
  const geometry = width ? chartGeometry(points, from, today, { width, height, left: 14 * s, right: 14 * s, top: 16 * s, bottom: 16 * s }, 3) : null;
  const selected = geometry?.points.find(point => point.id === picked) ?? geometry?.points.at(-1);
  const xLabels = range === 'Week'
    ? daysBetween(from, today).map(day => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)).replace(/\.$/, '').toUpperCase())
    : [from, ...(points.length > 2 ? [daysBetween(from, today)[Math.floor(daysBetween(from, today).length / 2)]] : []), today].map(day => shortDay(locale, day, false).toUpperCase());
  const readout = selected && picked ? `${shortDay(locale, selected.day)} · ${selected.kg.toFixed(1)} kg` : points.length > 1 ? `${range === 'Week' ? 'Last 7 days' : range === 'Month' ? 'Last 30 days' : 'All weigh-ins'} · tap a point` : points.length === 1 ? 'One weigh-in in this range · add more to see a trend' : 'No weigh-ins in this range';
  const tabs: WeightRange[] = ['All', 'Month', 'Week'];
  return <Pressable accessibilityRole="button" accessibilityLabel="Open weight details" onPress={() => router.push('/weight')}
    style={{ marginTop: 4, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 14, borderRadius: 26, overflow: 'hidden', backgroundImage: linearGradient(140, p.hero), boxShadow: p.style === 'volt' ? undefined : p.light ? '0px 18px 40px -16px rgba(73,16,139,0.55)' : '0px 0px 0px 1px rgba(226,110,229,0.18), 0px 20px 44px -18px rgba(226,110,229,0.35)' }}>
    {p.style === 'lotus' && <><LotusFlower size={210} style={{ right: -46, top: -34 }}/><HeroWaves/></>}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: -0.19 }}>Weight</Text>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}><Ionicons name="chevron-forward" size={16} color="#FFFFFF"/></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
      {[[latest ? latest.kg.toFixed(1) : '—', 'kg', 'Current'], [target !== null ? target.toFixed(1) : '—', 'kg', 'Goal'], [goal?.progress != null ? String(goal.progress) : '—', '%', 'Progress']].map(([value, unit, label]) => <View key={label} style={{ flex: 1 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 30, letterSpacing: -0.84 }}>{value}{value !== '—' && <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0 }}>{unit === '%' ? ' %' : ` ${unit}`}</Text>}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.78)', fontFamily: fonts.semibold, fontSize: 12, marginTop: 6 }}>{label}</Text>
      </View>)}
    </View>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 18, marginTop: 20 }}>{tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: tab === range }} hitSlop={8} onPress={() => { setRange(tab); setPicked(null); }} style={{ paddingVertical: 4, borderBottomWidth: 1.6, borderBottomColor: tab === range ? p.pgHl : 'transparent' }}><Text style={{ color: tab === range ? '#FFFFFF' : 'rgba(255,255,255,0.6)', fontFamily: fonts.semibold, fontSize: 13 }}>{tab}</Text></Pressable>)}</View>
    <Text style={{ color: 'rgba(255,255,255,0.78)', fontFamily: fonts.medium, fontSize: 12, marginTop: 12 }}>{readout}</Text>
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ height: height || WC_H, marginTop: 6 }}>
      {geometry && <Svg width={width} height={height}>
        {[0.25, 0.5, 0.75].map(f => <Path key={f} d={`M0 ${(height * f).toFixed(1)}H${width}`} stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>)}
        {geometry.points.length > 1 && <Path d={geometry.line} fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>}
        {geometry.points.map((point, index) => {
          const isSelected = point === selected, isLast = index === geometry.points.length - 1;
          return <React.Fragment key={point.id}>
            <Circle cx={point.x} cy={point.y} r={isSelected || isLast ? 5 : 3.6} fill={isSelected ? p.pgHl : '#FFFFFF'} stroke={p.heroCard} strokeWidth={2}/>
            <Circle cx={point.x} cy={point.y} r={16} fill="transparent" onPress={() => setPicked(point.id)}/>
          </React.Fragment>;
        })}
      </Svg>}
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 }}>
      {xLabels.map((label, index) => <Text key={`${label}${index}`} style={{ color: 'rgba(255,255,255,0.6)', fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>)}
    </View>
  </Pressable>;
}
