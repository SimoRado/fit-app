import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, daysBetween, fromDay, weekStart } from '../../core/date';
import { habitRate, missionProgress, personalRecords, weightGoalProgress, weightSummary } from '../../core/logic';
import { Exercise, Habit, HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { Page, message } from '../../ui/components';
import { fonts } from '../../ui/theme';
import { useReducedMotion } from '../../ui/motion';
import { EmptyAction, KpiRow, ListRow, MiniBar, SectionLink, UnderlineTabs, useEntering, usePalette } from '../../ui/voltKit';

type Period = 'Day' | 'Week' | 'Month' | 'Year';
type WeightRange = 'All' | 'Month' | 'Week';
const localeFor = (language: string) => language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const monthEnd = (day: string) => { const date = fromDay(monthStart(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)); };
const shiftMonth = (day: string, offset: number) => { const date = fromDay(monthStart(day)); return dayKey(new Date(date.getFullYear(), date.getMonth() + offset, 1, 12)); };

function periodRange(period: Period, offset: number, today: string): { start: string; end: string } {
  if (period === 'Day') { const day = addDays(today, offset); return { start: day, end: day }; }
  if (period === 'Week') { const start = addDays(weekStart(today), offset * 7); return { start, end: addDays(start, 6) }; }
  if (period === 'Month') { const start = shiftMonth(today, offset); return { start, end: monthEnd(start) }; }
  const year = fromDay(today).getFullYear() + offset;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Volt Progress (prototype "Statistics"): weight hero card, period tabs and minimal charts. */
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
  const [period, setPeriod] = useState<Period>('Week');
  const [offset, setOffset] = useState(0);
  const [focusDay, setFocusDay] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions(), repo.missions(), repo.manual(), repo.trainingWorkouts(), repo.weights(), repo.workoutExercises(), repo.workoutSets(), repo.exercises()])
      .then(([h, c, m, mc, w, wt, l, s, e]) => {
        setHabits(h); setCompletions(c); setMissions(m); setManual(mc); setWorkouts(w);
        setWeights(wt); setLinks(l); setSets(s); setExercises(e);
      }).catch(message);
  }, [revision]);

  const today = dayKey();
  const locale = localeFor(language);
  const { start, end } = periodRange(period, offset, today);
  const until = end < today ? end : today;
  const { start: prevStart, end: prevEnd } = periodRange(period, offset - 1, today);
  // habitRate only counts completions inside [start, end], so scoping the list first keeps
  // the existing calculation identical while avoiding full-history scans on every render.
  const scoped = useMemo(() => completions.filter(c => c.day >= start && c.day <= end), [completions, start, end]);
  const previousScoped = useMemo(() => completions.filter(c => c.day >= prevStart && c.day <= prevEnd), [completions, prevStart, prevEnd]);
  const rate = habitRate(habits, scoped, start, until, true);
  const previousRate = habitRate(habits, previousScoped, prevStart, prevEnd, true);
  const delta = rate.due && previousRate.due ? rate.percent - previousRate.percent : null;
  const days = until >= start ? daysBetween(start, until) : [];
  const consistentDays = days.filter(day => { const r = habitRate(habits, scoped, day, day); return r.due > 0 && r.done === r.due; }).length;
  const periodWorkouts = workouts.filter(workout => workout.day >= start && workout.day <= until);
  const rangeLabel = period === 'Day' ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(start))
    : period === 'Week' ? `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(fromDay(start))} – ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(fromDay(end))}`
      : period === 'Month' ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(start)) : start.slice(0, 4);

  // Bars: days for Week/Month, months for Year.
  const bars = useMemo(() => {
    if (period === 'Year') return Array.from({ length: 12 }, (_, month) => {
      const first = `${start.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`;
      const last = monthEnd(first);
      const future = first > today;
      const r = future ? null : habitRate(habits, scoped, first, last < today ? last : today, true);
      return { key: first, label: new Intl.DateTimeFormat(locale, { month: 'narrow' }).format(fromDay(first)), value: r && r.due ? r.done / r.due : 0, future, now: first === monthStart(today) };
    });
    if (period === 'Day') return [];
    return daysBetween(start, end).map(day => {
      const future = day > today;
      const r = future ? null : habitRate(habits, scoped, day, day);
      return { key: day, label: period === 'Week' ? new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(day)) : String(fromDay(day).getDate()), value: r && r.due ? r.done / r.due : 0, future, now: day === today };
    });
  }, [end, habits, locale, period, scoped, start, today]);

  const byHabit = habits.filter(habit => !habit.archived).map(habit => ({ habit, rate: habitRate([habit], scoped, start, until, true) })).filter(item => item.rate.due > 0).sort((a, b) => b.rate.percent - a.rate.percent);
  const strongest = byHabit[0], weakest = byHabit.length > 1 ? byHabit.at(-1) : undefined;
  const bestWeekday = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => ({ due: 0, done: 0 }));
    const recent = completions.filter(c => c.day >= addDays(today, -89));
    for (const day of daysBetween(addDays(today, -89), today)) { const r = habitRate(habits, recent, day, day); const w = fromDay(day).getDay(); totals[w].due += r.due; totals[w].done += r.done; }
    const ranked = totals.map((t, w) => ({ w, rate: t.due ? t.done / t.due : -1 })).filter(x => x.rate >= 0).sort((a, b) => b.rate - a.rate);
    return ranked[0] ? new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + ranked[0].w, 12)) : null;
  }, [completions, habits, locale, today]);

  const records = personalRecords(exercises, links, sets, workouts);
  const dailyMissions = missions.filter(mission => mission.active && mission.period === 'daily');
  const missionDoneToday = dailyMissions.filter(mission => missionProgress(mission, today, { completions, workouts, weights, manual }).done).length;
  const focus = focusDay ? habitRate(habits, scoped, focusDay, focusDay) : null;

  return <Page title="Progress" eyebrow="Statistics">
    <WeightCard weights={weights} startWeight={profile?.start_weight ?? null} target={profile?.target_weight ?? null} locale={locale}/>

    <UnderlineTabs options={['Day', 'Week', 'Month', 'Year'] as const} value={period} onChange={value => { setPeriod(value); setOffset(0); setFocusDay(null); }}/>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => { setOffset(value => value - 1); setFocusDay(null); }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={18} color={p.text}/></Pressable>
      <View style={{ alignItems: 'center', gap: 2 }}><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14.5 }}>{rangeLabel}</Text>{offset === 0 && <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 11 }}>{period === 'Day' ? 'Today' : `This ${period.toLowerCase()}`}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next period" accessibilityState={{ disabled: offset >= 0 }} disabled={offset >= 0} onPress={() => { setOffset(value => value + 1); setFocusDay(null); }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: offset >= 0 ? 0.25 : 1 }}><Ionicons name="chevron-forward" size={18} color={p.text}/></Pressable>
    </View>

    {/* .pg-hero */}
    <Hero key={`${period}:${offset}`} value={rate.due ? String(rate.percent) : '—'} delta={delta} caption={rate.due ? 'of habits completed' : 'No habits scheduled'}/>
    <KpiRow items={[{ value: `${rate.done}/${rate.due}`, label: 'Habits done' }, { value: `${consistentDays}/${days.length}`, label: 'Consistent days' }, { value: String(periodWorkouts.length), label: 'Workouts' }]}/>

    {bars.length > 0 && <View style={{ marginTop: 14 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5, marginBottom: 10 }}>{focusDay && focus ? `${new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(focusDay))} · ${focus.done}/${focus.due} habits` : period === 'Year' ? 'Completion by month' : 'Tap a day'}</Text>
      <View style={{ flexDirection: 'row', gap: bars.length > 12 ? 2 : 6, height: 150, alignItems: 'flex-end' }}>
        {bars.map((bar, index) => <Bar key={bar.key} index={index} value={bar.value} future={bar.future} now={bar.now} on={bar.key === focusDay} label={bars.length > 12 ? (index % 5 === 0 ? bar.label : '') : bar.label} onPress={period === 'Year' || bar.future ? undefined : () => setFocusDay(bar.key === focusDay ? null : bar.key)}/>)}
      </View>
    </View>}

    {/* .pg-h — by habit */}
    <SectionLink title="By habit" right={<Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{rangeLabel}</Text>}/>
    {byHabit.length ? <View>{byHabit.map((item, index) => <HabitBar key={item.habit.id} index={index} name={item.habit.name} value={item.rate.percent} onPress={() => router.push({ pathname: '/habit-history', params: { id: item.habit.id } })}/>)}</View>
      : <EmptyAction text="No habits were scheduled in this period." onPress={() => router.push('/habit-form')}/>}

    {/* .pg-in — insights */}
    {(strongest || bestWeekday) && <>
      <SectionLink title="Worth knowing"/>
      {strongest && <Insight icon="trophy-outline" title="Strongest habit" body={`${strongest.habit.name}, done ${strongest.rate.percent}% of the time.`}/>}
      {weakest && weakest.rate.percent < 100 && <Insight icon="leaf-outline" title="Needs attention" body={`${weakest.habit.name} at ${weakest.rate.percent}%. A smaller version can help.`}/>}
      {bestWeekday && <Insight icon="calendar-outline" title="Your best day" body={`${bestWeekday}s, based on the last 90 days.`}/>}
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

function Hero({ value, delta, caption }: { value: string; delta: number | null; caption: string }) {
  const p = usePalette();
  const entering = useEntering(0);
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 78, lineHeight: 74, letterSpacing: -4.6, includeFontPadding: false }}>{value}</Text>
      {value !== '—' && <Text style={{ color: p.muted, fontFamily: fonts.displayHeavy, fontSize: 26, marginLeft: 2 }}>%</Text>}
    </View>
    <View style={{ flex: 1, gap: 6, paddingBottom: 6 }}>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 13 }}>{caption}</Text>
      {delta !== null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name={delta >= 0 ? 'arrow-up' : 'arrow-down'} size={13} color={delta >= 0 ? p.pgUp : p.muted}/><Text style={{ color: delta >= 0 ? p.pgUp : p.muted, fontFamily: fonts.bold, fontSize: 12.5 }}>{Math.abs(delta)} pts vs last period</Text></View>}
    </View>
  </Animated.View>;
}

