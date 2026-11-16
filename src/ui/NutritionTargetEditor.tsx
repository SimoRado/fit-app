import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { Button, message } from './components';
import { MotionPressable } from './MotionPressable';
import { fonts, radii } from './theme';
import { usePalette, type VoltIcon } from './voltKit';
import { dayKey } from '../core/date';
import type { Nutrients } from '../core/nutrition';
import { macroCalories, stepTarget, targetLimits, type TargetsMode } from '../core/nutritionTargets';
import { nutritionTarget } from '../data/nutrition';
import { currentEstimate, resetToEstimate, saveCustomTargets, syncAutoTargets, targetsMode } from '../data/nutritionPlan';

const num = (value: number) => Math.round(value).toLocaleString('en-US');

function RoundButton({ icon, label, onPress, disabled }: { icon: VoltIcon; label: string; onPress: () => void; disabled?: boolean }) {
  const p = usePalette();
  const light = p.bg === '#F5F9FF';
  return <MotionPressable pressScale={0.9} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={4}
    style={{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: p.c8, opacity: disabled ? 0.4 : 1, ...(light ? { shadowColor: p.navShadow, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 } : { borderWidth: 1, borderColor: p.borderStrong }) }}>
    <Ionicons name={icon} size={22} color={p.text}/>
  </MotionPressable>;
}

const targetRows: { key: keyof Nutrients; label: string; unit: string; noun: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'KCAL', noun: 'calories' },
  { key: 'protein', label: 'Protein', unit: 'G', noun: 'protein' },
  { key: 'carbs', label: 'Carbs', unit: 'G', noun: 'carbs' },
  { key: 'fat', label: 'Fat', unit: 'G', noun: 'fat' },
];
type Draft = Record<keyof Nutrients, string>;
const toDraft = (value: Nutrients): Draft => ({ kcal: String(Math.round(value.kcal)), protein: String(Math.round(value.protein)), carbs: String(Math.round(value.carbs)), fat: String(Math.round(value.fat)) });
/** Large editable number whose width follows the rendered digits, so the unit sits right after them. */
function BigNumberInput({ value, label, onChangeText, onFocus, onBlur }: { value: string; label: string; onChangeText: (text: string) => void; onFocus: () => void; onBlur: () => void }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const font = { fontFamily: fonts.displayHeavy, fontSize: 30, includeFontPadding: false } as const;
  return <View>
    <Text accessible={false} onLayout={event => setWidth(Math.ceil(event.nativeEvent.layout.width))} style={[font, { position: 'absolute', opacity: 0 }]}>{value || '0'}</Text>
    <TextInput accessibilityLabel={label} value={value} keyboardType="number-pad" selectTextOnFocus maxLength={5} onChangeText={onChangeText} onFocus={onFocus} onBlur={onBlur}
      style={[font, { width: width ? width + 6 : undefined, minWidth: 24, color: p.text, padding: 0 }]}/>
  </View>;
}
const draftNumber = (text: string) => { const value = Number(text.replace(/[^\d]/g, '')); return Number.isFinite(value) ? value : 0; };

/**
 * The one nutrition-target editor, used by Profile → Nutrition targets,
 * Nutrition → settings and the first-run setup. Saves today's target as a
 * custom target (earlier days keep theirs); Reset returns to the estimate.
 * `onChanged` runs after any write; `onSaved` only after Save.
 */
