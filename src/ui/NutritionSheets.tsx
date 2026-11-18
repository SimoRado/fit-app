import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, Field, confirm, message } from './components';
import { colors, fonts, radii, brand } from './theme';
import { MotionPressable } from './MotionPressable';
import { dayKey, validDay } from '../core/date';
import { convertVolumeQuantity, displayQuantity, fromGrams, primaryUnits, parseQuantity, servingLabel, toGrams, unitOptions, type FoodUnit } from '../core/foodUnits';
import { meals, parseNumber, portionNutrients, type CalorieDisplay, type Meal, type Nutrients } from '../core/nutrition';
import { deleteCustomFood, deleteFoodEntry, foodEntryUnit, recentFoods, reusableFoods, saveCustomFood, saveFoodEntry, setCalorieDisplay, type CustomFood, type CustomFoodMeasure, type FoodEntry, type RecentFood, type ReusableFood, type SavedFoodUnit } from '../data/nutrition';
import { NutritionTargetEditor } from './NutritionTargetEditor';
import { catalogFoodById, foodCategories, searchFoodCatalog, type CatalogFood } from '../data/foodCatalog';
import { useApp } from '../state/app';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from './motion';

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
/** Volt connected segmented control with a sliding thumb. `lime` marks the
 * selected value with the accent (units); `surface` raises it (Search/Manual). */
export function Segmented<T extends string>({ options, value, onChange, label, tone = 'lime', accessibility, compact = false }: { options: readonly T[]; value: T; onChange: (next: T) => void; label: (item: T) => string; tone?: 'lime' | 'surface'; accessibility?: (item: T) => string; compact?: boolean }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const found = options.indexOf(value);
  const index = Math.max(0, found);
  const segment = options.length ? (width - 8) / options.length : 0;
  const offset = useSharedValue(index * segment);
  useEffect(() => { offset.value = reduced ? index * segment : withTiming(index * segment, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [index, segment, offset, reduced]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const light = colors.light;
  const lime = tone === 'lime';
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: radii.pill, backgroundColor: light ? colors.soft1 : colors.card2, borderWidth: 1, borderColor: colors.c8Line }}>
    {width > 0 && found >= 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: segment, borderRadius: radii.pill, backgroundColor: lime ? colors.sun : colors.c8, ...(lime || !light ? {} : { shadowColor: brand.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }) }, thumb]}/>}
    {options.map(item => {
      const on = item === value;
      return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={accessibility ? accessibility(item) : label(item)} accessibilityState={{ selected: on }} onPress={() => onChange(item)} style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: compact ? 2 : 8, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: on ? (lime ? colors.accentInk : colors.text) : colors.muted, fontFamily: fonts.bold, fontSize: compact ? 12.5 : 13 }}>{label(item)}</Text>
      </Pressable>;
    })}
  </View>;
}

/** Height + fade + small vertical slide; used for the extra-units drawer. */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [measured, setMeasured] = useState(0);
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => { progress.value = reduced ? Number(open) : withTiming(Number(open), { duration: 240, easing: Easing.out(Easing.cubic) }); }, [open, progress, reduced]);
  const outer = useAnimatedStyle(() => ({ height: measured * progress.value, opacity: progress.value }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * -6 }] }));
  return <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[{ overflow: 'hidden' }, outer]}>
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, inner]} onLayout={event => { const next = event.nativeEvent.layout.height; if (Math.abs(next - measured) > 0.5) setMeasured(next); }}>{children}</Animated.View>
  </Animated.View>;
}

