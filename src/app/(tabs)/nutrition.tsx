import React, { useEffect, useMemo, useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Link } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../ui/LocalizedText';
import { Page, message } from '../../ui/components';
import { BottomSheet } from '../../ui/BottomSheet';
import { fonts, brand } from '../../ui/theme';
import { dayKey, fromDay } from '../../core/date';
import { calorieHeadline, meals, sumNutrients, weekStats, type CalorieDisplay, type Meal } from '../../core/nutrition';
import { useReducedMotion } from '../../ui/motion';
import { clampDay, moveSelectionByWeek, startOfWeek, weekDays, weekNavigation } from '../../core/weekCalendar';
import { WeekCalendar } from '../../ui/WeekCalendar';
import { calorieDisplay, customFoods, firstNutritionTarget, foodEntries, nutritionTarget, type CustomFood, type FoodEntry, type NutritionTarget } from '../../data/nutrition';
import { prepareFoodCatalog } from '../../data/foodCatalog';
import { syncAutoTargets } from '../../data/nutritionPlan';
import { useApp } from '../../state/app';
import { useVoltTheme } from '../../ui/VoltThemeProvider';
import { useScreenRevision } from '../../state/useScreenRevision';
import { useLoadState } from '../../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonRow, SkeletonScreen } from '../../ui/Skeleton';
import { FoodSheet, TargetSetup, TargetsSheet } from '../../ui/NutritionSheets';
import { AnimatedCollapse, AnimatedWeekBar } from '../../ui/MotionBlocks';
import { MotionPressable } from '../../ui/MotionPressable';
import { CircleButton, CountUp, EmptyAction, Horseshoe, KpiRow, ListRow, MiniBar, PlusDot, RowValue, SectionLink, StatTrio, VCard, usePalette, type VoltIcon } from '../../ui/voltKit';

const num = (value: number) => Math.round(value).toLocaleString();
const dateLabel = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(day));

const mealIcon: Record<Meal, VoltIcon> = { breakfast: 'sunny-outline', lunch: 'restaurant-outline', dinner: 'moon-outline', snacks: 'sparkles-outline' };
const mealName = (meal: Meal) => meal[0].toUpperCase() + meal.slice(1);

/** `.row8` meal row; expands to the logged entries so each stays editable. */
function MealRow({ category, rows, kcal, open, onToggle, onAdd, onOpen, index }: { category: Meal; rows: FoodEntry[]; kcal: number; open: boolean; onToggle: () => void; onAdd: () => void; onOpen: (entry: FoodEntry) => void; index: number }) {
  const p = usePalette();
  const summary = rows.length ? rows.slice(0, 2).map(entry => entry.name).join(', ') + (rows.length > 2 ? ` +${rows.length - 2}` : '') : 'Nothing logged';
  return <View>
    <ListRow index={index} icon={mealIcon[category]} title={mealName(category)} subtitle={summary} muted={!rows.length}
      accessibilityLabel={rows.length ? `${mealName(category)}, ${num(kcal)} kcal` : `Add food to ${category}`}
      onPress={rows.length ? onToggle : onAdd}
      right={rows.length ? <RowValue value={num(kcal)} unit="kcal"/> : <PlusDot/>}/>
    {rows.length > 0 && <AnimatedCollapse open={open}>
      <View style={{ paddingTop: 6, paddingLeft: 14, gap: 2 }}>
        {rows.map(entry => <MotionPressable key={entry.id} accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => onOpen(entry)} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 6, borderBottomWidth: 1, borderBottomColor: p.border }}>
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{entry.name}</Text><Text numberOfLines={1} style={{ color: p.muted, fontSize: 11.5 }}>{entry.grams ? `${num(entry.grams)} g · ` : ''}P {num(entry.protein)} · C {num(entry.carbs)} · F {num(entry.fat)}</Text></View>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{num(entry.kcal)}</Text>
        </MotionPressable>)}
        <View style={{ paddingTop: 8 }}><EmptyAction text={`Add food to ${category}`} onPress={onAdd}/></View>
      </View>
    </AnimatedCollapse>}
  </View>;
}

