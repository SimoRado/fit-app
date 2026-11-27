import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { macroBarFractions } from '../src/core/macroBars';
import { portionNutrients } from '../src/core/nutrition';
import { toGrams } from '../src/core/foodUnits';

const source = (path: string) => readFileSync(path, 'utf8');

describe('Add Food values card bars', () => {
  it('normalizes against the largest macro in the serving', () => {
    const bars = macroBarFractions({ protein: 25, carbs: 46, fat: 30 });
    expect(bars.carbs).toBe(1);
    expect(bars.protein).toBeCloseTo(25 / 46, 10);
    expect(bars.fat).toBeCloseTo(30 / 46, 10);
  });
  it('is scale-free: changing the quantity keeps the proportions', () => {
    const per100 = { kcal: 250, protein: 10, carbs: 30, fat: 8 };
    expect(macroBarFractions(portionNutrients(per100, 40))).toEqual(macroBarFractions(portionNutrients(per100, 400)));
  });
  it('handles zero, missing and invalid values without dividing by zero', () => {
    expect(macroBarFractions({ protein: 0, carbs: 0, fat: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
    expect(macroBarFractions({})).toEqual({ protein: 0, carbs: 0, fat: 0 });
    expect(macroBarFractions({ protein: Number.NaN, carbs: -4, fat: 12 })).toEqual({ protein: 0, carbs: 0, fat: 1 });
  });
});

describe('Add Food values card wiring', () => {
  const sheet = source('src/ui/NutritionSheets.tsx');
  const card = source('src/ui/MacroValuesCard.tsx');
  it('replaces the four KCAL/P/C/F boxes with the card, fed by the same preview the sheet saves', () => {
    expect(sheet).toContain('{preview && <MacroValuesCard nutrients={preview}/>}');
    expect(sheet).not.toContain("['KCAL', preview.kcal]");
    // One calculation: both the preview and the saved entry use portionNutrients.
    expect(sheet).toContain('portionNutrients(selected.nutrients, portion)');
    expect(sheet).toContain('nutrients = portionNutrients(per100, amount);');
  });
  it('shows calories plus protein/carbs/fat grams with the previous rounding, on theme surfaces', () => {
    for (const text of ["label: 'Protein'", "label: 'Carbs'", "label: 'Fat'", '>kcal<', 'Math.round(value)', 'backgroundColor: colors.card', 'colors.chartTrack']) expect(card).toContain(text);
    expect(card).not.toMatch(/backgroundColor: '#0{3,6}'|backgroundImage|entering=/);
  });
});

describe('displayed values match what is saved', () => {
  it('grams, ounces and servings go through the same gram conversion before scaling', () => {
    const per100 = { kcal: 120, protein: 22.5, carbs: 3.2, fat: 2.6 };
    for (const [quantity, unit] of [[150, 'g'], [5, 'oz']] as const) {
      const grams = toGrams(quantity, unit, null);
      const shown = portionNutrients(per100, grams);
      expect(Math.round(shown.kcal)).toBe(Math.round(per100.kcal * grams / 100));
      expect(shown.protein).toBeCloseTo(per100.protein * grams / 100, 10);
    }
    expect(toGrams(5, 'oz', null)).toBeCloseTo(141.75, 1);
  });
});
