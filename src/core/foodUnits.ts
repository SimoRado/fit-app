/** All nutrition remains stored in grams. A volume unit requires a serving weight
 * supplied by this exact catalog row; food names never imply density. */
export type MeasurementSystem = 'metric' | 'us';
export type FoodUnit = 'g' | 'kg' | 'oz' | 'lb' | 'mL' | 'L' | 'US cup' | 'US tbsp' | 'US tsp' | 'US fl oz' | 'serving';
export type ServingMeasure = { name: string | null; quantity: number | null; grams: number | null };

const massGrams: Partial<Record<FoodUnit, number>> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const volumeMl: Partial<Record<FoodUnit, number>> = { mL: 1, L: 1000, 'US cup': 236.5882365, 'US tbsp': 14.78676478125, 'US tsp': 4.92892159375, 'US fl oz': 29.5735295625 };
const servingVolume: Record<string, FoodUnit> = { cup: 'US cup', cups: 'US cup', tbsp: 'US tbsp', tablespoon: 'US tbsp', tablespoons: 'US tbsp', tsp: 'US tsp', teaspoon: 'US tsp', teaspoons: 'US tsp', 'fl oz': 'US fl oz', 'fluid ounce': 'US fl oz', ml: 'mL', l: 'L' };
const servingMass = new Set(['g', 'gram', 'grams', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds']);
const relatedVolume: Partial<Record<FoodUnit, FoodUnit[]>> = {
  'US cup': ['US cup', 'mL', 'US tbsp'],
  'US tbsp': ['US tbsp', 'US tsp', 'mL'],
  'US tsp': ['US tsp', 'US tbsp'],
  'US fl oz': ['US fl oz', 'mL', 'US cup'],
  mL: ['mL', 'L', 'US fl oz', 'US cup', 'US tbsp'],
  L: ['L', 'mL', 'US fl oz', 'US cup'],
};

export function servingLabel(measure: ServingMeasure) {
  return measure.name?.trim() || 'serving';
}
export function unitOptions(measure: ServingMeasure | null | undefined, system: MeasurementSystem): FoodUnit[] {
  const volume = measure?.name ? servingVolume[measure.name.trim().toLowerCase()] : undefined;
  const verified = !!measure && Number.isFinite(measure.grams) && (measure.grams ?? 0) > 0 && Number.isFinite(measure.quantity) && (measure.quantity ?? 0) > 0;
  const mass: FoodUnit[] = system === 'us' ? ['oz', 'g', 'lb', 'kg'] : ['g', 'oz', 'kg', 'lb'];
  if (!verified) return mass;
  if (volume) {
    const related = relatedVolume[volume] ?? [volume];
    const metricFirst = volume === 'mL' || volume === 'L' ? 'mL' : 'g';
    const volumes: FoodUnit[] = system === 'us'
      ? [volume === 'mL' || volume === 'L' ? 'US fl oz' : volume, 'g', ...related]
      : [metricFirst, metricFirst === 'g' ? volume : 'g', ...related];
    return [...new Set([...volumes, ...mass])];
  }
  if (measure?.name && !servingMass.has(measure.name.trim().toLowerCase())) return [...mass.slice(0, 2), 'serving', ...mass.slice(2)];
  return mass;
}
export function gramsPerUnit(unit: FoodUnit, measure: ServingMeasure | null | undefined): number | null {
  if (massGrams[unit]) return massGrams[unit]!;
  if (!measure || !Number.isFinite(measure.grams) || !Number.isFinite(measure.quantity) || (measure.grams ?? 0) <= 0 || (measure.quantity ?? 0) <= 0) return null;
  if (unit === 'serving') return measure.grams! / measure.quantity!;
  const base = measure.name ? servingVolume[measure.name.trim().toLowerCase()] : undefined;
  if (!base || !relatedVolume[base]?.includes(unit) || !volumeMl[base] || !volumeMl[unit]) return null;
  return measure.grams! / (measure.quantity! * volumeMl[base]!) * volumeMl[unit]!;
}
export function toGrams(amount: number, unit: FoodUnit, measure: ServingMeasure | null | undefined) {
  const factor = gramsPerUnit(unit, measure);
  if (!Number.isFinite(amount) || amount <= 0 || !factor) throw Error('This measurement is unavailable for this food.');
  return amount * factor;
}
export function fromGrams(grams: number, unit: FoodUnit, measure: ServingMeasure | null | undefined) {
  const factor = gramsPerUnit(unit, measure);
  if (!Number.isFinite(grams) || grams <= 0 || !factor) throw Error('This measurement is unavailable for this food.');
  return grams / factor;
}
/** Convert volume without claiming a food-specific mass or density. */
export function convertVolumeQuantity(amount: number, from: FoodUnit, to: FoodUnit) {
  const first = volumeMl[from], second = volumeMl[to];
  if (!Number.isFinite(amount) || amount <= 0 || !first || !second) throw Error('These units cannot be converted without a measured serving.');
  return amount * first / second;
}
export function parseQuantity(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) throw Error('Enter a valid quantity.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw Error('Quantity must be above zero.');
  return amount;
}
export function formatQuantity(value: number) { return String(Number(value.toFixed(6))); }

// Readable precision per unit. Display only: the logged amount stays the exact
// gram value held by the caller, so switching units never changes the portion.
const displayDecimals: Record<FoodUnit, number> = { g: 1, mL: 1, oz: 2, 'US fl oz': 2, kg: 3, lb: 3, L: 3, 'US cup': 2, 'US tbsp': 2, 'US tsp': 2, serving: 2 };
export function displayQuantity(value: number, unit: FoodUnit) {
  if (!Number.isFinite(value) || value <= 0) return '';
  // Small-unit amounts of 10 or more read best as whole numbers ("185 g", not "184.9 g").
  let decimals = (unit === 'g' || unit === 'mL') && value >= 10 ? 0 : value >= 100 ? Math.min(1, displayDecimals[unit]) : displayDecimals[unit];
  // Never round a real amount down to zero.
  while (Number(value.toFixed(decimals)) === 0 && decimals < 6) decimals++;
  return String(Number(value.toFixed(decimals)));
}
export function parseMeasurementSystem(value: string | null | undefined): MeasurementSystem { return value === 'us' ? 'us' : 'metric'; }

const bulkUnits: FoodUnit[] = ['kg', 'lb', 'L'];
/** Main segmented units: everyday units (up to 3); bulk units go under "More". The selected unit is always visible. */
export function primaryUnits(available: FoodUnit[], selected: FoodUnit): FoodUnit[] {
  const everyday = available.filter(option => !bulkUnits.includes(option));
  const main = (everyday.length >= 2 ? everyday : available).slice(0, 3);
  if (main.includes(selected) || !available.includes(selected)) return main;
  return [...main.slice(0, main.length - 1), selected];
}