export function NutritionTargetEditor({ onChanged, onSaved, intro = true }: { onChanged: () => void; onSaved?: () => void; intro?: boolean }) {
  const p = usePalette();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof currentEstimate>>>(null);
  const [mode, setMode] = useState<TargetsMode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<keyof Nutrients | null>(null);
  async function load() {
    await syncAutoTargets();
    const [target, nextEstimate, nextMode] = await Promise.all([nutritionTarget(dayKey()), currentEstimate(), targetsMode()]);
    const base = target ?? nextEstimate;
    if (base) { setDraft(toDraft(base)); setSaved(toDraft(base)); }
    setEstimate(nextEstimate); setMode(nextMode);
  }
  useEffect(() => { void load().catch(message); }, []);
  if (!draft) return <ActivityIndicator color={p.accent} style={{ marginVertical: 30 }}/>;
  const values = { kcal: draftNumber(draft.kcal), protein: draftNumber(draft.protein), carbs: draftNumber(draft.carbs), fat: draftNumber(draft.fat) };
  const dirty = !!saved && (Object.keys(draft) as (keyof Nutrients)[]).some(key => draftNumber(draft[key]) !== draftNumber(saved[key]));
  const macroKcal = macroCalories(values);
  const step = (key: keyof Nutrients, direction: 1 | -1) => setDraft(current => current && ({ ...current, [key]: String(stepTarget(key, draftNumber(current[key]), direction)) }));

  async function save() {
    if (busy) return;
    setError('');
    if (values.kcal < targetLimits.kcal.min || values.kcal > targetLimits.kcal.max) { setError(`Calories must be between ${num(targetLimits.kcal.min)} and ${num(targetLimits.kcal.max)}.`); return; }
    for (const key of ['protein', 'carbs', 'fat'] as const) if (values[key] > targetLimits[key].max) { setError('Macro targets must be between 0 and 2,000 g.'); return; }
    setBusy(true);
    try { await saveCustomTargets(values); setSaved(toDraft(values)); onChanged(); onSaved?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save targets.'); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (busy) return;
    setBusy(true); setError('');
    try { await resetToEstimate(); await load(); onChanged(); }
    catch (cause) { message(cause); }
    finally { setBusy(false); }
  }

  return <View style={{ gap: 4 }}>
    {intro && estimate && <Text style={{ color: p.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 6 }}>{`Your estimate is about ${num(estimate.kcal)} kcal a day (maintenance ≈ ${num(estimate.maintenance)}), adjusted gently for your goal and never below a safe floor. It is an estimate, not medical advice — adjust any value below.`}</Text>}
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: mode === 'auto' && !dirty ? p.chipBg : p.soft1, marginBottom: 4 }}>
      <Ionicons name={mode === 'auto' && !dirty ? 'sparkles' : 'create-outline'} size={12} color={p.chipFg}/>
      <Text style={{ color: p.chipFg, fontFamily: fonts.bold, fontSize: 11 }}>{mode === 'auto' && !dirty ? 'Auto · follows your goal' : 'Custom · set by you'}</Text>
    </View>
    {targetRows.map((row, index) => <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: index < targetRows.length - 1 ? 1 : 0, borderBottomColor: p.border }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9 }}>{row.label.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <BigNumberInput label={`${row.label} target`} value={focused === row.key ? draft[row.key] : num(draftNumber(draft[row.key]))}
            onFocus={() => setFocused(row.key)}
            onChangeText={text => setDraft(current => current && ({ ...current, [row.key]: text.replace(/[^\d]/g, '') }))}
            onBlur={() => { setFocused(null); setDraft(current => current && ({ ...current, [row.key]: String(draftNumber(current[row.key])) })); }}/>
          <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 11 }}>{row.unit}</Text>
        </View>
      </View>
      <RoundButton icon="remove" label={`Decrease ${row.noun}`} onPress={() => step(row.key, -1)} disabled={values[row.key] <= targetLimits[row.key].min}/>
      <RoundButton icon="add" label={`Increase ${row.noun}`} onPress={() => step(row.key, 1)} disabled={values[row.key] >= targetLimits[row.key].max}/>
    </View>)}
    <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{`Macros add up to ${num(macroKcal)} kcal${Math.abs(macroKcal - values.kcal) > 100 ? ` — ${num(Math.abs(macroKcal - values.kcal))} kcal ${macroKcal > values.kcal ? 'above' : 'below'} your calorie target` : ''}. Steps: calories ±50, macros ±5 g.`}</Text>
    {estimate && values.kcal < estimate.floor && <Text style={{ color: p.danger, fontSize: 12, lineHeight: 17 }}>{`This is below the safe floor we use for your estimate (${num(estimate.floor)} kcal). Consider checking with a professional before eating this little.`}</Text>}
    {error ? <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 12.5 }}>{error}</Text> : null}
    <View style={{ gap: 8, marginTop: 10 }}>
      <Button title={busy ? 'Saving…' : 'Save targets'} disabled={busy || !dirty} onPress={save}/>
      {/* Always rendered so the sheet does not change height (and shift the buttons) on the first edit. */}
      <Button title="Reset to estimate" kind="ghost" disabled={busy || (mode === 'auto' && !dirty)} onPress={reset}/>
    </View>
    <Text style={{ color: p.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>Changes apply from today; earlier days keep their targets.</Text>
  </View>;
}
