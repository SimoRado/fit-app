import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, Field, confirm, message } from './components';
import { colors, fonts, radii } from './theme';
import { MotionPressable } from './MotionPressable';
import { BloomSwitch } from './MotionBlocks';
import { validDay } from '../core/date';
import { meals, parseNumber, portionNutrients, type Meal, type Nutrients } from '../core/nutrition';
import { deleteCustomFood, deleteFoodEntry, reusableFoods, saveFoodEntry, saveNutritionTarget, setNutritionEnabled, type CustomFood, type FoodEntry, type NutritionTarget, type ReusableFood } from '../data/nutrition';
import { foodCategories, searchFoodCatalog, type CatalogFood } from '../data/foodCatalog';

type Close = (after?: () => void) => void;
const title = (meal: Meal) => meal[0].toUpperCase() + meal.slice(1);
function catalogResult(food: CatalogFood): ReusableFood {
  let sourceLabel: string | null = null;
  let sourceUrl: string | null = null;
  try {
    const first = JSON.parse(food.sources_json ?? '[]')[0];
    if (first && typeof first === 'object') {
      sourceLabel = typeof first.database === 'string' ? first.database : null;
      sourceUrl = typeof first.url === 'string' && first.url.startsWith('https://') ? first.url : null;
    }
  } catch { /* The catalog row remains usable without a source link. */ }
  const pairs = [['Calories', food.kcal_100], ['Protein', food.protein_100], ['Carbs', food.carbs_100], ['Fat', food.fat_100]] as const;
  return { key: `catalog:${food.id}`, catalogId: food.id, foodId: null, name: food.name, category: food.category,
    basis: '100g', grams: 100, servingName: food.serving_name, servingQuantity: food.serving_quantity,
    servingGrams: food.serving_grams, fiber: food.fiber_100, sugar: food.sugar_100, sodium: food.sodium_100,
    sourceLabel, sourceUrl, missing: pairs.filter(([, value]) => value === null).map(([label]) => label),
    nutrients: { kcal: food.kcal_100 ?? 0, protein: food.protein_100 ?? 0, carbs: food.carbs_100 ?? 0, fat: food.fat_100 ?? 0 } };
}
function CatalogCredit() {
  return <Text style={{ color: colors.muted, fontSize: 11 }}>Food data: <Link href="https://www.opennutrition.app" style={{ textDecorationLine: 'underline' }}>OpenNutrition</Link> (ODbL). Includes data © <Link href="https://world.openfoodfacts.org" style={{ textDecorationLine: 'underline' }}>Open Food Facts contributors</Link>.</Text>;
}
function Chips<T extends string>({ values, value, onChange, label }: { values: readonly T[]; value: T; onChange: (next: T) => void; label?: (item: T) => string }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{values.map(item => <MotionPressable key={item} selected={item === value} pressScale={0.97} accessibilityRole="button" accessibilityState={{ selected: item === value }} onPress={() => onChange(item)} style={{ minHeight: 40, paddingHorizontal: 15, justifyContent: 'center', borderRadius: radii.pill, backgroundColor: item === value ? colors.sun : colors.card }}><Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 12 }}>{label ? label(item) : item}</Text></MotionPressable>)}</View>;
}

