import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { Button, Page, message } from '../../ui/components';
import { BottomSheet } from '../../ui/BottomSheet';
import { AnimatedNumber, NutritionPebble, NutritionRing, NutritionScene, NutritionVessel } from '../../ui/NutritionVisuals';
import { colors, fonts, radii, shadows } from '../../ui/theme';
import { addDays, dayKey, fromDay } from '../../core/date';
import { calorieBalance, meals, nutritionWeek, progressRatio, sumNutrients, weekStats, type Meal } from '../../core/nutrition';
import { customFoods, foodEntries, nutritionEnabled, nutritionTarget, type CustomFood, type FoodEntry, type NutritionTarget } from '../../data/nutrition';
import { useApp } from '../../state/app';
import { FoodSheet, TargetsSheet } from '../../ui/NutritionSheets';
import { AnimatedCollapse, AnimatedWeekBar } from '../../ui/MotionBlocks';
import { MotionPressable } from '../../ui/MotionPressable';
import { useReducedMotion } from '../../ui/motion';

const num = (value: number) => Math.round(value).toLocaleString();
const dateLabel = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' }).format(fromDay(day));

function NutritionDayButton({ day, selected, ratio, onSelect }: { day: string; selected: boolean; ratio: number; onSelect: () => void }) {
  const today = day === dayKey();
  const reduced = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => { progress.value = reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 16, stiffness: 190 }); }, [progress, reduced, selected]);
  const selectionStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(30,27,46,0)', colors.ink]), transform: [{ scale: interpolate(progress.value, [0, 1], [0.96, 1]) }] }));
  return <MotionPressable selected={selected} accessibilityRole="button" accessibilityLabel={dateLabel(day)} accessibilityState={{ selected }} onPress={onSelect} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5, borderRadius: 25, paddingVertical: 9, overflow: 'hidden' }}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 25 }, selectionStyle]}/>
    <Text style={{ color: selected ? '#CDC6E6' : colors.muted, fontFamily: fonts.bold, fontSize: 10 }}>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromDay(day)).slice(0, 1)}</Text>
    <NutritionRing ratio={ratio}/>
    <Text style={{ color: selected ? (today ? colors.sun : colors.card) : today ? colors.accent : colors.ink, fontFamily: fonts.bold, fontSize: 14 }}>{fromDay(day).getDate()}</Text>
  </MotionPressable>;
}

function NutritionViewSwitch({ value, onChange }: { value: 'today' | 'week'; onChange: (value: 'today' | 'week') => void }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(value === 'week' ? 1 : 0);
  const [width, setWidth] = useState(0);
  useEffect(() => { progress.value = reduced ? (value === 'week' ? 1 : 0) : withSpring(value === 'week' ? 1 : 0, { damping: 17, stiffness: 180 }); }, [progress, reduced, value]);
  const selectedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(progress.value, [0, 1], [0, Math.max(0, (width - 11) / 2 + 3)]) }] }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return <View onLayout={onLayout} style={{ position: 'relative', flexDirection: 'row', borderRadius: radii.pill, backgroundColor: colors.card2, padding: 4, gap: 3 }}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 4, top: 4, bottom: 4, width: Math.max(0, (width - 11) / 2), borderRadius: radii.pill, backgroundColor: colors.card, ...shadows.card }, selectedStyle]}/>
    {(['today', 'week'] as const).map(item => <MotionPressable key={item} selected={value === item} accessibilityRole="tab" accessibilityState={{ selected: value === item }} onPress={() => onChange(item)} style={{ flex: 1, minHeight: 40, borderRadius: radii.pill, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontFamily: fonts.bold, color: value === item ? colors.ink : colors.muted, fontSize: 12, letterSpacing: .4 }}>{item.toUpperCase()}</Text></MotionPressable>)}
  </View>;
}

function MealChevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => { progress.value = reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: 360, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }); }, [open, progress, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 90])}deg` }] }));
  return <Animated.View style={style}><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Animated.View>;
}

function MealSection({ category, rows, kcal, collapsed, onToggle, onAdd, onOpen, width }: { category: Meal; rows: FoodEntry[]; kcal: number; collapsed: boolean; onToggle: () => void; onAdd: () => void; onOpen: (entry: FoodEntry) => void; width: number }) {
  return <View style={{ marginTop: 31, gap: 9 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MotionPressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} onPress={onToggle} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: width < 360 ? 29 : 34, lineHeight: 40 }}>{category[0].toUpperCase() + category.slice(1)}</Text><MealChevron open={!collapsed}/>
      </MotionPressable>
      <AnimatedNumber value={kcal} style={{ width: 80, color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 26, textAlign: 'right' }}/><Text style={{ color: colors.muted, fontSize: 11 }}>kcal</Text>
      <MotionPressable pressScale={0.92} accessibilityRole="button" accessibilityLabel={`Add food to ${category}`} onPress={onAdd} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="add" size={22} color={colors.card}/></MotionPressable>
    </View>
    <AnimatedCollapse open={!collapsed}>
      {rows.length ? rows.map(entry => <MotionPressable key={entry.id} accessibilityRole="button" onPress={() => onOpen(entry)} style={{ minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ width: 44, height: 44, borderRadius: 18, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="restaurant-outline" size={20} color={colors.ink}/></View>
        <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.bold }}>{entry.name}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{entry.grams ? `${num(entry.grams)} g · ` : ''}P {num(entry.protein)} · C {num(entry.carbs)} · F {num(entry.fat)}</Text></View>
        <AnimatedNumber value={entry.kcal} style={{ width: 66, color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 23, textAlign: 'right' }}/>
      </MotionPressable>) : <MotionPressable accessibilityRole="button" onPress={onAdd} style={{ minHeight: 52, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line3, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={16} color={colors.muted}/><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 12 }}>Add food</Text></MotionPressable>}
    </AnimatedCollapse>
  </View>;
}

export default function NutritionScreen() {
  const { width } = useWindowDimensions();
  const { revision, changed } = useApp();
  const today = dayKey();
  const [anchor, setAnchor] = useState(today);
  const week = nutritionWeek(anchor);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<'today' | 'week'>('today');
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [targets, setTargets] = useState<(NutritionTarget | null)[]>([]);
  const [currentTarget, setCurrentTarget] = useState<NutritionTarget | null>(null);
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'food' | 'targets' | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [collapsed, setCollapsed] = useState<Partial<Record<Meal, boolean>>>({});
  useEffect(() => {
    let active = true;
    const days = nutritionWeek(anchor);
    void Promise.all([foodEntries(days[0], anchor), Promise.all(days.map(nutritionTarget)), nutritionTarget(today), customFoods(), nutritionEnabled()])
      .then(([nextEntries, nextTargets, nextCurrentTarget, nextFoods, nextEnabled]) => { if (active) { setEntries(nextEntries); setTargets(nextTargets); setCurrentTarget(nextCurrentTarget); setFoods(nextFoods); setEnabled(nextEnabled); setReady(true); } })
      .catch(message);
    return () => { active = false; };
  }, [revision, anchor, today]);
  const selectedIndex = week.indexOf(selected);
  const selectedTarget = targets[selectedIndex] ?? null;
  const daily = entries.filter(entry => entry.day === selected);
  const total = sumNutrients(daily);
  const balance = calorieBalance(selectedTarget?.kcal ?? null, total.kcal);
  const summaries = week.map((day, index) => {
    const rows = entries.filter(entry => entry.day === day);
    return { day, logged: rows.length > 0, nutrients: sumNutrients(rows), target: targets[index] };
  });
  const stats = weekStats(summaries);
  const maxChart = Math.max(1, ...summaries.map(item => item.nutrients.kcal), ...targets.map(item => item?.kcal ?? 0)) * 1.1;
  const openFood = (category: Meal, entry: FoodEntry | null = null) => { setMeal(category); setEditing(entry); setSheet('food'); };
  const afterChange = () => { changed(); };
  const afterFoodChange = (day: string) => { setAnchor(day); setSelected(day); changed(); };
  const moveWeek = (offset: number) => { const next = addDays(anchor, offset); if (next > today) return; setAnchor(next); setSelected(next); };
  return <Page title="">
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}><Text style={{ color: colors.muted, fontFamily: fonts.bold, letterSpacing: .7, fontSize: 11 }}>{selected === today ? 'TODAY' : dateLabel(selected).toUpperCase()}</Text><Pressable accessibilityRole="button" accessibilityLabel="Nutrition targets" onPress={() => setSheet('targets')} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="options-outline" size={22} color={colors.ink}/></Pressable></View>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: width < 360 ? 45 : 55, lineHeight: width < 360 ? 50 : 60, letterSpacing: -1.5 }}>Nutrition<Text style={{ color: colors.coral }}>.</Text></Text>
    {!ready ? <Text style={{ color: colors.muted }}>Loading nutrition…</Text> : !enabled ? <View style={{ alignItems: 'center', gap: 14, paddingVertical: 56 }}><Ionicons name="restaurant-outline" size={38} color={colors.accent}/><Text style={{ fontFamily: fonts.bold, color: colors.ink }}>Calorie tracking is off</Text><Text style={{ color: colors.muted, textAlign: 'center' }}>Turn it on to log meals and see your daily targets.</Text><Button title="Turn on" onPress={() => setSheet('targets')}/></View> : <>
      <NutritionViewSwitch value={view} onChange={setView}/>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Pressable accessibilityRole="button" accessibilityLabel="Previous seven days" onPress={() => moveWeek(-7)} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Ionicons name="chevron-back" size={21} color={colors.ink}/></Pressable><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 12 }}>{dateLabel(week[0])} – {dateLabel(week[6])}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next seven days" accessibilityState={{ disabled: anchor >= today }} disabled={anchor >= today} onPress={() => moveWeek(7)} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center', opacity: anchor >= today ? .3 : 1 }}><Ionicons name="chevron-forward" size={21} color={colors.ink}/></Pressable></View>
      {view === 'today' ? <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 2, marginTop: 12, marginBottom: 8 }}>{summaries.map(item => <NutritionDayButton key={item.day} day={item.day} selected={item.day === selected} ratio={progressRatio(item.nutrients.kcal, item.target?.kcal ?? null)} onSelect={() => setSelected(item.day)}/>)}</View>
        <View style={{ minHeight: 340, borderRadius: 42, padding: 22, justifyContent: 'flex-end', backgroundColor: '#FFE7A3', overflow: 'hidden', ...shadows.card }}>
          <NutritionScene/>
          {selectedTarget && <View pointerEvents="none" style={{ position: 'absolute', right: 5, top: 8 }}><NutritionVessel consumed={total.kcal} target={selectedTarget.kcal} size={width < 360 ? 128 : 148}/></View>}
          <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .8 }}>{balance.label}</Text>
          <AnimatedNumber value={balance.amount} accessibilityLabel={balance.label} style={{ width: '100%', fontFamily: fonts.displayHeavy, fontSize: width < 360 ? 76 : 99, lineHeight: width < 360 ? 91 : 110, letterSpacing: -4, color: colors.ink }}/>
          <View style={{ flexDirection: 'row', gap: 28 }}><View><Text style={{ color: colors.muted, fontSize: 11 }}>CONSUMED</Text><AnimatedNumber value={total.kcal} style={{ width: 96, color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 27 }}/></View><View><Text style={{ color: colors.muted, fontSize: 11 }}>TARGET</Text><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 27 }}>{selectedTarget ? num(selectedTarget.kcal) : '—'}</Text></View></View>
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }}>{selectedTarget ? 'Your own target. Adjust it any time.' : 'Set your own target to see calories left.'}</Text>
        {!selectedTarget && <Button title="Set a target" kind="ghost" onPress={() => setSheet('targets')}/>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>{([['Protein', 'protein', colors.coral], ['Carbs', 'carbs', colors.sun], ['Fat', 'fat', colors.accent]] as const).map(([label, key, color]) => <View key={key} style={{ flex: 1, alignItems: 'center', gap: 4 }}><NutritionPebble consumed={total[key]} target={selectedTarget?.[key] ?? null} color={color}/><View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}><AnimatedNumber value={total[key]} style={{ width: 54, color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 26, textAlign: 'right' }}/><Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 11 }}>{selectedTarget?.[key] ? `/${num(selectedTarget[key])} g` : ' g'}</Text></View><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11 }}>{label}</Text></View>)}</View>
        {meals.map(category => { const rows = daily.filter(entry => entry.meal === category); const kcal = sumNutrients(rows).kcal; return <MealSection key={category} category={category} rows={rows} kcal={kcal} collapsed={!!collapsed[category]} onToggle={() => setCollapsed(value => ({ ...value, [category]: !value[category] }))} onAdd={() => openFood(category)} onOpen={entry => openFood(category, entry)} width={width}/>; })}
      </> : <>
        <View style={{ height: 230, marginTop: 25, borderBottomWidth: 2, borderBottomColor: colors.borderStrong, flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>{targets[6] && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: `${targets[6].kcal / maxChart * 100}%`, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.accent, zIndex: 1 }}><Text style={{ color: colors.accent, fontSize: 10, fontFamily: fonts.bold }}>TARGET</Text></View>}{summaries.map((item, index) => <View key={item.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}><AnimatedWeekBar index={index} value={item.nutrients.kcal} maximum={maxChart} color={item.logged && item.target && Math.abs(item.nutrients.kcal - item.target.kcal) <= item.target.kcal * .1 ? colors.sun : colors.lilac}>{item.logged && <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 10, color: colors.ink }}>{num(item.nutrients.kcal)}</Text>}</AnimatedWeekBar></View>)}</View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{week.map(day => <Text key={day} style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11 }}>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromDay(day)).slice(0, 1)}</Text>)}</View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}><View style={{ flex: 1, minHeight: 91, borderRadius: 22, padding: 11, backgroundColor: colors.card, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 10 }}>Avg / logged day</Text><AnimatedNumber value={stats.average.kcal} style={{ width: '100%', color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 23 }}/></View><View style={{ flex: 1, minHeight: 91, borderRadius: 22, padding: 11, backgroundColor: colors.card, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 10 }}>On target</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 23 }}>{`${stats.nearTarget}/${stats.loggedDays}`}</Text></View><View style={{ flex: 1, minHeight: 91, borderRadius: 22, padding: 11, backgroundColor: colors.card, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 10 }}>Protein days</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 23 }}>{`${stats.proteinDays}/${stats.loggedDays}`}</Text></View></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>{([['Protein', stats.average.protein], ['Carbs', stats.average.carbs], ['Fat', stats.average.fat]] as const).map(([label, value]) => <View key={label} style={{ flex: 1, minHeight: 91, borderRadius: 22, padding: 11, backgroundColor: colors.card, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 10 }}>{label} avg</Text><View style={{ flexDirection: 'row', alignItems: 'baseline' }}><AnimatedNumber value={value} style={{ flexShrink: 1, width: 55, color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 23 }}/><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 23 }}> g</Text></View></View>)}</View>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }}>On target means within 10% of your calorie target. Unlogged days are skipped.</Text>
      </>}
    </>}
    <BottomSheet visible={sheet === 'food'} title={editing ? 'Edit entry' : 'Add food'} onClose={() => setSheet(null)}>{close => <FoodSheet key={editing?.id ?? `${meal}:${selected}`} entry={editing} meal={meal} day={selected} close={close} onSaved={afterFoodChange}/>}</BottomSheet>
    <BottomSheet visible={sheet === 'targets'} title="Nutrition · targets" onClose={() => setSheet(null)}>{close => <TargetsSheet day={today} target={currentTarget} enabled={enabled} foods={foods} close={close} onSaved={afterChange}/>}</BottomSheet>
  </Page>;
}
