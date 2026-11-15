import { db } from './db';
import { uid, validDay } from '../core/date';
import { FoodInput, Meal, Nutrients, parseCalorieDisplay, pickRecentFoods, recentFoodIdentity, validateFood, type CalorieDisplay } from '../core/nutrition';
import type { FoodUnit } from '../core/foodUnits';

export type NutritionTarget = Nutrients & { id: string; owner_id: string; effective_day: string; created_at: string };
export type CustomFood = { id: string; owner_id: string; name: string; kcal_100: number; protein_100: number; carbs_100: number; fat_100: number; created_at: string };
export type FoodEntry = Nutrients & { id: string; owner_id: string; food_id: string | null; catalog_food_id: string | null; day: string; meal: Meal; name: string; grams: number | null; kcal_100: number | null; protein_100: number | null; carbs_100: number | null; fat_100: number | null; created_at: string };
export type ReusableFood = { key: string; name: string; basis: '100g' | 'serving'; nutrients: Nutrients; foodId: string | null; catalogId?: string | null; category?: string | null; servingName?: string | null; servingQuantity?: number | null; servingGrams?: number | null; missing?: string[]; fiber?: number | null; sugar?: number | null; sodium?: number | null; sourceLabel?: string | null; sourceUrl?: string | null; grams: number | null };

async function owner() {
  const profile = await (await db()).getFirstAsync<{ id: string }>('SELECT id FROM profile LIMIT 1');
  if (!profile) throw Error('Complete your fitness profile before logging nutrition.');
  return profile.id;
}
export async function nutritionEnabled() {
  const id = await owner();
  const row = await (await db()).getFirstAsync<{ enabled: number }>('SELECT enabled FROM nutrition_preferences WHERE owner_id=?', id);
  return row?.enabled !== 0;
}
export async function setNutritionEnabled(enabled: boolean) {
  const id = await owner();
  await (await db()).runAsync('INSERT INTO nutrition_preferences(owner_id,enabled) VALUES (?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled', id, enabled ? 1 : 0);
}
export async function nutritionTarget(day: string): Promise<NutritionTarget | null> {
  const id = await owner();
  return (await db()).getFirstAsync<NutritionTarget>('SELECT * FROM nutrition_targets WHERE owner_id=? AND effective_day<=? ORDER BY effective_day DESC LIMIT 1', id, day);
}
export async function saveNutritionTarget(day: string, nutrients: Nutrients) {
  const id = await owner();
  if (!validDay(day)) throw Error('Invalid target date.');
  if (!Number.isFinite(nutrients.kcal) || nutrients.kcal <= 0 || nutrients.kcal > 10000) throw Error('Calorie target must be between 1 and 10,000.');
  for (const value of [nutrients.protein, nutrients.carbs, nutrients.fat]) if (!Number.isFinite(value) || value < 0 || value > 2000) throw Error('Macro targets must be between 0 and 2,000 g.');
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => {
    const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM nutrition_targets WHERE owner_id=? AND effective_day=?', id, day);
    if (existing) await tx.runAsync('UPDATE nutrition_targets SET kcal=?,protein=?,carbs=?,fat=? WHERE id=? AND owner_id=?', nutrients.kcal, nutrients.protein, nutrients.carbs, nutrients.fat, existing.id, id);
    else await tx.runAsync('INSERT INTO nutrition_targets VALUES (?,?,?,?,?,?,?,?)', `${id}:${day}`, id, day, nutrients.kcal, nutrients.protein, nutrients.carbs, nutrients.fat, new Date().toISOString());
  });
}
/** The first target ever saved. Shown for days before any target existed so a
 * newly set goal also gives earlier diary days a meaningful ring. */
export async function firstNutritionTarget(): Promise<NutritionTarget | null> {
  const id = await owner();
  return (await db()).getFirstAsync<NutritionTarget>('SELECT * FROM nutrition_targets WHERE owner_id=? ORDER BY effective_day ASC LIMIT 1', id);
}
const CALORIE_DISPLAY_KEY = 'nutrition:calorie-display';
export async function calorieDisplay(): Promise<CalorieDisplay> {
  const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', CALORIE_DISPLAY_KEY);
  return parseCalorieDisplay(row?.value);
}
export async function setCalorieDisplay(mode: CalorieDisplay) {
  await (await db()).runAsync('INSERT OR REPLACE INTO preferences(key,value) VALUES (?,?)', CALORIE_DISPLAY_KEY, parseCalorieDisplay(mode));
}