export function FoodSheet({ entry, meal: initialMeal, day: initialDay, close, onSaved }: { entry: FoodEntry | null; meal: Meal; day: string; close: Close; onSaved: (day: string) => void }) {
  const priorReference = entry?.grams && entry.kcal_100 !== null && entry.protein_100 !== null && entry.carbs_100 !== null && entry.fat_100 !== null;
  const [mode, setMode] = useState<'search' | 'manual'>(entry && !priorReference ? 'manual' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReusableFood[]>([]);
  const [selected, setSelected] = useState<ReusableFood | null>(priorReference ? { key: entry!.food_id ?? entry!.catalog_food_id ?? entry!.id, name: entry!.name, basis: '100g', nutrients: { kcal: entry!.kcal_100!, protein: entry!.protein_100!, carbs: entry!.carbs_100!, fat: entry!.fat_100! }, foodId: entry!.food_id, catalogId: entry!.catalog_food_id, grams: entry!.grams } : null);
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [grams, setGrams] = useState(entry?.grams ? String(entry.grams) : '100');
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? initialMeal);
  const [day, setDay] = useState(entry?.day ?? initialDay);
  const [name, setName] = useState(entry && !priorReference ? entry.name : '');
  const [kcal, setKcal] = useState(entry && !priorReference ? String(entry.kcal) : '');
  const [protein, setProtein] = useState(entry && !priorReference ? String(entry.protein) : '');
  const [carbs, setCarbs] = useState(entry && !priorReference ? String(entry.carbs) : '');
  const [fat, setFat] = useState(entry && !priorReference ? String(entry.fat) : '');
  const [saveCustom, setSaveCustom] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; foodCategories().then(rows => { if (active) { setCategories(rows); setCatalogReady(true); } }).catch(() => { if (active) setCatalogReady(true); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!catalogReady) return;
    let active = true;
    const timer = setTimeout(() => {
      Promise.allSettled([reusableFoods(query), searchFoodCatalog(query, category)])
        .then(([saved, catalog]) => { if (active) {
          setResults([...(saved.status === 'fulfilled' ? saved.value : []), ...(catalog.status === 'fulfilled' ? catalog.value.map(catalogResult) : [])].slice(0, 60));
          setError(catalog.status === 'rejected' ? 'Offline catalog is unavailable. Your saved foods are still shown.' : '');
        } });
    }, 160);
    return () => { active = false; clearTimeout(timer); };
  }, [query, category, catalogReady]);
  const portion = selected?.basis === '100g' ? Number(grams.replace(',', '.')) : null;
  const preview = selected ? selected.basis === '100g' && portion && Number.isFinite(portion) ? portionNutrients(selected.nutrients, portion) : selected.nutrients : null;
  async function save() {
    if (busy) return;
    try {
      if (!validDay(day)) throw Error('Enter a valid date in YYYY-MM-DD format.');
      let nutrients: Nutrients, foodName: string, amount: number | null = null, per100: Nutrients | null = null, foodId: string | null = null;
      if (mode === 'search') {
        if (!selected) throw Error('Select a food or use Manual.');
        if (selected.missing?.length) throw Error(`Nutrition data is missing for ${selected.missing.join(', ')}. Use Manual to enter verified values.`);
        foodName = selected.name;
        if (selected.basis === '100g') {
          amount = parseNumber(grams, 'Portion', 10000);
          if (!amount || amount <= 0) throw Error('Enter a portion above zero.');
          per100 = selected.nutrients;
          nutrients = portionNutrients(per100, amount);
          foodId = selected.foodId;
        } else nutrients = selected.nutrients;
      } else {
        foodName = name.trim();
        nutrients = { kcal: parseNumber(kcal, 'Calories', 10000)!, protein: parseNumber(protein, 'Protein', 2000)!, carbs: parseNumber(carbs, 'Carbohydrates', 2000)!, fat: parseNumber(fat, 'Fat', 2000)! };
        amount = grams.trim() ? parseNumber(grams, 'Portion', 10000) : null;
        if (amount === 0) throw Error('Portion must be above zero.');
      }
      setBusy(true); setError('');
      await saveFoodEntry({ name: foodName, meal, day, grams: amount, ...nutrients }, { id: entry?.id, foodId, catalogId: selected?.catalogId ?? null, per100, saveCustom: mode === 'manual' && saveCustom && !entry && amount !== null });
      onSaved(day); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save food.'); }
    finally { setBusy(false); }
  }
  function remove() {
    if (!entry) return;
    confirm('Delete this food entry?', async () => { try { await deleteFoodEntry(entry.id); onSaved(entry.day); close(); } catch (cause) { message(cause); } }, 'This removes the entry from your diary. Saved custom foods remain available.', 'Delete entry');
  }
  return <View style={{ gap: 15 }}>
    {!entry && <Chips values={['search', 'manual'] as const} value={mode} onChange={next => { setMode(next); setSelected(null); setGrams(next === 'manual' ? '' : '100'); }} label={item => item.toUpperCase()}/>}
    {mode === 'search' ? selected ? <>
      <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 29 }}>{selected.name}</Text>
      <Text style={{ color: colors.muted }}>{Math.round(selected.nutrients.kcal)} kcal {selected.basis === '100g' ? '/ 100 g' : '/ saved serving'}</Text>
      {selected.catalogId && <Text style={{ color: colors.muted, fontSize: 12 }}>{selected.category ?? 'Food'} · OpenNutrition ID {selected.catalogId}</Text>}
      {selected.catalogId && selected.servingGrams != null && selected.servingGrams > 0 && <Button title={`Use ${selected.servingQuantity ?? 1} ${selected.servingName ?? 'serving'} (${selected.servingGrams} g)`} kind="ghost" onPress={() => setGrams(String(selected.servingGrams))}/>}
      {selected.catalogId && <Button title="Use 100 g" kind="ghost" onPress={() => setGrams('100')}/>}
      {selected.basis === '100g' && <Field label="Portion (g)" value={grams} onChangeText={setGrams} keyboardType="decimal-pad"/>}
      {preview && <View style={{ flexDirection: 'row', gap: 6 }}>{([['KCAL', preview.kcal], ['P', preview.protein], ['C', preview.carbs], ['F', preview.fat]] as const).map(([label, value]) => <View key={label} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 18, padding: 9 }}><Text style={{ color: colors.muted, fontSize: 10 }}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 21 }}>{Math.round(value)}</Text></View>)}</View>}
      {selected.catalogId && <Text style={{ color: colors.muted, fontSize: 12 }}>Per 100 g: fiber {selected.fiber ?? 'unknown'} g · sugars {selected.sugar ?? 'unknown'} g · sodium {selected.sodium ?? 'unknown'} mg</Text>}
      {!!selected.missing?.length && <Text accessibilityRole="alert" style={{ color: colors.danger }}>Missing nutrition: {selected.missing.join(', ')}. Enter verified values manually to log this food.</Text>}
      {selected.sourceLabel && <Text style={{ color: colors.muted, fontSize: 11 }}>Source: {selected.sourceUrl ? <Link href={selected.sourceUrl as `https://${string}`} style={{ textDecorationLine: 'underline' }}>{selected.sourceLabel}</Link> : selected.sourceLabel}</Text>}
      {selected.catalogId && <CatalogCredit/>}
      {!entry && <Button title="Back to results" kind="ghost" onPress={() => setSelected(null)}/>} 
    </> : <><Field label="Search foods or barcode" value={query} onChangeText={setQuery} placeholder="Name, alternative name, or barcode"/>
      {!catalogReady && <Text style={{ color: colors.muted }}>Preparing your offline food library…</Text>}
      {!!categories.length && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><MotionPressable accessibilityRole="button" selected={category === null} onPress={() => setCategory(null)} style={{ padding: 9, borderRadius: 15, backgroundColor: category === null ? colors.sun : colors.card }}><Text>All</Text></MotionPressable>{categories.map(item => <MotionPressable key={item} accessibilityRole="button" selected={category === item} onPress={() => setCategory(item)} style={{ padding: 9, borderRadius: 15, backgroundColor: category === item ? colors.sun : colors.card }}><Text>{item}</Text></MotionPressable>)}</View>}
      {catalogReady && (results.length ? results.map(food => <Pressable key={food.key} accessibilityRole="button" onPress={() => { setSelected(food); setGrams(String(food.servingGrams ?? food.grams ?? 100)); }} style={{ minHeight: 57, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center' }}><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>{food.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{food.missing?.includes('Calories') ? 'Calories unknown' : `${Math.round(food.nutrients.kcal)} kcal`} · {food.catalogId ? `OpenNutrition · ${food.category ?? 'food'}` : food.basis === '100g' ? 'saved · per 100 g' : 'saved serving'}</Text></Pressable>) : <Text style={{ color: colors.muted }}>No foods found. Use Manual to enter your own values.</Text>)}
      <CatalogCredit/>
    </> : <>
      <Field label="Food name" value={name} onChangeText={setName} placeholder="e.g. Homemade soup"/>
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Calories (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad"/></View><View style={{ flex: 1 }}><Field label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad"/></View></View>
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad"/></View><View style={{ flex: 1 }}><Field label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad"/></View></View>
      <Field label="Portion (g, optional)" value={grams} onChangeText={setGrams} keyboardType="decimal-pad"/>
      {!entry && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saveCustom }} onPress={() => setSaveCustom(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.ink }}>{saveCustom ? '☑' : '☐'} Save as a custom food when grams are entered</Text></Pressable>}
    </>}
    <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11 }}>MEAL</Text><Chips values={meals} value={meal} onChange={setMeal} label={title}/>
    <Field label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay}/>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    {(mode === 'manual' || selected) && <Button title={busy ? 'Saving…' : entry ? 'Save entry' : 'Add food'} disabled={busy} onPress={save}/>} 
    {entry && <Button title="Delete entry" kind="danger" onPress={remove}/>} 
  </View>;
}