const shortUnit: Partial<Record<FoodUnit, string>> = { 'US cup': 'cup', 'US tbsp': 'tbsp', 'US tsp': 'tsp', 'US fl oz': 'fl oz' };
function UnitChip({ label, selected, onPress, accessibility }: { label: string; selected: boolean; onPress: () => void; accessibility: string }) {
  return <MotionPressable selected={selected} pressScale={0.96} accessibilityRole="button" accessibilityLabel={accessibility} accessibilityState={{ selected }} onPress={onPress}
    style={{ minHeight: 38, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: selected ? colors.sun : colors.borderStrong, backgroundColor: selected ? colors.sun : colors.c8 }}>
    <Text style={{ color: selected ? colors.accentInk : colors.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{label}</Text>
  </MotionPressable>;
}

function RecentChip({ name, onPress }: { name: string; onPress: () => void }) {
  return <MotionPressable pressScale={0.96} accessibilityRole="button" accessibilityLabel={`Log ${name} again`} onPress={onPress}
    style={{ minHeight: 40, maxWidth: 180, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.c8 }}>
    <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{name}</Text>
  </MotionPressable>;
}

const sectionLabel = { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.7 } as const;

export function FoodSheet({ entry, meal: initialMeal, day: initialDay, close, onSaved }: { entry: FoodEntry | null; meal: Meal; day: string; close: Close; onSaved: (day: string) => void }) {
  const { measurementSystem } = useApp();
  const insets = useSafeAreaInsets();
  const priorReference = entry?.grams && entry.kcal_100 !== null && entry.protein_100 !== null && entry.carbs_100 !== null && entry.fat_100 !== null;
  const [mode, setMode] = useState<'search' | 'manual'>(entry && !priorReference ? 'manual' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReusableFood[]>([]);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [selected, setSelected] = useState<ReusableFood | null>(priorReference ? { key: entry!.food_id ?? entry!.catalog_food_id ?? entry!.id, name: entry!.name, basis: '100g', nutrients: { kcal: entry!.kcal_100!, protein: entry!.protein_100!, carbs: entry!.carbs_100!, fat: entry!.fat_100! }, foodId: entry!.food_id, catalogId: entry!.catalog_food_id, grams: entry!.grams } : null);
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [quantityText, setQuantityText] = useState(entry ? entry.grams == null ? '' : displayQuantity(entry.grams, 'g') : '100');
  const [unit, setUnit] = useState<FoodUnit>('g');
  const [moreUnits, setMoreUnits] = useState(false);
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? initialMeal);
  const day = entry?.day ?? initialDay;
  const [name, setName] = useState(entry && !priorReference ? entry.name : '');
  const [kcal, setKcal] = useState(entry && !priorReference ? String(entry.kcal) : '');
  const [protein, setProtein] = useState(entry && !priorReference ? String(entry.protein) : '');
  const [carbs, setCarbs] = useState(entry && !priorReference ? String(entry.carbs) : '');
  const [fat, setFat] = useState(entry && !priorReference ? String(entry.fat) : '');
  const [manualUnit, setManualUnit] = useState<FoodUnit>(entry ? 'g' : measurementSystem === 'us' ? 'oz' : 'g');
  const [manualEquivalent, setManualEquivalent] = useState('');
  const [manualServingName, setManualServingName] = useState('serving');
  const [customSaved, setCustomSaved] = useState(false);
  const manualPhysical = useRef<number | null>(entry?.grams ?? null);
  const manualKnownMeasure = useRef<{ name: string | null; quantity: number | null; grams: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // The exact portion in grams. The text field shows a rounded view of it; only
  // typing a new quantity changes it.
  const physicalAmount = useRef<number | null>(entry ? entry.grams : 100);
  const [previewGrams, setPreviewGrams] = useState<number | null>(entry ? entry.grams : 100);
  const editedQuantity = useRef(false);
  const [error, setError] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (!entry?.id || !priorReference) return;
    let active = true;
    void Promise.all([foodEntryUnit(entry.id), entry.catalog_food_id ? catalogFoodById(entry.catalog_food_id) : Promise.resolve(null)])
      .then(([saved, catalog]) => {
        if (!active) return;
        const food = catalog ? catalogResult(catalog) : null;
        // Preserve the historical nutrient snapshot; the catalog lookup supplies only units.
        if (food) setSelected(previous => previous ? { ...previous, servingName: food.servingName, servingQuantity: food.servingQuantity, servingGrams: food.servingGrams, category: food.category } : previous);
        const measure = food ? { name: food.servingName ?? null, quantity: food.servingQuantity ?? null, grams: food.servingGrams ?? null } : null;
        if (saved && !editedQuantity.current && entry.grams && unitOptions(measure, measurementSystem).includes(saved.unit) && Math.abs(toGrams(saved.quantity, saved.unit, measure) - entry.grams) < 0.01) {
          physicalAmount.current = entry.grams;
          setPreviewGrams(entry.grams);
          setUnit(saved.unit); setQuantityText(displayQuantity(saved.quantity, saved.unit));
        }
      }).catch(() => { /* Legacy gram entry remains editable even without catalog metadata. */ });
    return () => { active = false; };
  }, [entry?.id, entry?.catalog_food_id, entry?.grams, priorReference, measurementSystem]);
  useEffect(() => {
    if (!entry?.id || priorReference) return;
    let active = true;
    void foodEntryUnit(entry.id).then(saved => {
      if (!active || !saved) return;
      setManualUnit(saved.unit);
      setQuantityText(displayQuantity(saved.quantity, saved.unit));
      if (saved.unit === 'serving' && saved.servingName) setManualServingName(saved.servingName);
      if (entry.grams && !['g', 'oz', 'kg', 'lb'].includes(saved.unit)) setManualEquivalent(displayQuantity(entry.grams, 'g'));
      manualPhysical.current = entry.grams;
      if (entry.grams && !['g', 'oz', 'kg', 'lb'].includes(saved.unit)) manualKnownMeasure.current = { name: saved.unit === 'serving' ? saved.servingName ?? 'serving' : saved.unit, quantity: saved.quantity, grams: entry.grams };
    }).catch(() => { /* Legacy manual entries stay editable in grams. */ });
    return () => { active = false; };
  }, [entry?.id, entry?.grams, priorReference]);
  useEffect(() => { let active = true; foodCategories().then(rows => { if (active) { setCategories(rows); setCatalogReady(true); } }).catch(() => { if (active) setCatalogReady(true); }); return () => { active = false; }; }, []);
  useEffect(() => { if (entry) return; let active = true; recentFoods().then(rows => { if (active) setRecents(rows); }).catch(() => undefined); return () => { active = false; }; }, [entry]);
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
  const measure = selected ? { name: selected.servingName ?? null, quantity: selected.servingQuantity ?? null, grams: selected.servingGrams ?? null } : null;
  const availableUnits = unitOptions(measure, measurementSystem);
  // Stable main row; an extra unit stays highlighted in the drawer and on the More button.
  const mainUnits = primaryUnits(availableUnits, availableUnits[0]);
  const extraUnits = availableUnits.filter(option => !mainUnits.includes(option));
  const unitLabel = (option: FoodUnit) => option === 'serving' ? servingLabel(measure!) : shortUnit[option] ?? option;
  const entered = Number(quantityText.trim().replace(',', '.'));
  const portion = selected?.basis === '100g' && Number.isFinite(entered) && entered > 0 ? previewGrams : null;
  const preview = selected ? selected.basis === '100g' ? portion ? portionNutrients(selected.nutrients, portion) : null : selected.nutrients : null;
  function applySelection(food: ReusableFood, grams: number, preferred: SavedFoodUnit | null = null) {
    const nextMeasure = { name: food.servingName ?? null, quantity: food.servingQuantity ?? null, grams: food.servingGrams ?? null };
    const options = unitOptions(nextMeasure, measurementSystem);
    let nextUnit = options[0];
    // Reuse the last unit only when it still describes exactly the same grams for this food.
    if (preferred && options.includes(preferred.unit)) {
      try { if (Math.abs(toGrams(preferred.quantity, preferred.unit, nextMeasure) - grams) < 0.01) nextUnit = preferred.unit; } catch { /* unit unavailable */ }
    }
    setSelected(food); setMoreUnits(false); setUnit(nextUnit);
    editedQuantity.current = false;
    physicalAmount.current = grams;
    setPreviewGrams(grams);
    setQuantityText(displayQuantity(fromGrams(grams, nextUnit, nextMeasure), nextUnit));
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function selectFood(food: ReusableFood) { applySelection(food, food.servingGrams ?? food.grams ?? 100, food.referenceUnit); }
  async function selectRecent(recent: RecentFood) {
    let food = recent.food;
    if (food.catalogId) {
      // Units come from the catalog row; the logged nutrient snapshot is kept.
      const row = await catalogFoodById(food.catalogId).catch(() => null);
      if (row) { const meta = catalogResult(row); food = { ...food, category: meta.category, servingName: meta.servingName, servingQuantity: meta.servingQuantity, servingGrams: meta.servingGrams, sourceLabel: meta.sourceLabel, sourceUrl: meta.sourceUrl, fiber: meta.fiber, sugar: meta.sugar, sodium: meta.sodium }; }
    }
    if (food.basis === '100g' && food.grams) applySelection(food, food.grams, recent.unit);
    else { setSelected(food); setMoreUnits(false); }
  }
  function changeQuantity(text: string) {
    editedQuantity.current = true;
    setQuantityText(text);
    const value = Number(text.trim().replace(',', '.'));
    try { physicalAmount.current = text.trim() && Number.isFinite(value) && value > 0 ? toGrams(value, unit, measure) : null; } catch { physicalAmount.current = null; }
    setPreviewGrams(physicalAmount.current);
  }
  function changeUnit(next: FoodUnit) {
    if (next === unit) return;
    // Same portion, new unit: only the displayed number changes.
    if (physicalAmount.current) setQuantityText(displayQuantity(fromGrams(physicalAmount.current, next, measure), next));
    else setQuantityText('');
    setUnit(next);
  }
  function switchMode(next: 'search' | 'manual') {
    if (next === mode) return;
    setMode(next); setSelected(null); setQuantityText(next === 'manual' ? '' : '100');
    physicalAmount.current = next === 'manual' ? null : 100; setPreviewGrams(physicalAmount.current); setUnit('g'); setError('');
  }
  const manualMainUnits: FoodUnit[] = measurementSystem === 'us' ? ['oz', 'g', 'serving'] : ['g', 'oz', 'serving'];
  const manualExtraUnits: FoodUnit[] = ['kg', 'lb', 'mL', 'L', 'US cup', 'US tbsp', 'US tsp', 'US fl oz'];
  function manualReference() {
    const quantity = parseQuantity(quantityText);
    const mass = ['g', 'oz', 'kg', 'lb'].includes(manualUnit);
    const equivalent = manualPhysical.current ?? (mass ? toGrams(quantity, manualUnit, null) : parseNumber(manualEquivalent, 'Gram equivalent', 10000));
    if (!equivalent || equivalent <= 0) throw Error('Enter the gram equivalent of this reference amount to save reusable food.');
    let exactQuantity = quantity;
    if (manualPhysical.current && (mass || manualUnit !== 'serving' || manualKnownMeasure.current?.name === (manualServingName.trim() || 'serving'))) {
      try { exactQuantity = fromGrams(equivalent, manualUnit, mass ? null : manualKnownMeasure.current); } catch { /* The user entered a new serving reference. */ }
    }
    const servingName = mass ? null : manualUnit === 'serving' ? manualServingName.trim() || 'serving' : manualUnit;
    const measure: CustomFoodMeasure = { unit: manualUnit, quantity: exactQuantity, servingName, servingQuantity: mass ? null : exactQuantity, servingGrams: equivalent };
    return { grams: equivalent, measure };
  }
  function manualNutrients(): Nutrients {
    return { kcal: parseNumber(kcal, 'Calories', 10000)!, protein: parseNumber(protein, 'Protein', 2000)!, carbs: parseNumber(carbs, 'Carbohydrates', 2000)!, fat: parseNumber(fat, 'Fat', 2000)! };
  }
  function changeManualUnit(next: FoodUnit) {
    if (next === manualUnit) return;
    try {
      const old = manualReference();
      if (old.measure.servingName) manualKnownMeasure.current = { name: old.measure.servingName, quantity: old.measure.servingQuantity, grams: old.measure.servingGrams };
      if (next === 'serving' && manualKnownMeasure.current?.name !== (manualServingName.trim() || 'serving')) throw Error('Serving size is unknown.');
      const converted = fromGrams(old.grams, next, manualKnownMeasure.current);
      setQuantityText(displayQuantity(converted, next));
      if (!['g', 'oz', 'kg', 'lb'].includes(next)) setManualEquivalent(displayQuantity(old.grams, 'g'));
      manualPhysical.current = old.grams;
    } catch {
      try { setQuantityText(displayQuantity(convertVolumeQuantity(parseQuantity(quantityText), manualUnit, next), next)); }
      catch { setQuantityText(''); }
      setManualEquivalent(''); manualPhysical.current = null;
    }
    setManualUnit(next); setCustomSaved(false);
  }
  function changeManualQuantity(value: string) {
    try {
      const next = parseQuantity(value);
      if (['g', 'oz', 'kg', 'lb'].includes(manualUnit)) manualPhysical.current = toGrams(next, manualUnit, null);
      else {
        const previous = parseQuantity(quantityText);
        const oldEquivalent = manualPhysical.current ?? parseNumber(manualEquivalent, 'Gram equivalent', 10000);
        if (oldEquivalent) { const grams = oldEquivalent * next / previous; manualPhysical.current = grams; setManualEquivalent(displayQuantity(grams, 'g')); }
        else manualPhysical.current = null;
      }
    } catch { manualPhysical.current = null; }
    setQuantityText(value); setCustomSaved(false);
  }
  async function saveDefinition() {
    if (saving.current || customSaved) return;
    try {
      const reference = manualReference();
      saving.current = true; setBusy(true); setError('');
      await saveCustomFood({ name, nutrients: manualNutrients(), ...reference });
      setCustomSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this food.'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function save() {
    if (saving.current) return;
    try {
      if (!validDay(day)) throw Error('Enter a valid date (day, month and year).');
      // Meals are stored under the chosen day; future logging is not part of the nutrition feature.
      if (day > dayKey()) throw Error('Meals can be logged for today or earlier.');
      let nutrients: Nutrients, foodName: string, amount: number | null = null, per100: Nutrients | null = null, foodId: string | null = null, enteredUnit: SavedFoodUnit | null = null;
      if (mode === 'search') {
        if (!selected) throw Error('Select a food or use Manual.');
        if (selected.missing?.length) throw Error(`Nutrition data is missing for ${selected.missing.join(', ')}. Use Manual to enter verified values.`);
        foodName = selected.name;
        if (selected.basis === '100g') {
          const typed = parseQuantity(quantityText);
          amount = physicalAmount.current ?? toGrams(typed, unit, measure);
          if (amount > 10000) throw Error('Portion must be at most 10,000 g.');
          per100 = selected.nutrients;
          nutrients = portionNutrients(per100, amount);
          foodId = selected.foodId;
          // Store the exact quantity in the chosen unit so reopening shows the same portion.
          enteredUnit = { unit, quantity: fromGrams(amount, unit, measure) };
        } else nutrients = selected.nutrients;
      } else {
        foodName = name.trim();
        nutrients = manualNutrients();
        if (quantityText.trim()) {
          parseQuantity(quantityText);
          if (['g', 'oz', 'kg', 'lb'].includes(manualUnit) || manualEquivalent.trim()) {
            const reference = manualReference();
            amount = reference.grams;
            enteredUnit = { unit: manualUnit, quantity: reference.measure.quantity, ...(manualUnit === 'serving' ? { servingName: manualServingName.trim() || 'serving' } : {}) };
          } else enteredUnit = { unit: manualUnit, quantity: parseQuantity(quantityText), ...(manualUnit === 'serving' ? { servingName: manualServingName.trim() || 'serving' } : {}) };
        }
      }
      saving.current = true; setBusy(true); setError('');
      await saveFoodEntry({ name: foodName, meal, day, grams: amount, ...nutrients }, { id: entry?.id, foodId, catalogId: selected?.catalogId ?? null, per100, enteredUnit });
      onSaved(day); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save food.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function remove() {
    if (!entry) return;
    confirm('Delete this food entry?', async () => { try { await deleteFoodEntry(entry.id); onSaved(entry.day); close(); } catch (cause) { message(cause); } }, 'This removes the entry from your diary. Saved custom foods remain available.', 'Delete entry');
  }
  const canSave = mode === 'manual' || !!selected;
  return <View style={{ flex: 1 }}>
    {!entry && <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>
      <Segmented options={['search', 'manual'] as const} value={mode} onChange={switchMode} tone="surface" label={item => item === 'search' ? 'Search' : 'Manual'}/>
    </View>}
    <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20, gap: 15 }}>
      {mode === 'search' ? selected ? <>
        <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 27, lineHeight: 31 }}>{selected.name}</Text>
        <Text style={{ color: colors.muted, marginTop: -8 }}>{Math.round(selected.nutrients.kcal)} kcal {selected.basis === '100g' ? '/ 100 g' : '/ saved serving'}{selected.catalogId ? ` · ${selected.category ?? 'Food'}` : ''}</Text>
        {selected.basis === '100g' && <View style={{ gap: 10 }}>
          <Field label={`Quantity (${unitLabel(unit)})`} value={quantityText} onChangeText={changeQuantity} keyboardType="decimal-pad"/>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, maxWidth: mainUnits.length * 92 }}><Segmented options={mainUnits} value={unit} onChange={changeUnit} label={unitLabel} accessibility={option => `Use ${unitLabel(option)}`}/></View>
            {extraUnits.length > 0 && <MotionPressable pressScale={0.96} accessibilityRole="button" accessibilityLabel="More units" accessibilityState={{ expanded: moreUnits }} onPress={() => setMoreUnits(value => !value)}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: extraUnits.includes(unit) ? colors.sun : colors.borderStrong, backgroundColor: extraUnits.includes(unit) ? colors.soft2 : colors.c8 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{extraUnits.includes(unit) ? unitLabel(unit) : 'More'}</Text>
              <Ionicons name={moreUnits ? 'chevron-up' : 'chevron-down'} size={15} color={colors.text}/>
            </MotionPressable>}
          </View>
          {extraUnits.length > 0 && <Reveal open={moreUnits}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2, paddingBottom: 2 }}>
              {extraUnits.map(option => <UnitChip key={option} label={unitLabel(option)} accessibility={`Use ${unitLabel(option)}`} selected={unit === option} onPress={() => changeUnit(option)}/>)}
            </View>
          </Reveal>}
        </View>}
        {preview && <View style={{ flexDirection: 'row', gap: 6 }}>{([['KCAL', preview.kcal], ['P', preview.protein], ['C', preview.carbs], ['F', preview.fat]] as const).map(([label, value]) => <View key={label} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 18, padding: 9 }}><Text style={{ color: colors.muted, fontSize: 10 }}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 21 }}>{Math.round(value)}</Text></View>)}</View>}
        {selected.catalogId && <Text style={{ color: colors.muted, fontSize: 12 }}>Per 100 g: fiber {selected.fiber ?? 'unknown'} g · sugars {selected.sugar ?? 'unknown'} g · sodium {selected.sodium ?? 'unknown'} mg</Text>}
        {!!selected.missing?.length && <Text accessibilityRole="alert" style={{ color: colors.danger }}>Missing nutrition: {selected.missing.join(', ')}. Enter verified values manually to log this food.</Text>}
        {selected.sourceLabel && <Text style={{ color: colors.muted, fontSize: 11 }}>Source: {selected.sourceUrl ? <Link href={selected.sourceUrl as `https://${string}`} style={{ textDecorationLine: 'underline' }}>{selected.sourceLabel}</Link> : selected.sourceLabel}</Text>}
        {selected.catalogId && <CatalogCredit/>}
        {!entry && <Button title="Back to results" kind="ghost" onPress={() => setSelected(null)}/>}
      </> : <>
        {recents.length > 0 && <View style={{ gap: 8 }}>
          <Text style={sectionLabel}>RECENT · ONE TAP TO LOG</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {recents.map(recent => <RecentChip key={recent.key} name={recent.food.name} onPress={() => void selectRecent(recent)}/>)}
          </ScrollView>
        </View>}
        <Field label="Search foods or barcode" value={query} onChangeText={setQuery} placeholder="Name, alternative name, or barcode"/>
        {!catalogReady && <Text style={{ color: colors.muted }}>Preparing your offline food library…</Text>}
        {!!categories.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 7 }}>{[null, ...categories].map(item => <UnitChip key={item ?? 'all'} label={item ?? 'All'} accessibility={item ?? 'All categories'} selected={category === item} onPress={() => setCategory(item)}/>)}</ScrollView>}
        {catalogReady && (results.length ? <View>{results.map(food => <Pressable key={food.key} accessibilityRole="button" onPress={() => selectFood(food)} style={{ minHeight: 57, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center' }}><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>{food.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{food.missing?.includes('Calories') ? 'Calories unknown' : `${Math.round(food.nutrients.kcal)} kcal`} · {food.catalogId ? `OpenNutrition · ${food.category ?? 'food'}` : food.basis === '100g' ? 'saved · per 100 g' : 'saved serving'}</Text></Pressable>)}</View> : <Text style={{ color: colors.muted }}>No foods found. Use Manual to enter your own values.</Text>)}
        <CatalogCredit/>
      </> : <>
        <Field label="Food name" value={name} onChangeText={value => { setName(value); setCustomSaved(false); }} placeholder="e.g. Homemade soup"/>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Nutrition values for the reference quantity below.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Calories (kcal)" value={kcal} onChangeText={value => { setKcal(value); setCustomSaved(false); }} keyboardType="decimal-pad"/></View><View style={{ flex: 1 }}><Field label="Protein (g)" value={protein} onChangeText={value => { setProtein(value); setCustomSaved(false); }} keyboardType="decimal-pad"/></View></View>
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Carbs (g)" value={carbs} onChangeText={value => { setCarbs(value); setCustomSaved(false); }} keyboardType="decimal-pad"/></View><View style={{ flex: 1 }}><Field label="Fat (g)" value={fat} onChangeText={value => { setFat(value); setCustomSaved(false); }} keyboardType="decimal-pad"/></View></View>
        <Field label={`Reference quantity (${manualUnit === 'serving' ? manualServingName || 'serving' : shortUnit[manualUnit] ?? manualUnit})`} value={quantityText} onChangeText={changeManualQuantity} keyboardType="decimal-pad"/>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1, maxWidth: 280 }}><Segmented options={manualMainUnits} value={manualUnit} onChange={changeManualUnit} label={item => item === 'serving' ? 'serving' : item}/></View><MotionPressable pressScale={0.96} accessibilityRole="button" accessibilityLabel="More units" accessibilityState={{ expanded: moreUnits }} onPress={() => setMoreUnits(value => !value)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: manualExtraUnits.includes(manualUnit) ? colors.sun : colors.borderStrong, backgroundColor: manualExtraUnits.includes(manualUnit) ? colors.soft2 : colors.c8 }}><Text style={{ color: colors.text, fontFamily: fonts.bold }}>{manualExtraUnits.includes(manualUnit) ? shortUnit[manualUnit] ?? manualUnit : 'More'} {moreUnits ? '⌃' : '⌄'}</Text></MotionPressable></View>
        <Reveal open={moreUnits}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 3 }}>{manualExtraUnits.map(item => <UnitChip key={item} label={shortUnit[item] ?? item} accessibility={`Use ${item}`} selected={manualUnit === item} onPress={() => changeManualUnit(item)}/>)}</View></Reveal>
        {manualUnit === 'serving' && <Field label="Serving name" value={manualServingName} onChangeText={value => { setManualServingName(value); setCustomSaved(false); }} placeholder="e.g. slice, bowl, piece"/>}
        {!['g', 'oz', 'kg', 'lb'].includes(manualUnit) && <Field label={`Gram equivalent of this ${manualUnit === 'serving' ? 'serving' : 'reference quantity'}`} value={manualEquivalent} onChangeText={value => { setManualEquivalent(value); manualPhysical.current = Number(value) > 0 ? Number(value) : null; setCustomSaved(false); }} keyboardType="decimal-pad" placeholder="Required only to save or convert"/>}
        {!entry && <MotionPressable pressScale={0.97} accessibilityRole="button" accessibilityLabel="Save food for later" disabled={busy || customSaved} onPress={() => void saveDefinition()} style={{ minHeight: 46, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: customSaved ? colors.sun : colors.accent, backgroundColor: customSaved ? colors.softLime : colors.card }}><Text style={{ color: colors.text, fontFamily: fonts.bold }}>{customSaved ? '✓ Saved to your foods' : busy ? 'Saving food…' : 'Save food for later'}</Text></MotionPressable>}
      </>}
      {canSave && <View style={{ gap: 8 }}><Text style={sectionLabel}>MEAL</Text><Segmented options={meals} value={meal} onChange={setMeal} label={title} compact/></View>}
      {entry && <Button title="Delete entry" kind="danger" onPress={remove}/>}
    </ScrollView>
    {(canSave || !!error) && <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 14, gap: 8, borderTopWidth: 1, borderTopColor: colors.c8Line, backgroundColor: colors.light ? colors.c8 : colors.card }}>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      {canSave && <Button title={busy ? 'Saving…' : entry ? 'Save entry' : 'Add food'} disabled={busy} onPress={save}/>}
    </View>}
  </View>;
}

