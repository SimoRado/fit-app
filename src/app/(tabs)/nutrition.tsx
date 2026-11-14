import React, { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../ui/LocalizedText';
import { Button, Page, message } from '../../ui/components';
import { BottomSheet } from '../../ui/BottomSheet';
import { fonts, getAppearancePalette } from '../../ui/theme';
import { addDays, dayKey, fromDay } from '../../core/date';
import { meals, nutritionWeek, sumNutrients, weekStats, type Meal } from '../../core/nutrition';
import { customFoods, foodEntries, nutritionEnabled, nutritionTarget, type CustomFood, type FoodEntry, type NutritionTarget } from '../../data/nutrition';
import { prepareFoodCatalog } from '../../data/foodCatalog';
import { useApp } from '../../state/app';
import { FoodSheet, TargetsSheet } from '../../ui/NutritionSheets';
import { AnimatedCollapse, AnimatedWeekBar } from '../../ui/MotionBlocks';
import { MotionPressable } from '../../ui/MotionPressable';
import { CircleButton, DayPills, EmptyAction, Horseshoe, IconBox, KpiRow, ListRow, MiniBar, PlusDot, RowValue, SectionLink, StatTrio, VCard, usePalette, type VoltIcon } from '../../ui/voltKit';

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

/** `.mchip` — macro tile with a slim progress bar. */
function MacroChip({ label, value, target, background, bar, track }: { label: string; value: number; target: number | null; background: string; bar: string; track: string }) {
  const p = usePalette();
  return <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 7, paddingTop: 11, paddingBottom: 10, paddingHorizontal: 8, borderRadius: 20, backgroundColor: background }}>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 13.5 }}>{num(value)}g<Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{target ? ` / ${num(target)}g` : ''}</Text></Text>
    <View style={{ alignSelf: 'stretch' }}><MiniBar value={target ? value / target : 0} color={bar} track={track} height={5}/></View>
    <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12 }}>{label}</Text>
  </View>;
}

