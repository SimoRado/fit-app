import { addDays, validDay } from './date';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type Nutrients = { kcal: number; protein: number; carbs: number; fat: number };
export type FoodInput = Nutrients & { name: string; meal: Meal; day: string; grams?: number | null };
export const meals: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const zeroNutrients = (): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
export const sumNutrients = (rows: Nutrients[]): Nutrients => rows.reduce((total, row) => ({ kcal: total.kcal + row.kcal, protein: total.protein + row.protein, carbs: total.carbs + row.carbs, fat: total.fat + row.fat }), zeroNutrients());
export const calorieBalance = (target: number | null, consumed: number) => target === null ? { amount: consumed, label: 'KCAL CONSUMED', over: false } : consumed > target ? { amount: consumed - target, label: 'KCAL OVER', over: true } : { amount: target - consumed, label: 'KCAL LEFT', over: false };
export const progressRatio = (consumed: number, target: number | null) => target && target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
export const portionNutrients = (per100: Nutrients, grams: number): Nutrients => ({ kcal: per100.kcal * grams / 100, protein: per100.protein * grams / 100, carbs: per100.carbs * grams / 100, fat: per100.fat * grams / 100 });
export const nutritionWeek = (today: string) => Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
export function validateFood(input: FoodInput) {
  if (!input.name.trim() || input.name.trim().length > 120) throw Error('Enter a food name (up to 120 characters).');
  if (!meals.includes(input.meal)) throw Error('Choose a meal.');
  if (!validDay(input.day)) throw Error('Enter a valid date in YYYY-MM-DD format.');
  for (const [name, value, max] of [['Calories', input.kcal, 10000], ['Protein', input.protein, 2000], ['Carbohydrates', input.carbs, 2000], ['Fat', input.fat, 2000]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > max) throw Error(`${name} must be between 0 and ${max}.`);
  }
  if (input.grams != null && (!Number.isFinite(input.grams) || input.grams <= 0 || input.grams > 10000)) throw Error('Portion must be between 0 and 10,000 g.');
  return { ...input, name: input.name.trim() };
}
export function parseNumber(text: string, label: string, max: number, optional = false) {
  if (optional && !text.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text.trim())) throw Error(`Enter a valid ${label.toLowerCase()}.`);
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > max) throw Error(`${label} must be between 0 and ${max}.`);
  return value;
}
export function weekStats(days: { logged: boolean; nutrients: Nutrients; target: Nutrients | null }[]) {
  const logged = days.filter(day => day.logged);
  const sum = sumNutrients(logged.map(day => day.nutrients));
  return { loggedDays: logged.length, average: logged.length ? { kcal: sum.kcal / logged.length, protein: sum.protein / logged.length, carbs: sum.carbs / logged.length, fat: sum.fat / logged.length } : zeroNutrients(), nearTarget: logged.filter(day => day.target && Math.abs(day.nutrients.kcal - day.target.kcal) <= day.target.kcal * .1).length, proteinDays: logged.filter(day => day.target?.protein && day.nutrients.protein >= day.target.protein * .9).length };
}
