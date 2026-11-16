import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../src/data/schema';
import { calorieHeadline, parseCalorieDisplay, parseTargets, pickRecentFoods, portionNutrients, progressRatio, sumNutrients } from '../src/core/nutrition';
import { primaryUnits, unitOptions } from '../src/core/foodUnits';

// Minimal expo-sqlite surface over node:sqlite so the real data-layer SQL runs.
let raw: DatabaseSync;
const adapter = {
  getFirstAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).get(...(args as never[])) ?? null,
  getAllAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).all(...(args as never[])),
  runAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).run(...(args as never[])),
  withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => { raw.exec('BEGIN'); try { await fn(adapter); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
};
vi.mock('../src/data/db', () => ({ db: async () => adapter }));
const data = await import('../src/data/nutrition');

const stamp = '2026-11-06T12:00:00.000Z';
function seedProfile(id = 'me') {
  raw.prepare('INSERT INTO profile(id,name,birth_date,height_cm,start_weight,target_weight,experience,fitness_goal,growth_goals,language,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, 'Test', '1990-01-01', 170, 70, null, 'Beginner', 'Health', '', 'en', stamp);
}
const row = (id: string, name: string, created: string, extra: Partial<{ catalog_food_id: string | null; food_id: string | null; owner_id: string; grams: number | null }> = {}) => ({ id, name, created_at: created, catalog_food_id: null, food_id: null, owner_id: 'me', grams: 100, ...extra });
function insertEntry(entry: ReturnType<typeof row>, day = '2026-11-06') {
  raw.prepare('INSERT INTO food_entries(id,owner_id,food_id,day,meal,name,grams,kcal,protein,carbs,fat,kcal_100,protein_100,carbs_100,fat_100,created_at,catalog_food_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(entry.id, entry.owner_id, entry.food_id, day, 'lunch', entry.name, entry.grams, 100, 10, 10, 1, 100, 10, 10, 1, entry.created_at, entry.catalog_food_id);
}

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  for (const migration of migrations) raw.exec(migration);
});

describe('recent foods', () => {
  it('reopens a saved measured food from the same account database', async () => {
    raw.close();
    const folder = mkdtempSync(join(tmpdir(), 'cuby-saved-food-'));
    const file = join(folder, 'account.db');
    try {
      raw = new DatabaseSync(file);
      for (const migration of migrations) raw.exec(migration);
      seedProfile();
      await data.saveCustomFood({ name: 'Oats portion', nutrients: { kcal: 150, protein: 5, carbs: 27, fat: 3 }, grams: 40,
        measure: { unit: 'serving', quantity: 1, servingName: 'portion', servingQuantity: 1, servingGrams: 40 } });
      raw.close();
      raw = new DatabaseSync(file);
      expect((await data.reusableFoods('Oats portion'))[0]).toMatchObject({ name: 'Oats portion', servingName: 'portion', referenceUnit: { unit: 'serving', quantity: 1 } });
    } finally { raw.close(); rmSync(folder, { recursive: true, force: true }); }
  });
  it('saves a reusable soup without a diary entry and preserves its measured reference', async () => {
    seedProfile();
    raw.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    const foodId = await data.saveCustomFood({ name: 'Test soup', nutrients: { kcal: 120, protein: 6, carbs: 15, fat: 4 }, grams: 260,
      measure: { unit: 'mL', quantity: 250, servingName: 'mL', servingQuantity: 250, servingGrams: 260 } });
    expect(await data.foodEntries('2026-11-01', '2026-11-30')).toHaveLength(0);
    const saved = (await data.reusableFoods('Test soup'))[0];
    expect(saved).toMatchObject({ foodId, servingName: 'mL', servingQuantity: 250, servingGrams: 260, referenceUnit: { unit: 'mL', quantity: 250 } });
    expect(saved.nutrients.kcal).toBeCloseTo(120 * 100 / 260);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE kind IN ('custom_foods','preferences')").get()).toEqual({ n: 2 });
    for (const [grams, day, meal] of [[260, '2026-11-05', 'breakfast'], [520, '2026-11-06', 'lunch']] as const) {
      await data.saveFoodEntry({ name: saved.name, day, meal, grams, ...portionNutrients(saved.nutrients, grams) },
        { foodId, per100: saved.nutrients, enteredUnit: { unit: 'mL', quantity: grams === 260 ? 250 : 500 } });
    }
    const first = (await data.foodEntries('2026-11-05', '2026-11-05'))[0];
    const second = (await data.foodEntries('2026-11-06', '2026-11-06'))[0];
    expect(first).toMatchObject({ food_id: foodId, meal: 'breakfast', kcal: 120, protein: 6, carbs: 15, fat: 4 });
    expect(second).toMatchObject({ food_id: foodId, meal: 'lunch', kcal: 240, protein: 12, carbs: 30, fat: 8 });
    expect(await data.foodEntryUnit(second.id)).toMatchObject({ unit: 'mL', quantity: 500 });
    await data.saveFoodEntry({ name: first.name, day: first.day, meal: 'snacks', grams: first.grams, kcal: first.kcal, protein: first.protein, carbs: first.carbs, fat: first.fat },
      { id: first.id, foodId, per100: saved.nutrients, enteredUnit: { unit: 'mL', quantity: 250 } });
    expect((await data.foodEntries('2026-11-05', '2026-11-05'))[0]).toMatchObject({ meal: 'snacks', kcal: 120, grams: 260 });
    await expect(data.saveCustomFood({ name: 'Invalid', nutrients: { kcal: 120, protein: 6, carbs: 15, fat: 4 }, grams: 0,
      measure: { unit: 'mL', quantity: 250, servingName: 'mL', servingQuantity: 250, servingGrams: 0 } })).rejects.toThrow();
    expect((await data.reusableFoods('Invalid'))).toHaveLength(0);
  });
  it('orders by most recent log, dedupes by food identity and caps at 10', () => {
    const entries = [
      row('a', 'Banana', '2026-11-06T08:00:00Z', { catalog_food_id: 'c1' }),
      row('b', 'Banana (ripe)', '2026-11-06T09:00:00Z', { catalog_food_id: 'c1' }),
      row('c', 'Rice', '2026-11-06T07:00:00Z'),
      row('d', 'rice ', '2026-11-05T07:00:00Z'),
      ...Array.from({ length: 12 }, (_, i) => row(`x${i}`, `Food ${i}`, `2026-11-01T0${i % 10}:00:00Z`, { food_id: `f${i}` })),
    ];
    const picked = pickRecentFoods(entries);
    expect(picked).toHaveLength(10);
    expect(picked[0].id).toBe('b');
    expect(picked.filter(item => item.catalog_food_id === 'c1')).toHaveLength(1);
    expect(picked.filter(item => item.name.trim().toLowerCase() === 'rice')).toHaveLength(1);
  });

  it('reads only this account, persists, and keeps the last unit for prefill', async () => {
    seedProfile();
    insertEntry(row('e1', 'Greek yogurt', '2026-11-06T08:00:00Z', { catalog_food_id: 'y1', grams: 170 }));
    insertEntry(row('e2', 'Chicken breast', '2026-11-06T09:00:00Z', { grams: 200 }));
    raw.prepare('INSERT INTO preferences(key,value) VALUES (?,?)').run('food-unit:e1', JSON.stringify({ unit: 'oz', quantity: 170 / 28.349523125 }));
    const recents = await data.recentFoods();
    expect(recents.map(item => item.food.name)).toEqual(['Chicken breast', 'Greek yogurt']);
    expect(recents[1].unit?.unit).toBe('oz');
    expect(recents[1].food).toMatchObject({ basis: '100g', grams: 170, catalogId: 'y1' });
  });

  it('only includes entries that were actually saved', async () => {
    seedProfile();
    expect(await data.recentFoods()).toEqual([]);
    await data.saveFoodEntry({ name: 'Rice', meal: 'dinner', day: '2026-11-05', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.4 }, { per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } });
    await expect(data.saveFoodEntry({ name: '', meal: 'dinner', day: '2026-11-05', kcal: 1, protein: 0, carbs: 0, fat: 0 })).rejects.toThrow();
    expect((await data.recentFoods()).map(item => item.food.name)).toEqual(['Rice']);
  });
});