/** `.pg-b` — single animated bar; today is lime, future is a stub. */
function Bar({ value, future, now, on, label, index, onPress }: { value: number; future: boolean; now: boolean; on: boolean; label: string; index: number; onPress?: () => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const height = useSharedValue(reduced ? value : 0);
  useEffect(() => { height.value = reduced ? value : withDelay(Math.min(index, 14) * 30, withTiming(value, { duration: 700, easing: Easing.bezier(0.22, 1, 0.36, 1) })); }, [height, index, reduced, value]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(3, height.value * 100)}%` }));
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label ? `${label}, ${Math.round(value * 100)} percent` : undefined} disabled={!onPress} onPress={onPress} style={{ flex: 1, height: '100%', alignItems: 'center', gap: 8 }}>
    <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
      {future ? <View style={{ width: '70%', maxWidth: 22, height: 4, borderRadius: 2, backgroundColor: p.borderStrong }}/>
        : <Animated.View style={[{ width: '100%', maxWidth: 22, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: now ? p.pgHl : p.pgBar, opacity: now || on ? 1 : 0.35, borderWidth: now && p.pgHl !== p.pgBar && p.bg === '#F5F9FF' ? 1.5 : 0, borderColor: p.pgBar }, style]}/>}
    </View>
    <Text style={{ height: 14, color: now || on ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 11 }}>{label}</Text>
  </Pressable>;
}

function HabitBar({ name, value, index, onPress }: { name: string; value: number; index: number; onPress: () => void }) {
  const p = usePalette();
  const entering = useEntering(index);
  return <Animated.View entering={entering}><Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${value} percent. Open history`} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.border }}>
    <Text numberOfLines={1} style={{ flex: 1.2, color: p.text, fontFamily: fonts.semibold, fontSize: 14 }}>{name}</Text>
    <View style={{ flex: 1 }}><MiniBar value={value / 100} color={p.pgBar} track={p.border}/></View>
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

