import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, daysBetween, fromDay, weekStart } from '../../core/date';
import { missionProgress, personalRecords } from '../../core/logic';
import { bestWeekday, comparePeriods, dayBars, habitBreakdown, periodStats } from '../../core/habitStats';
import type { HistoryDay } from '../../core/habitHistory';
import { chartGeometry, dailyWeights, pointsInWindow, windowStart } from '../../core/weightChart';
import { weightGoal } from '../../core/weightPolicy';
import { Exercise, Habit, HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { Page, message } from '../../ui/components';
import { fonts } from '../../ui/theme';
import { useReducedMotion } from '../../ui/motion';
import { HeroWaves, LotusFlower, linearGradient } from '../../ui/LotusArt';
import { localeFor, shortDay } from '../../ui/dates';
import { EmptyAction, KpiRow, ListRow, MiniBar, SectionLink, UnderlineTabs, useEntering, usePalette } from '../../ui/voltKit';

type Period = 'Day' | 'Week' | 'Month' | 'Year';
type WeightRange = 'All' | 'Month' | 'Week';
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const monthEnd = (day: string) => { const date = fromDay(monthStart(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)); };
const shiftMonth = (day: string, offset: number) => { const date = fromDay(monthStart(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + offset, 1, 12)); };
const previousLabel: Record<Period, string> = { Day: 'vs yesterday', Week: 'vs last week', Month: 'vs last month', Year: 'vs last year' };

function periodRange(period: Period, offset: number, today: string): { start: string; end: string } {
  if (period === 'Day') { const day = addDays(today, offset); return { start: day, end: day }; }
  if (period === 'Week') { const start = addDays(weekStart(today), offset * 7); return { start, end: addDays(start, 6) }; }
  if (period === 'Month') { const start = shiftMonth(today, offset); return { start, end: monthEnd(start) }; }
  const year = fromDay(today).getFullYear() + offset;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Progress (prototype "Statistics"): Lotus weight card, then habit statistics from history snapshots. */
export default function Progress() {
  const { profile, language } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [manual, setManual] = useState<MissionCompletion[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [links, setLinks] = useState<WorkoutExercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [period, setPeriod] = useState<Period>('Week');
  const [offset, setOffset] = useState(0);
  const [focusDay, setFocusDay] = useState<string | null>(null);

  const today = dayKey();
  const locale = localeFor(language);
  const { start, end } = periodRange(period, offset, today);
  const until = end < today ? end : today;
  const { start: prevStart, end: prevEnd } = periodRange(period, offset - 1, today);
  const historyFrom = [prevStart, addDays(today, -89)].sort()[0];

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.workoutExercises(), repo.workoutSets(), repo.exercises()])
      .then(([h, c, m, mc, w, wt, l, s, e]) => {
        setHabits(h); setCompletions(c); setMissions(m); setManual(mc); setWorkouts(w);
        setWeights(wt); setLinks(l); setSets(s); setExercises(e);
      }).catch(message);
  }, [revision]);
  useEffect(() => {
    let active = true;
    repo.habitHistory(historyFrom, today, true).then(rows => { if (active) setHistory(rows); }).catch(message);
    return () => { active = false; };
  }, [revision, historyFrom, today]);

  // Snapshot statistics: habits eligible on each day, fully completed measured habits only.
  const stats = periodStats(history, start, until);
  const previous = periodStats(history, prevStart, prevEnd);
  const delta = comparePeriods(stats, previous);
  const periodWorkouts = workouts.filter(workout => workout.day >= start && workout.day <= until);
  const rangeLabel = period === 'Day' ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(start))
    : period === 'Week' ? `${shortDay(locale, start, false)} – ${shortDay(locale, end, false)}`
      : period === 'Month' ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(start)) : start.slice(0, 4);

  const bars = period === 'Day' ? [] : period === 'Year'
    ? Array.from({ length: 12 }, (_, month) => {
      const first = `${start.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`;
      const last = monthEnd(first);
      const s = periodStats(history, first, last < today ? last : today);
      return { key: first, label: new Intl.DateTimeFormat(locale, { month: 'narrow' }).format(fromDay(first)), value: s.percent === null ? null : s.percent / 100, future: first > today, now: first === monthStart(today), due: s.due, done: s.done };
    })
    : dayBars(history, daysBetween(start, end), today).map(bar => ({ key: bar.day, label: period === 'Week' ? new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(bar.day)) : String(fromDay(bar.day).getDate()), value: bar.value, future: bar.future, now: bar.today, due: bar.due, done: bar.done }));

  const byHabit = habitBreakdown(history, start, until);
  const strongest = byHabit[0], weakest = byHabit.length > 1 ? byHabit.at(-1) : undefined;
  const bestDay = bestWeekday(history.filter(row => row.day >= addDays(today, -89)), day => fromDay(day).getDay());
  const bestDayName = bestDay === null ? null : new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + bestDay, 12));
  const habitIds = new Set(habits.map(habit => habit.id));

  const records = personalRecords(exercises, links, sets, workouts);
  const dailyMissions = missions.filter(mission => mission.active && mission.period === 'daily');
  const missionDoneToday = dailyMissions.filter(mission => missionProgress(mission, today, { completions, workouts, weights, manual }).done).length;
  const focus = focusDay ? bars.find(bar => bar.key === focusDay) : undefined;

  return <Page title="Progress" eyebrow="Statistics">
    <WeightCard weights={weights} startWeight={profile?.start_weight ?? null} target={profile?.target_weight ?? null} locale={locale}/>

    <View style={{ marginTop: 6 }}><UnderlineTabs options={['Day', 'Week', 'Month', 'Year'] as const} value={period} onChange={value => { setPeriod(value); setOffset(0); setFocusDay(null); }}/></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => { setOffset(value => value - 1); setFocusDay(null); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={18} color={p.text}/></Pressable>
      <View style={{ alignItems: 'center', gap: 2 }}><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14.5 }}>{rangeLabel}</Text>{offset === 0 && period !== 'Week' && <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 11 }}>{period === 'Day' ? 'Today' : `This ${period.toLowerCase()}`}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next period" accessibilityState={{ disabled: offset >= 0 }} disabled={offset >= 0} onPress={() => { setOffset(value => value + 1); setFocusDay(null); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: offset >= 0 ? 0.25 : 1 }}><Ionicons name="chevron-forward" size={18} color={p.text}/></Pressable>
    </View>

    {/* .pg-hero */}
    <Hero key={`${period}:${offset}`} value={stats.percent === null ? '—' : String(stats.percent)} delta={delta} deltaLabel={previousLabel[period]} caption={stats.percent === null ? 'No habits recorded in this period' : 'of habits completed'} noComparison={stats.percent !== null && delta === null}/>
    <KpiRow items={[{ value: `${stats.done}/${stats.due}`, label: 'Habits done' }, { value: `${stats.consistentDays}/${stats.trackedDays}`, label: 'Consistent days' }, { value: String(periodWorkouts.length), label: periodWorkouts.length === 1 ? 'Workout' : 'Workouts' }]}/>

    {bars.length > 0 && <View style={{ marginTop: 14 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5, marginBottom: 10 }}>{focus ? `${new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(focus.key))} · ${focus.due ? `${focus.done}/${focus.due} habits` : 'no habits recorded'}` : period === 'Year' ? 'Completion by month' : 'Tap a day'}</Text>
      <View style={{ flexDirection: 'row', gap: bars.length > 12 ? 2 : 8, height: 150, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: p.border, borderStyle: 'dashed' }}>
        {bars.map((bar, index) => <Bar key={bar.key} index={index} value={bar.value ?? 0} empty={bar.value === null} future={bar.future} now={bar.now} on={bar.key === focusDay} label={bars.length > 12 ? (index % 5 === 0 ? bar.label : '') : bar.label} onPress={period === 'Year' || bar.future ? undefined : () => setFocusDay(bar.key === focusDay ? null : bar.key)}/>)}
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
      {bestDayName && <Insight icon="calendar-outline" title="Your best day" body={`${bestDayName}s, based on the last 90 days.`}/>}
    </>}

    <SectionLink title="More"/>
    <View style={{ gap: 8 }}>
      <ListRow icon="scale-outline" title="Weight & measurements" subtitle="History, chart and body measurements" onPress={() => router.push('/weight')} right={<Ionicons name="chevron-forward" size={16} color={p.text}/>}/>
      <ListRow icon="flag-outline" title="Missions" subtitle={dailyMissions.length ? `${missionDoneToday}/${dailyMissions.length} daily missions done today` : 'Create a daily or weekly mission'} onPress={() => router.push('/missions')} right={<Ionicons name="chevron-forward" size={16} color={p.text}/>}/>
    </View>

    <SectionLink title="Records"/>
    {records.length ? <View>{records.map(record => <View key={record.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border }}>
      <Ionicons name="ribbon-outline" size={16} color={p.accent}/>
      <Text numberOfLines={1} style={{ flex: 1, color: p.text, fontFamily: fonts.semibold, fontSize: 14 }}>{record.name}</Text>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{record.metric === 'duration' ? `${record.value} sec` : record.metric === 'reps' ? `${record.value} reps` : record.value ? `${record.value} kg${record.reps ? ` × ${record.reps}` : ''}` : `${record.reps} reps`}</Text>
    </View>)}</View> : <EmptyAction text="Complete a workout to set your first records."/>}
  </Page>;
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
    style={{ marginTop: 4, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 14, borderRadius: 26, overflow: 'hidden', backgroundImage: linearGradient(140, p.hero), boxShadow: p.light ? '0px 18px 40px -16px rgba(73,16,139,0.55)' : '0px 0px 0px 1px rgba(226,110,229,0.18), 0px 20px 44px -18px rgba(226,110,229,0.35)' }}>
    <LotusFlower size={210} style={{ right: -46, top: -34 }}/>
    <HeroWaves/>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: -0.19 }}>Weight</Text>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}><Ionicons name="chevron-forward" size={16} color="#FFFFFF"/></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
      {[[latest ? latest.kg.toFixed(1) : '—', 'kg', 'Current'], [target !== null ? target.toFixed(1) : '—', 'kg', 'Goal'], [goal?.progress != null ? String(goal.progress) : '—', '%', 'Progress']].map(([value, unit, label]) => <View key={label} style={{ flex: 1 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 30, letterSpacing: -0.84 }}>{value}{value !== '—' && <Text style={{ fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0 }}>{unit === '%' ? ' %' : ` ${unit}`}</Text>}</Text>
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
            <Circle cx={point.x} cy={point.y} r={isSelected || isLast ? 5 : 3.6} fill={isSelected ? p.pgHl : '#FFFFFF'} stroke={p.heroCard === '#49108B' ? '#49108B' : '#7E30E1'} strokeWidth={2}/>
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