describe('date-specific logging', () => {
  it('retains a manually entered volume even when its gram equivalent is unknown', async () => {
    seedProfile();
    const id = await data.saveFoodEntry({ name: 'Unmeasured soup', meal: 'dinner', day: '2026-11-04', grams: null, kcal: 120, protein: 6, carbs: 15, fat: 4 },
      { enteredUnit: { unit: 'mL', quantity: 250 } });
    expect((await data.foodEntries('2026-11-04', '2026-11-04'))[0]).toMatchObject({ grams: null, kcal: 120, meal: 'dinner' });
    expect(await data.foodEntryUnit(id)).toMatchObject({ unit: 'mL', quantity: 250 });
  });
  it('stores a backdated entry under the selected day, not today', async () => {
    seedProfile();
    await data.saveFoodEntry({ name: 'Toast', meal: 'breakfast', day: '2026-11-04', grams: 50, kcal: 130, protein: 4, carbs: 24, fat: 2 });
    const entries = await data.foodEntries('2026-11-04', '2026-11-04');
    expect(entries).toHaveLength(1);
    expect(entries[0].day).toBe('2026-11-04');
    expect(await data.foodEntries('2026-11-05', '2026-11-06')).toHaveLength(0);
  });
});

describe('nutrition targets and display preference', () => {
  it('validates targets: calories required and positive, macros optional', () => {
    expect(parseTargets({ kcal: '2600', protein: '120', carbs: '', fat: '70' })).toEqual({ kcal: 2600, protein: 120, carbs: 0, fat: 70 });
    for (const kcal of ['', '0', '-5', 'abc']) expect(() => parseTargets({ kcal, protein: '', carbs: '', fat: '' })).toThrow();
    expect(() => parseTargets({ kcal: '2000', protein: '-1', carbs: '', fat: '' })).toThrow();
    // Macro energy does not have to equal the calorie target.
    expect(parseTargets({ kcal: '1500', protein: '200', carbs: '300', fat: '100' }).kcal).toBe(1500);
  });

  it('persists targets without overwriting earlier days and finds the first one', async () => {
    seedProfile();
    expect(await data.firstNutritionTarget()).toBeNull();
    await data.saveNutritionTarget('2026-11-01', { kcal: 2400, protein: 120, carbs: 250, fat: 70 });
    await data.saveNutritionTarget('2026-11-06', { kcal: 2600, protein: 130, carbs: 280, fat: 75 });
    expect((await data.firstNutritionTarget())?.kcal).toBe(2400);
    expect((await data.nutritionTarget('2026-11-03'))?.kcal).toBe(2400);
    expect((await data.nutritionTarget('2026-11-06'))?.kcal).toBe(2600);
  });

  it('persists the calorie display preference', async () => {
    expect(await data.calorieDisplay()).toBe('remaining');
    await data.setCalorieDisplay('consumed');
    expect(await data.calorieDisplay()).toBe('consumed');
    expect(parseCalorieDisplay('junk')).toBe('remaining');
  });

  it('shows the same logs and target in both modes, never a misleading positive balance', () => {
    expect(calorieHeadline(220, 2600, 'remaining')).toEqual({ value: 2380, label: 'kcal left', over: false });
    expect(calorieHeadline(220, 2600, 'consumed')).toEqual({ value: 220, label: 'kcal consumed', over: false });
    expect(calorieHeadline(2900, 2600, 'remaining')).toEqual({ value: 300, label: 'kcal over target', over: true });
    expect(calorieHeadline(2900, 2600, 'consumed')).toMatchObject({ value: 2900, over: true });
    expect(calorieHeadline(500, null, 'remaining')).toMatchObject({ value: 500, label: 'kcal consumed' });
  });
});