/** `.wc` — navy weight card with KPIs, range tabs and a tappable line chart. */
function WeightCard({ weights, startWeight, target, locale }: { weights: WeightEntry[]; startWeight: number | null; target: number | null; locale: string }) {
  const p = usePalette();
  const [range, setRange] = useState<WeightRange>('Week');
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const summary = weightSummary(weights);
  const today = dayKey();
  const from = range === 'Week' ? addDays(today, -6) : range === 'Month' ? addDays(today, -29) : '0000-01-01';
  const points = weights.filter(entry => entry.day >= from).sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  const goal = summary.latest && startWeight !== null ? weightGoalProgress(startWeight, summary.latest.kg, target) : null;
  const min = Math.min(...points.map(x => x.kg)), max = Math.max(...points.map(x => x.kg));
  const H = 110, padX = 10;
  const xy = points.map((entry, index) => ({ entry, x: padX + index * (width - 2 * padX) / Math.max(1, points.length - 1), y: 12 + (max - entry.kg) * (H - 24) / Math.max(0.5, max - min) }));
  const d = xy.map((pt, index) => index === 0 ? `M${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : (() => { const prev = xy[index - 1]; const cx = (prev.x + pt.x) / 2; return `C${cx.toFixed(1)} ${prev.y.toFixed(1)} ${cx.toFixed(1)} ${pt.y.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`; })()).join('');
  const selected = xy.find(pt => pt.entry.id === picked) ?? xy.at(-1);
  const tabs: WeightRange[] = ['All', 'Month', 'Week'];
  return <Pressable accessibilityRole="button" accessibilityLabel="Open weight details" onPress={() => router.push('/weight')} style={{ marginTop: 4, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 14, borderRadius: 26, backgroundColor: p.heroCard }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: -0.2 }}>Weight</Text>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}><Ionicons name="chevron-forward" size={16} color="#FFFFFF"/></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
      {[[summary.latest ? summary.latest.kg.toFixed(1) : '—', 'kg', 'Current'], [target !== null ? target.toFixed(1) : '—', 'kg', 'Goal'], [goal !== null ? String(goal) : '—', '%', 'Progress']].map(([value, unit, label]) => <View key={label} style={{ flex: 1 }}>
        <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 28, letterSpacing: -0.8 }}>{value}{value !== '—' && <Text style={{ fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0 }}> {unit}</Text>}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.78)', fontFamily: fonts.semibold, fontSize: 12, marginTop: 6 }}>{label}</Text>
      </View>)}
    </View>
    <View style={{ flexDirection: 'row', gap: 18, marginTop: 18 }}>{tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: tab === range }} onPress={() => { setRange(tab); setPicked(null); }} style={{ paddingVertical: 4, borderBottomWidth: 2, borderBottomColor: tab === range ? '#DFFF1F' : 'transparent' }}><Text style={{ color: tab === range ? '#FFFFFF' : 'rgba(255,255,255,0.6)', fontFamily: fonts.semibold, fontSize: 13 }}>{tab}</Text></Pressable>)}</View>
    <Text style={{ color: 'rgba(255,255,255,0.78)', fontFamily: fonts.medium, fontSize: 12, marginTop: 12 }}>{points.length > 1 && selected ? `${new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(fromDay(selected.entry.day))} · ${selected.entry.kg} kg · tap a point` : points.length === 1 ? 'Add another entry to draw a trend' : 'No weight entries in this range'}</Text>
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ height: H, marginTop: 6 }}>
      {width > 0 && points.length > 1 && <Svg width={width} height={H}>
        {[0.2, 0.5, 0.8].map(f => <Line key={f} x1={0} x2={width} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>)}
        <Path d={d} fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round"/>
        {xy.map((pt, index) => <React.Fragment key={pt.entry.id}>
          <Circle cx={pt.x} cy={pt.y} r={pt === selected ? 5.5 : 4} fill={pt === selected || index === xy.length - 1 ? '#DFFF1F' : '#FFFFFF'} stroke={p.heroCard} strokeWidth={2}/>
          <Circle cx={pt.x} cy={pt.y} r={16} fill="transparent" onPress={() => setPicked(pt.entry.id)}/>
        </React.Fragment>)}
      </Svg>}
    </View>
  </Pressable>;
}
