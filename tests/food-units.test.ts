import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { convertVolumeQuantity, displayQuantity, formatQuantity, fromGrams, parseMeasurementSystem, parseQuantity, toGrams, unitOptions } from '../src/core/foodUnits';
import { portionNutrients } from '../src/core/nutrition';
import { migrations } from '../src/data/schema';

const ricePackaged = { name: 'cup', quantity: 0.25, grams: 45 };
const riceCooked = { name: 'cup', quantity: 1, grams: 160 };

describe('food quantity and per-food units', () => {
  it('uses exact mass conversions and preserves calories through unit switches', () => {
    const grams = toGrams(2, 'oz', null);
    expect(grams).toBeCloseTo(56.69904625, 7);
    expect(toGrams(fromGrams(200, 'lb', null), 'lb', null)).toBeCloseTo(200, 9);
    expect(portionNutrients({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, grams).kcal).toBeCloseTo(93.5534263125, 7);
  });
  it('uses only this food row’s verified serving weight for volume', () => {
    expect(toGrams(1, 'US cup', ricePackaged)).toBe(180);
    expect(toGrams(1, 'US cup', riceCooked)).toBe(160);
    expect(toGrams(1, 'US tbsp', ricePackaged)).toBeCloseTo(11.25, 6);
    expect(toGrams(100, 'mL', { name: 'cup', quantity: 1, grams: 240 })).toBeCloseTo(101.442, 2);
    expect(toGrams(1, 'L', { name: 'mL', quantity: 100, grams: 103 })).toBeCloseTo(1030, 9);
  });
  it('does not infer density or household portions from a food name', () => {
    expect(convertVolumeQuantity(250, 'mL', 'L')).toBe(0.25);
    expect(() => convertVolumeQuantity(250, 'mL', 'g')).toThrow();
    expect(unitOptions({ name: 'cup', quantity: 1, grams: null }, 'metric')).not.toContain('mL');
    expect(() => toGrams(1, 'US cup', null)).toThrow();
    expect(() => toGrams(1, 'US tsp', { name: 'piece', quantity: 1, grams: 30 })).toThrow();
    expect(() => toGrams(1, 'US cup', { name: 'tsp', quantity: 1, grams: 2.3 })).toThrow();
    expect(unitOptions({ name: 'tsp', quantity: 1, grams: 2.3 }, 'metric')).not.toContain('US cup');
    expect(unitOptions({ name: 'piece', quantity: 1, grams: 30 }, 'metric')).toContain('serving');
  });
  it('validates decimal quantities and keeps switch formatting useful', () => {
    expect(parseQuantity('1,25')).toBe(1.25);
    expect(formatQuantity(fromGrams(200, 'oz', null))).toBe('7.054792');
    for (const input of ['0', '-1', 'abc', '1.2.3']) expect(() => parseQuantity(input)).toThrow();
  });
  it('shows readable quantities without changing the represented amount', () => {
    const grams = 180;
    expect(displayQuantity(fromGrams(grams, 'oz', null), 'oz')).toBe('6.35');
    expect(displayQuantity(fromGrams(grams, 'lb', null), 'lb')).toBe('0.397');
    expect(displayQuantity(fromGrams(grams, 'kg', null), 'kg')).toBe('0.18');
    expect(displayQuantity(184.93, 'g')).toBe('185');
    expect(displayQuantity(7.25, 'g')).toBe('7.3');
    expect(displayQuantity(0.0004, 'kg')).toBe('0.0004');
    expect(displayQuantity(1.5, 'serving')).toBe('1.5');
    // Round-tripping through several displayed units keeps the exact grams the caller holds.
    let held = grams;
    for (const unit of ['oz', 'lb', 'kg', 'g'] as const) held = toGrams(fromGrams(held, unit, null), unit, null);
    expect(held).toBeCloseTo(grams, 9);
  });
  it('defaults existing accounts to metric while preserving US selection', () => {
    expect(parseMeasurementSystem(null)).toBe('metric');
    expect(parseMeasurementSystem('us')).toBe('us');
    expect(unitOptions(null, 'metric')[0]).toBe('g');
    expect(unitOptions(null, 'us')[0]).toBe('oz');
    expect(unitOptions({ name: 'cup', quantity: 1, grams: 240 }, 'metric').slice(0, 2)).toEqual(['g', 'US cup']);
    expect(unitOptions({ name: 'cup', quantity: 1, grams: 240 }, 'us')[0]).toBe('US cup');
    expect(unitOptions({ name: 'tsp', quantity: 1, grams: 2.3 }, 'us').slice(0, 2)).toEqual(['US tsp', 'g']);
  });
});

describe('nutrition workflow regression', () => {
  it('keeps date and meal from the Nutrition calendar through the sheet save', () => {
    const screen = readFileSync('src/app/(tabs)/nutrition.tsx', 'utf8');
    const sheet = readFileSync('src/ui/NutritionSheets.tsx', 'utf8');
    expect(screen).toContain('day={selected}');
    expect(screen).toContain('meal={meal}');
    expect(sheet).toContain('const day = entry?.day ?? initialDay;');
    expect(sheet).toContain('saveFoodEntry({ name: foodName, meal, day, grams: amount');
    expect(sheet).not.toContain('<DateField');
  });
  it('stores unit preference in the existing account database without changing food rows', () => {
    const db = new DatabaseSync(':memory:');
    for (const migration of migrations) db.exec(migration);
    db.prepare('INSERT INTO preferences VALUES (?,?)').run('measurement_system', 'us');
    db.prepare('INSERT INTO preferences VALUES (?,?)').run('food-unit:test-entry', JSON.stringify({ unit: 'oz', quantity: 2 }));
    expect(db.prepare('SELECT value FROM preferences WHERE key=?').get('measurement_system')).toEqual({ value: 'us' });
    expect(JSON.parse((db.prepare('SELECT value FROM preferences WHERE key=?').get('food-unit:test-entry') as { value: string }).value)).toEqual({ unit: 'oz', quantity: 2 });
    expect(db.prepare('PRAGMA table_info(food_entries)').all().some(row => row.name === 'grams')).toBe(true);
    db.close();
  });
});