export function TargetsSheet({ day, target, enabled, foods, close, onSaved }: { day: string; target: NutritionTarget | null; enabled: boolean; foods: CustomFood[]; close: Close; onSaved: () => void }) {
  const [kcal, setKcal] = useState(target ? String(target.kcal) : '');
  const [protein, setProtein] = useState(target ? String(target.protein) : '');
  const [carbs, setCarbs] = useState(target ? String(target.carbs) : '');
  const [fat, setFat] = useState(target ? String(target.fat) : '');
  const [tracking, setTracking] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    try {
      const values = { kcal: parseNumber(kcal, 'Calorie target', 10000)!, protein: parseNumber(protein, 'Protein target', 2000, true) ?? 0, carbs: parseNumber(carbs, 'Carbohydrate target', 2000, true) ?? 0, fat: parseNumber(fat, 'Fat target', 2000, true) ?? 0 };
      if (values.kcal <= 0) throw Error('Calorie target must be above zero.');
      setBusy(true); setError('');
      await saveNutritionTarget(day, values);
      await setNutritionEnabled(tracking);
      onSaved(); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save targets.'); }
    finally { setBusy(false); }
  }
  async function toggle() { try { await setNutritionEnabled(!tracking); setTracking(!tracking); onSaved(); } catch (cause) { message(cause); } }
  function removeFood(food: CustomFood) { confirm(`Delete ${food.name}?`, async () => { try { await deleteCustomFood(food.id); onSaved(); } catch (cause) { message(cause); } }, 'Diary entries already logged with this food remain in your history.', 'Delete saved food'); }
  return <View style={{ gap: 15 }}>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Set your own daily targets. Changes take effect today and do not rewrite earlier targets. Calories entered for foods stay separate from macro estimates.</Text>
    <Field label="Daily calories (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad"/>
    <Field label="Protein target (g, optional)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad"/>
    <Field label="Carbohydrate target (g, optional)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad"/>
    <Field label="Fat target (g, optional)" value={fat} onChangeText={setFat} keyboardType="decimal-pad"/>
    <Text style={{ color: colors.muted, fontSize: 12 }}>Macro energy estimate: protein ≈ 4 kcal/g, carbs ≈ 4 kcal/g, fat ≈ 9 kcal/g. This does not change your calorie target.</Text>
    <View style={{ minHeight: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>Calorie tracking</Text><BloomSwitch label="Calorie tracking" value={tracking} onChange={toggle}/></View>
    <Text style={{ color: colors.muted, fontSize: 12 }}>Turning tracking off hides diary content and dashboard values without deleting meals.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Button title={busy ? 'Saving…' : 'Save targets'} disabled={busy} onPress={save}/>
    <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 27, marginTop: 10 }}>Saved custom foods</Text>
    {foods.length ? foods.map(food => <View key={food.id} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>{food.name}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{Math.round(food.kcal_100)} kcal / 100 g</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${food.name}`} onPress={() => removeFood(food)} style={{ padding: 10 }}><Text style={{ color: colors.danger }}>Delete</Text></Pressable></View>) : <Text style={{ color: colors.muted }}>No custom foods saved yet.</Text>}
  </View>;
}