/** First visit: shown in place of the dashboard until targets exist. Uses the shared target editor. */
export function TargetSetup({ onSaved }: { onSaved: () => void }) {
  return <View style={{ gap: 14, padding: 18, borderRadius: 26, backgroundColor: colors.c8, borderWidth: 1, borderColor: colors.c8Line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sun }}><Ionicons name="flame" size={22} color={colors.accentInk}/></View>
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 20, lineHeight: 24 }}>Set your daily targets</Text><Text style={{ color: colors.muted, fontSize: 12.5 }}>Used for your calorie ring and macro bars.</Text></View>
    </View>
    <NutritionTargetEditor onChanged={onSaved}/>
  </View>;
}

/** Nutrition → settings: the same target editor as Profile, then display mode and saved foods. */
export function TargetsSheet({ display, foods, close, onSaved, onDisplayChange }: { display: CalorieDisplay; foods: CustomFood[]; close: Close; onSaved: () => void; onDisplayChange: (mode: CalorieDisplay) => void }) {
  const [mode, setMode] = useState<CalorieDisplay>(display);
  async function changeMode(next: CalorieDisplay) {
    const previous = mode;
    setMode(next); onDisplayChange(next);
    try { await setCalorieDisplay(next); } catch (cause) { setMode(previous); onDisplayChange(previous); message(cause); }
  }
  function removeFood(food: CustomFood) { confirm(`Delete ${food.name}?`, async () => { try { await deleteCustomFood(food.id); onSaved(); } catch (cause) { message(cause); } }, 'Diary entries already logged with this food remain in your history.', 'Delete saved food'); }
  return <View style={{ gap: 16 }}>
    <NutritionTargetEditor intro={false} onChanged={onSaved} onSaved={() => close()}/>
    <View style={{ gap: 10 }}>
      <Text style={sectionLabel}>CALORIE RING SHOWS</Text>
      <Segmented options={['remaining', 'consumed'] as const} value={mode} onChange={next => void changeMode(next)} label={item => item === 'remaining' ? 'Calories left' : 'Calories eaten'}/>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{mode === 'remaining' ? 'Target minus what you have eaten, e.g. "2,380 kcal left".' : 'What you have eaten so far, e.g. "220 kcal consumed".'} The ring fills toward the same target either way.</Text>
    </View>
    <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 22, marginTop: 6 }}>Saved custom foods</Text>
    {foods.length ? foods.map(food => <View key={food.id} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontFamily: fonts.bold }}>{food.name}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{Math.round(food.kcal_100)} kcal / 100 g</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${food.name}`} onPress={() => removeFood(food)} style={{ padding: 10 }}><Text style={{ color: colors.danger }}>Delete</Text></Pressable></View>) : <Text style={{ color: colors.muted }}>No custom foods saved yet.</Text>}
  </View>;
}