/** Placeholder for the Today view: week strip, calorie card (horseshoe + macros) and meal rows. */
function NutritionSkeleton() {
  const { width } = useWindowDimensions();
  const gauge = Math.min(240, width - 70);
  return <SkeletonScreen label="Loading nutrition" style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>{Array.from({ length: 7 }, (_, index) => <SkeletonBlock key={index} width={undefined} height={66} radius={22} style={{ flex: 1 }}/>)}</View>
    <SkeletonCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><SkeletonBlock width={76} height={13} radius={7}/><SkeletonBlock width={96} height={11} radius={6}/></View>
      <View style={{ alignItems: 'center', marginTop: 6 }}><View style={{ width: gauge, height: gauge * 0.62, alignItems: 'center', justifyContent: 'flex-end' }}>
        <SkeletonBlock width={gauge} height={gauge * 0.62} radius={gauge / 2} style={{ position: 'absolute', top: 0, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}/>
      </View></View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>{[0, 1, 2].map(index => <SkeletonBlock key={index} width={undefined} height={70} radius={20} style={{ flex: 1 }}/>)}</View>
    </SkeletonCard>
    <SkeletonBlock width={128} height={15} radius={8} style={{ marginTop: 4 }}/>
    <View style={{ gap: 8 }}>{[0, 1, 2, 3].map(index => <SkeletonRow key={index}/>)}</View>
  </SkeletonScreen>;
}

const MOTION_MS = 700;
const countKcal = (value: number) => num(value);

/** `.mchip` — macro tile with a slim progress bar. Shows the true amount; the bar caps at 100%. */
function MacroChip({ label, value, target, background, bar, track }: { label: string; value: number; target: number | null; background: string; bar: string; track: string }) {
  const p = usePalette();
  return <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 7, paddingTop: 11, paddingBottom: 10, paddingHorizontal: 8, borderRadius: 20, backgroundColor: background }}>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 13.5 }}><CountUp value={value} duration={MOTION_MS} format={next => `${num(next)}g`}/><Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{target ? ` / ${num(target)}g` : ''}</Text></Text>
    <View style={{ alignSelf: 'stretch' }}><MiniBar value={target ? value / target : 0} color={bar} track={track} height={5} duration={MOTION_MS}/></View>
    <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12 }}>{label}</Text>
  </View>;
}

