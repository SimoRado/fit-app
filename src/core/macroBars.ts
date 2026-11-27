/**
 * Add Food "Values Style" bars: each macro's share of the largest macro in the current serving.
 * Visualization only — the gram values shown next to the bars stay authoritative, and nothing here
 * changes stored nutrients. No daily targets or invented maximums are involved.
 */
export type MacroAmounts = { protein: number; carbs: number; fat: number };

const safe = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** Fractions in 0…1 relative to the largest macro; all zero (no division) when the serving has none. */
export function macroBarFractions(amounts: Partial<MacroAmounts>): MacroAmounts {
  const protein = safe(amounts.protein), carbs = safe(amounts.carbs), fat = safe(amounts.fat);
  const max = Math.max(protein, carbs, fat);
  if (max === 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: protein / max, carbs: carbs / max, fat: fat / max };
}