export type RecentFood = { key: string; food: ReusableFood; unit: SavedFoodUnit | null };
/** Up to 10 distinct foods from the diary, most recently logged first. Derived
 * from saved entries, so only successfully logged foods appear. */
export async function recentFoods(limit = 10): Promise<RecentFood[]> {
  const id = await owner();
  const d = await db();
  const rows = await d.getAllAsync<FoodEntry>('SELECT * FROM food_entries WHERE owner_id=? ORDER BY created_at DESC LIMIT 300', id);
  const picked = pickRecentFoods(rows, limit);
  if (!picked.length) return [];
  const prefs = await d.getAllAsync<{ key: string; value: string }>(`SELECT key,value FROM preferences WHERE key IN (${picked.map(() => '?').join(',')})`, ...picked.map(entry => `food-unit:${entry.id}`));
  const units = new Map(prefs.map(row => [row.key, row.value]));
  return picked.map(entry => {
    const per100 = !!entry.grams && entry.kcal_100 !== null && entry.protein_100 !== null && entry.carbs_100 !== null && entry.fat_100 !== null;
    let unit: SavedFoodUnit | null = null;
    try {
      const parsed = JSON.parse(units.get(`food-unit:${entry.id}`) ?? 'null') as SavedFoodUnit | null;
      if (parsed && typeof parsed.unit === 'string' && Number.isFinite(parsed.quantity) && parsed.quantity > 0) unit = parsed;
    } catch { /* fall back to grams */ }
    return {
      key: recentFoodIdentity(entry),
      unit: per100 ? unit : null,
      food: {
        key: `recent:${entry.id}`, name: entry.name, basis: per100 ? '100g' : 'serving',
        nutrients: per100 ? { kcal: entry.kcal_100!, protein: entry.protein_100!, carbs: entry.carbs_100!, fat: entry.fat_100! } : { kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat },
        foodId: entry.food_id, catalogId: entry.catalog_food_id, grams: per100 ? entry.grams : null,
      },
    };
  });
}
export async function foodEntries(start: string, end: string): Promise<FoodEntry[]> {
  const id = await owner();
  return (await db()).getAllAsync<FoodEntry>('SELECT * FROM food_entries WHERE owner_id=? AND day BETWEEN ? AND ? ORDER BY day DESC, created_at DESC', id, start, end);
}
export type SavedFoodUnit = { unit: FoodUnit; quantity: number };
export async function foodEntryUnit(entryId: string): Promise<SavedFoodUnit | null> {
  const id = await owner();
  const d = await db();
  if (!(await d.getFirstAsync('SELECT 1 FROM food_entries WHERE id=? AND owner_id=?', entryId, id))) return null;
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', `food-unit:${entryId}`);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as SavedFoodUnit;
    return typeof parsed.unit === 'string' && Number.isFinite(parsed.quantity) && parsed.quantity > 0 ? parsed : null;
  } catch { return null; }
}
export async function saveFoodEntry(input: FoodInput, options: { id?: string; foodId?: string | null; catalogId?: string | null; per100?: Nutrients | null; saveCustom?: boolean; enteredUnit?: SavedFoodUnit | null } = {}) {
  const valid = validateFood(input);
  const id = await owner();
  const d = await db();
  const now = new Date().toISOString();
  const entryId = options.id ?? uid();
  await d.withExclusiveTransactionAsync(async tx => {
    if (options.id && !(await tx.getFirstAsync('SELECT 1 FROM food_entries WHERE id=? AND owner_id=?', options.id, id))) throw Error('Food entry was not found in this account.');
    let foodId = options.foodId ?? null;
    let reference = options.per100 ?? null;
    if (foodId && !(await tx.getFirstAsync('SELECT 1 FROM custom_foods WHERE id=? AND owner_id=?', foodId, id))) throw Error('Saved food was not found in this account.');
    if (options.saveCustom && valid.grams) {
      reference = { kcal: valid.kcal * 100 / valid.grams, protein: valid.protein * 100 / valid.grams, carbs: valid.carbs * 100 / valid.grams, fat: valid.fat * 100 / valid.grams };
      if (reference.kcal > 10000 || reference.protein > 2000 || reference.carbs > 2000 || reference.fat > 2000) throw Error('This portion is too small to save as a per-100 g food. Log it as a serving instead.');
      foodId = uid();
      await tx.runAsync('INSERT INTO custom_foods VALUES (?,?,?,?,?,?,?,?)', foodId, id, valid.name, reference.kcal, reference.protein, reference.carbs, reference.fat, now);
    }
    await tx.runAsync('INSERT INTO food_entries(id,owner_id,food_id,day,meal,name,grams,kcal,protein,carbs,fat,kcal_100,protein_100,carbs_100,fat_100,created_at,catalog_food_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET food_id=excluded.food_id,day=excluded.day,meal=excluded.meal,name=excluded.name,grams=excluded.grams,kcal=excluded.kcal,protein=excluded.protein,carbs=excluded.carbs,fat=excluded.fat,kcal_100=excluded.kcal_100,protein_100=excluded.protein_100,carbs_100=excluded.carbs_100,catalog_food_id=excluded.catalog_food_id', entryId, id, foodId, valid.day, valid.meal, valid.name, valid.grams ?? null, valid.kcal, valid.protein, valid.carbs, valid.fat, reference?.kcal ?? null, reference?.protein ?? null, reference?.carbs ?? null, reference?.fat ?? null, now, options.catalogId ?? null);
    if (options.enteredUnit && Number.isFinite(options.enteredUnit.quantity) && options.enteredUnit.quantity > 0 && valid.grams) {
      await tx.runAsync('INSERT OR REPLACE INTO preferences(key,value) VALUES (?,?)', `food-unit:${entryId}`, JSON.stringify(options.enteredUnit));
    } else await tx.runAsync('DELETE FROM preferences WHERE key=?', `food-unit:${entryId}`);
  });
  return entryId;
}
export async function deleteFoodEntry(entryId: string) {
  const id = await owner();
  await (await db()).withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('DELETE FROM food_entries WHERE id=? AND owner_id=?', entryId, id);
    await tx.runAsync('DELETE FROM preferences WHERE key=?', `food-unit:${entryId}`);
  });
}
export async function customFoods(): Promise<CustomFood[]> {
  const id = await owner();
  return (await db()).getAllAsync<CustomFood>('SELECT * FROM custom_foods WHERE owner_id=? ORDER BY name', id);
}
export async function deleteCustomFood(foodId: string) {
  const id = await owner();
  await (await db()).runAsync('DELETE FROM custom_foods WHERE id=? AND owner_id=?', foodId, id);
}
export async function reusableFoods(query: string): Promise<ReusableFood[]> {
  const id = await owner();
  const d = await db();
  const q = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`;
  const [foods, entries] = await Promise.all([
    d.getAllAsync<CustomFood>("SELECT * FROM custom_foods WHERE owner_id=? AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 30", id, q),
    d.getAllAsync<FoodEntry>("SELECT * FROM food_entries WHERE owner_id=? AND name LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 60", id, q),
  ]);
  const results: ReusableFood[] = foods.map(food => ({ key: food.id, name: food.name, basis: '100g', nutrients: { kcal: food.kcal_100, protein: food.protein_100, carbs: food.carbs_100, fat: food.fat_100 }, foodId: food.id, grams: 100 }));
  const seen = new Set(results.map(food => food.name.toLowerCase()));
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const per100 = entry.grams && entry.kcal_100 !== null && entry.protein_100 !== null && entry.carbs_100 !== null && entry.fat_100 !== null;
    results.push({ key: entry.id, name: entry.name, basis: per100 ? '100g' : 'serving', nutrients: per100 ? { kcal: entry.kcal_100!, protein: entry.protein_100!, carbs: entry.carbs_100!, fat: entry.fat_100! } : { kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }, foodId: entry.food_id, grams: per100 ? entry.grams : null });
  }
  return results.slice(0, 30);
}