export default function NutritionScreen() {
  const { width } = useWindowDimensions();
  const { revision, changed, appearance } = useApp();
  const palette = getAppearancePalette(appearance);
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
  const [expanded, setExpanded] = useState<Partial<Record<Meal, boolean>>>({});
  useEffect(() => {
    let active = true;
    const days = nutritionWeek(anchor);
    void Promise.all([foodEntries(days[0], anchor), Promise.all(days.map(nutritionTarget)), nutritionTarget(today), customFoods(), nutritionEnabled()])
      .then(([nextEntries, nextTargets, nextCurrentTarget, nextFoods, nextEnabled]) => { if (active) { setEntries(nextEntries); setTargets(nextTargets); setCurrentTarget(nextCurrentTarget); setFoods(nextFoods); setEnabled(nextEnabled); setReady(true); } })
      .catch(message);
    return () => { active = false; };
  }, [revision, anchor, today]);
  useEffect(() => { void prepareFoodCatalog(); }, []);
  const selectedIndex = week.indexOf(selected);
  const selectedTarget = targets[selectedIndex] ?? null;
  const daily = entries.filter(entry => entry.day === selected);
  const total = sumNutrients(daily);
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
  const p = palette;
  const left = selectedTarget ? selectedTarget.kcal - total.kcal : null;
  const dayPills = week.map(day => ({ key: day, number: String(fromDay(day).getDate()), label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromDay(day)), accessibilityLabel: dateLabel(day) }));
  return <Page title="Nutrition" eyebrow={view === 'week' ? 'This week' : selected === today ? 'Today' : dateLabel(selected)} headerAction={<CircleButton icon="options-outline" label="Nutrition targets" onPress={() => setSheet('targets')}/>}>
    {!ready ? <Text style={{ color: p.muted }}>Loading nutrition…</Text> : !enabled ? <VCard style={{ alignItems: 'center', gap: 12, paddingVertical: 36 }}><IconBox icon="restaurant-outline" size={48} radius={16} background={p.soft1}/><Text style={{ fontFamily: fonts.displayHeavy, fontSize: 17, color: p.text }}>Calorie tracking is off</Text><Text style={{ color: p.muted, textAlign: 'center' }}>Turn it on to log meals and see your daily targets.</Text><Button title="Turn on" onPress={() => setSheet('targets')}/></VCard> : view === 'today' ? <>
      <DayPills days={dayPills} selected={selected} onSelect={setSelected}/>
      <VCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15.5 }}>Calories</Text>
          <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{num(total.kcal)}{selectedTarget ? ` / ${num(selectedTarget.kcal)}` : ''} kcal</Text>
        </View>
        <View style={{ marginTop: 6 }}>
          <Horseshoe width={Math.min(240, width - 70)} value={selectedTarget ? total.kcal / selectedTarget.kcal : 0} big={left === null ? num(total.kcal) : num(Math.abs(left))} label={left === null ? 'kcal consumed' : left >= 0 ? 'kcal left' : 'kcal over'} percentLabel={selectedTarget ? undefined : '—'}/>
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
    </> : <>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to summary" onPress={() => setView('today')} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}><Ionicons name="chevron-back" size={16} color={p.text}/><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12 }}>Summary</Text></Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><CircleButton icon="chevron-back" label="Previous seven days" onPress={() => moveWeek(-7)}/><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{dateLabel(week[0])} – {dateLabel(week[6])}</Text><CircleButton icon="chevron-forward" label="Next seven days" disabled={anchor >= today} onPress={() => moveWeek(7)}/></View>
      <View style={{ height: 200, marginTop: 14, borderBottomWidth: 1, borderBottomColor: p.borderStrong, flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>{targets[6] && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: `${targets[6].kcal / maxChart * 100}%`, borderTopWidth: 1, borderStyle: 'dashed', borderColor: p.borderStrong, zIndex: 1 }}><Text style={{ color: p.muted, fontSize: 9.5, fontFamily: fonts.semibold, textAlign: 'right' }}>TARGET</Text></View>}{summaries.map((item, index) => { const onTarget = !!item.logged && !!item.target && Math.abs(item.nutrients.kcal - item.target.kcal) <= item.target.kcal * .1; return <View key={item.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}><AnimatedWeekBar index={index} value={item.nutrients.kcal} maximum={maxChart} color={onTarget ? p.pgHl : p.pgBar}>{item.logged && <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 9.5, marginTop: 4, color: onTarget ? '#0B1446' : p.plInk }}>{num(item.nutrients.kcal)}</Text>}</AnimatedWeekBar></View>; })}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{week.map(day => <Text key={day} style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 11 }}>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromDay(day)).slice(0, 1)}</Text>)}</View>
      <KpiRow items={[{ value: num(stats.average.kcal), label: 'Avg kcal / day' }, { value: `${stats.nearTarget}/${stats.loggedDays}`, label: 'On target' }, { value: `${stats.proteinDays}/${stats.loggedDays}`, label: 'Protein days' }]}/>
      <StatTrio items={[{ label: 'Protein avg', value: num(stats.average.protein), unit: 'g' }, { label: 'Carbs avg', value: num(stats.average.carbs), unit: 'g' }, { label: 'Fat avg', value: num(stats.average.fat), unit: 'g' }]}/>
      <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>On target means within 10% of your calorie target. Unlogged days are skipped.</Text>
    </>}
    <Text style={{ color: p.muted, fontSize: 11, marginTop: 20 }}>Food data: <Link href="https://www.opennutrition.app" style={{ textDecorationLine: 'underline' }}>OpenNutrition</Link> (ODbL). Includes data © <Link href="https://world.openfoodfacts.org" style={{ textDecorationLine: 'underline' }}>Open Food Facts contributors</Link>.</Text>
    <BottomSheet visible={sheet === 'food'} title={editing ? 'Edit entry' : 'Add food'} onClose={() => setSheet(null)}>{close => <FoodSheet key={editing?.id ?? `${meal}:${selected}`} entry={editing} meal={meal} day={selected} close={close} onSaved={afterFoodChange}/>}</BottomSheet>
    <BottomSheet visible={sheet === 'targets'} title="Nutrition · targets" onClose={() => setSheet(null)}>{close => <TargetsSheet day={today} target={currentTarget} enabled={enabled} foods={foods} close={close} onSaved={afterChange}/>}</BottomSheet>
  </Page>;
}