export default function NutritionScreen() {
  const { width } = useWindowDimensions();
  const { changed } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const { palette } = useVoltTheme();
  const reduced = useReducedMotion();
  const today = dayKey();
  // Nutrition allows past days (backdated logging) but never future days or weeks.
  const [selected, setSelected] = useState(today);
  const rules = useMemo(() => ({ maxDay: today, startsOn: 1 as const }), [today]);
  const weekStartDay = startOfWeek(selected, 1);
  const week = useMemo(() => weekDays(weekStartDay, 1), [weekStartDay]);
  const [view, setView] = useState<'today' | 'week'>('today');
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  // Week whose entries/targets are in state; until a newly selected week loads, the dashboard keeps its last values.
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [targets, setTargets] = useState<(NutritionTarget | null)[]>([]);
  const [firstTarget, setFirstTarget] = useState<NutritionTarget | null>(null);
  const [display, setDisplay] = useState<CalorieDisplay>('remaining');
  const [foods, setFoods] = useState<CustomFood[]>([]);
  // First load only: later reloads (other week, revision bump) keep the current dashboard.
  const load = useLoadState('nutrition');
  const { attempt, succeed, fail } = load;
  const ready = load.status === 'ready';
  const [sheet, setSheet] = useState<'food' | 'targets' | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [expanded, setExpanded] = useState<Partial<Record<Meal, boolean>>>({});
  useEffect(() => {
    let active = true;
    const days = weekDays(weekStartDay, 1);
    // In auto mode today's target follows the profile estimate (goal, weight, age…); custom targets are untouched.
    void syncAutoTargets(today).catch(() => false).then(() => Promise.all([foodEntries(days[0], days[6]), Promise.all(days.map(nutritionTarget)), customFoods(), firstNutritionTarget(), calorieDisplay()]))
      .then(([nextEntries, nextTargets, nextFoods, nextFirst, nextDisplay]) => { if (active) { setEntries(nextEntries); setTargets(nextTargets); setLoadedWeek(weekStartDay); setFoods(nextFoods); setFirstTarget(nextFirst); setDisplay(nextDisplay); succeed(); } })
      .catch(error => { if (active && !fail()) message(error); });
    return () => { active = false; };
  }, [revision, weekStartDay, today, attempt, succeed, fail]);
  useEffect(() => { void prepareFoodCatalog(); }, []);
  // The dashboard follows `shownDay`, which catches up with `selected` once that
  // day's week is loaded. Entries/targets in state always belong to `loadedWeek`,
  // so while another week loads the ring keeps the previous day and then moves
  // straight to the new value instead of dropping to 0 first.
  const [shownDay, setShownDay] = useState(selected);
  if (loadedWeek === weekStartDay && shownDay !== selected) setShownDay(selected);
  const shownIndex = loadedWeek ? weekDays(loadedWeek, 1).indexOf(shownDay) : -1;
  // Days before the first target was set use that first target, so a newly set goal gives earlier days a ring.
  const selectedTarget = shownIndex >= 0 ? targets[shownIndex] ?? firstTarget : firstTarget;
  const daily = entries.filter(entry => entry.day === shownDay);
  const total = sumNutrients(daily);
  const summaries = week.map((day, index) => {
    const rows = entries.filter(entry => entry.day === day);
    return { day, logged: rows.length > 0, nutrients: sumNutrients(rows), target: targets[index] };
  });
  const stats = weekStats(summaries);
  const maxChart = Math.max(1, ...summaries.map(item => item.nutrients.kcal), ...targets.map(item => item?.kcal ?? 0)) * 1.1;
  const openFood = (category: Meal, entry: FoodEntry | null = null) => { setMeal(category); setEditing(entry); setSheet('food'); };
  const afterChange = () => { changed(); };
  // Meals are saved under the day chosen in the sheet; show that day afterwards.
  const afterFoodChange = (day: string) => { setSelected(clampDay(day, rules)); changed(); };
  const moveWeek = (offset: number) => setSelected(current => moveSelectionByWeek(current, Math.sign(offset), rules));
  const p = palette;
  const headline = calorieHeadline(total.kcal, selectedTarget?.kcal ?? null, display);
  const needsSetup = ready && !firstTarget;
  return <Page title="Nutrition" eyebrow={view === 'week' ? 'This week' : selected === today ? 'Today' : dateLabel(selected)} headerAction={<CircleButton icon="options-outline" label="Nutrition targets" onPress={() => setSheet('targets')}/>}>
    {load.status === 'error' ? <LoadError text="Could not load your nutrition log." onRetry={load.retry}/> : !ready ? <NutritionSkeleton/> : needsSetup ? <TargetSetup onSaved={afterChange}/> : view === 'today' ? <Animated.View entering={reduced ? undefined : FadeIn.duration(320)} style={{ gap: 16 }}>
      <WeekCalendar selected={selected} onSelect={setSelected} rules={rules} todayLabel="Back to today"
        marker={day => summaries.find(item => item.day === day)?.logged ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: day === selected ? p.plInk : p.g1 }}/> : null}/>
      <VCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15.5 }}>Calories</Text>
          <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}><CountUp value={total.kcal} duration={MOTION_MS} format={countKcal}/>{selectedTarget ? ` / ${num(selectedTarget.kcal)}` : ''} kcal</Text>
        </View>
        <View style={{ marginTop: 6 }}>
          <Horseshoe width={Math.min(240, width - 70)} duration={MOTION_MS} value={selectedTarget ? total.kcal / selectedTarget.kcal : 0} big={<CountUp value={headline.value} duration={MOTION_MS} format={countKcal}/>} label={headline.label} percentLabel={selectedTarget ? undefined : '—'}/>
        </View>
        {!selectedTarget && <Pressable accessibilityRole="button" onPress={() => setSheet('targets')} style={{ alignSelf: 'center', paddingVertical: 6 }}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>Set your own target to see calories left</Text></Pressable>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <MacroChip label="Protein" value={total.protein} target={selectedTarget?.protein ?? null} background={p.mc1} bar={p.mb1} track={p.mbt}/>
          <MacroChip label="Carbs" value={total.carbs} target={selectedTarget?.carbs ?? null} background={p.mc2} bar={p.mb2} track={p.mbt}/>
          <MacroChip label="Fat" value={total.fat} target={selectedTarget?.fat ?? null} background={p.mc3} bar={p.mb3} track={p.mbt}/>
        </View>
      </VCard>
      <SectionLink title={selected === today ? "Today's meals" : 'Meals'} action="See all" onPress={() => setView('week')}/>
      <View style={{ gap: 8 }}>
        {meals.map((category, index) => { const rows = daily.filter(entry => entry.meal === category); return <MealRow key={category} index={index} category={category} rows={rows} kcal={sumNutrients(rows).kcal} open={!!expanded[category]} onToggle={() => setExpanded(value => ({ ...value, [category]: !value[category] }))} onAdd={() => openFood(category)} onOpen={entry => openFood(category, entry)}/>; })}
      </View>
    </Animated.View> : <>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to summary" onPress={() => setView('today')} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}><Ionicons name="chevron-back" size={16} color={p.text}/><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12 }}>Summary</Text></Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><CircleButton icon="chevron-back" label="Previous seven days" onPress={() => moveWeek(-7)}/><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{dateLabel(week[0])} – {dateLabel(week[6])}</Text><CircleButton icon="chevron-forward" label="Next seven days" disabled={!weekNavigation(selected, rules).canNext} onPress={() => moveWeek(7)}/></View>
      <View style={{ height: 200, marginTop: 14, borderBottomWidth: 1, borderBottomColor: p.borderStrong, flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>{targets[6] && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: `${targets[6].kcal / maxChart * 100}%`, borderTopWidth: 1, borderStyle: 'dashed', borderColor: p.borderStrong, zIndex: 1 }}><Text style={{ color: p.muted, fontSize: 9.5, fontFamily: fonts.semibold, textAlign: 'right' }}>TARGET</Text></View>}{summaries.map((item, index) => { const onTarget = !!item.logged && !!item.target && Math.abs(item.nutrients.kcal - item.target.kcal) <= item.target.kcal * .1; return <View key={item.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}><AnimatedWeekBar index={index} value={item.nutrients.kcal} maximum={maxChart} color={onTarget ? p.pgHl : p.pgBar}>{item.logged && <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 9.5, marginTop: 4, color: onTarget ? brand.ink : p.plInk }}>{num(item.nutrients.kcal)}</Text>}</AnimatedWeekBar></View>; })}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{week.map(day => <Text key={day} style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 11 }}>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromDay(day)).slice(0, 1)}</Text>)}</View>
      <KpiRow items={[{ value: num(stats.average.kcal), label: 'Avg kcal / day' }, { value: `${stats.nearTarget}/${stats.loggedDays}`, label: 'On target' }, { value: `${stats.proteinDays}/${stats.loggedDays}`, label: 'Protein days' }]}/>
      <StatTrio items={[{ label: 'Protein avg', value: num(stats.average.protein), unit: 'g' }, { label: 'Carbs avg', value: num(stats.average.carbs), unit: 'g' }, { label: 'Fat avg', value: num(stats.average.fat), unit: 'g' }]}/>
      <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>On target means within 10% of your calorie target. Unlogged days are skipped.</Text>
    </>}
    <Text style={{ color: p.muted, fontSize: 11, marginTop: 20 }}>Food data: <Link href="https://www.opennutrition.app" style={{ textDecorationLine: 'underline' }}>OpenNutrition</Link> (ODbL). Includes data © <Link href="https://world.openfoodfacts.org" style={{ textDecorationLine: 'underline' }}>Open Food Facts contributors</Link>.</Text>
    <BottomSheet layout="fixed" visible={sheet === 'food'} title={editing ? 'Edit entry' : 'Add food'} onClose={() => setSheet(null)}>{close => <FoodSheet key={editing?.id ?? `${meal}:${selected}`} entry={editing} meal={meal} day={selected} close={close} onSaved={afterFoodChange}/>}</BottomSheet>
    <BottomSheet visible={sheet === 'targets'} title="Nutrition settings" onClose={() => setSheet(null)}>{close => <TargetsSheet display={display} foods={foods} close={close} onSaved={afterChange} onDisplayChange={setDisplay}/>}</BottomSheet>
  </Page>;
}