describe('ring and macro progress', () => {
  it('maps consumed / target and caps the visual at 100% while totals stay true', () => {
    expect(progressRatio(0, 2600)).toBe(0);
    expect(progressRatio(650, 2600)).toBe(0.25);
    expect(progressRatio(1300, 2600)).toBe(0.5);
    expect(progressRatio(2600, 2600)).toBe(1);
    expect(progressRatio(3100, 2600)).toBe(1);
    expect(sumNutrients([{ kcal: 2000, protein: 90, carbs: 200, fat: 50 }, { kcal: 1100, protein: 40, carbs: 100, fat: 30 }]).protein).toBe(130);
  });
});

describe('main unit selection', () => {
  it('shows two or three everyday units and keeps bulk units under More', () => {
    expect(primaryUnits(unitOptions(null, 'metric'), 'g')).toEqual(['g', 'oz']);
    expect(primaryUnits(unitOptions({ name: 'piece', quantity: 1, grams: 118 }, 'metric'), 'g')).toEqual(['g', 'oz', 'serving']);
    expect(primaryUnits(unitOptions(null, 'us'), 'oz')).toEqual(['oz', 'g']);
    const cup = unitOptions({ name: 'cup', quantity: 1, grams: 160 }, 'metric');
    expect(primaryUnits(cup, 'g')).toHaveLength(3);
    expect(primaryUnits(cup, 'g')).not.toContain('kg');
  });
});
