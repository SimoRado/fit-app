/**
 * Volt compact set row (prototype `.setrow`: `set | prev | kg | reps | ✓` on one line).
 * The remove control sits beside the set number so the row never wraps or scrolls.
 * Column widths adapt to narrow Android screens while inputs stay ≥ 56dp wide.
 */
import React, { useState } from 'react';
import { Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { Exercise } from '../core/types';
import { setRowColumns as setColumns } from '../core/routineDraft';
import { Text } from './LocalizedText';
import { MotionPressable } from './MotionPressable';
import { useReducedMotion } from './motion';
import { fonts } from './theme';
import { isLight, usePalette } from './voltKit';

export type SetRowValues = { reps: string; weight: string; duration: string; note?: string };


/** Column captions shared by every row of an exercise, so columns stay aligned. */
export function SetHeader({ metric, live }: { metric: Exercise['metric']; live: boolean }) {
  const p = usePalette();
  const { width } = useWindowDimensions();
  const c = setColumns(width);
  const caption = { color: p.muted, fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.8, textAlign: 'center' as const };
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.gap, paddingBottom: 4 }}>
    <Text style={[caption, { width: c.set }]}>SET</Text>
    {live ? <Text style={[caption, { flex: 1 }]}>PREV</Text> : <View style={{ flex: 1 }}/>}
    {metric === 'weight_reps' && <Text style={[caption, { width: c.cell }]}>KG</Text>}
    <Text style={[caption, { width: c.cell }]}>{metric === 'duration' ? 'SEC' : 'REPS'}</Text>
    {live && <View style={{ width: c.check }}/>}
  </View>;
}

function Cell({ value, onChange, label, decimal, done, width, height }: { value: string; onChange: (text: string) => void; label: string; decimal: boolean; done: boolean; width: number; height: number }) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  const light = isLight(p);
  return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} selectTextOnFocus maxLength={decimal ? 6 : 5}
    placeholder="–" placeholderTextColor={p.subtle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={{ width, height, borderRadius: 16, paddingHorizontal: 4, textAlign: 'center', color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, fontVariant: ['tabular-nums'],
      backgroundColor: done ? (light ? p.softLime : 'rgba(226,110,229,0.16)') : focused ? p.c8 : (light ? p.soft1 : p.card2),
      borderWidth: focused ? 2 : 0, borderColor: p.accent }}/>;
}

function SetRowView({ index, metric, values, onChange, onRemove, live = false, previous, completed = false, onToggle, exerciseName }: {
  /** Identity of the parent exercise (index or key); part of the memo comparison so callbacks never target a moved exercise. */
  group: number | string;
  index: number; metric: Exercise['metric']; values: SetRowValues; onChange: (patch: Partial<SetRowValues>) => void; onRemove: () => void;
  live?: boolean; previous?: string; completed?: boolean; onToggle?: () => void; exerciseName: string;
}) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const c = setColumns(width);
  const [showNote, setShowNote] = useState(!!values.note);
  const label = `${exerciseName} set ${index + 1}`;
  return <Animated.View entering={reduced ? undefined : FadeInDown.duration(220)} exiting={reduced ? undefined : FadeOut.duration(140)} layout={reduced ? undefined : LinearTransition.duration(220)} style={{ paddingVertical: 3 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.gap }}>
      {/* Set number with an adjacent remove control (long-press the number for a set note when live). */}
      <View style={{ width: c.set, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        <Pressable accessibilityRole={live ? 'button' : 'text'} accessibilityLabel={live ? `${label}. Long press to add a note` : label} disabled={!live} onLongPress={() => setShowNote(value => !value)} style={{ minWidth: 18, alignItems: 'center' }}>
          <Text style={{ color: completed ? p.text : p.muted, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{index + 1}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={{ top: 12, bottom: 12, left: 6, right: 8 }} onPress={onRemove}
          style={({ pressed }) => ({ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? p.borderStrong : isLight(p) ? p.soft1 : p.card2 })}>
          <Ionicons name="remove" size={14} color={p.muted}/>
        </Pressable>
      </View>
      {live ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1, minWidth: 0, textAlign: 'center', color: p.subtle, fontFamily: fonts.semibold, fontSize: 12 }}>{previous ?? '—'}</Text> : <View style={{ flex: 1 }}/>}
      {metric === 'weight_reps' && <Cell value={values.weight} onChange={weight => onChange({ weight })} label={`${label} weight in kilograms`} decimal done={completed} width={c.cell} height={c.height}/>}
      {metric === 'duration'
        ? <Cell value={values.duration} onChange={duration => onChange({ duration })} label={`${label} duration in seconds`} decimal={false} done={completed} width={c.cell} height={c.height}/>
        : <Cell value={values.reps} onChange={reps => onChange({ reps })} label={`${label} repetitions`} decimal={false} done={completed} width={c.cell} height={c.height}/>}
      {live && <MotionPressable selected={completed} pressScale={0.86} accessibilityRole="checkbox" accessibilityState={{ checked: completed }} accessibilityLabel={`Mark ${label} complete`} hitSlop={4} onPress={onToggle}
        style={{ width: c.check, height: c.check, borderRadius: c.check / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: completed ? p.g1 : 'transparent', borderWidth: completed ? 0 : 2, borderColor: p.borderStrong }}>
        {completed && <Animated.View entering={reduced ? undefined : FadeIn.duration(160)}><Ionicons name="checkmark" size={20} color={p.plInk}/></Animated.View>}
      </MotionPressable>}
    </View>
    {live && showNote && <TextInput accessibilityLabel={`${label} note`} value={values.note ?? ''} onChangeText={note => onChange({ note })} placeholder="Set note" placeholderTextColor={p.subtle} maxLength={500}
      style={{ marginTop: 6, marginLeft: c.set + c.gap, minHeight: 38, borderRadius: 12, paddingHorizontal: 12, color: p.text, fontFamily: fonts.medium, fontSize: 13, backgroundColor: isLight(p) ? p.soft1 : p.card2 }}/>}
  </Animated.View>;
}

type SetRowProps = React.ComponentProps<typeof SetRowView>;
/**
 * Rows re-render only when their own data changes. Callbacks are intentionally not compared:
 * callers route them through refs or functional state updates, so an older closure still acts on
 * the latest workout/routine state.
 */
export const SetRow = React.memo(SetRowView, (a: SetRowProps, b: SetRowProps) =>
  a.group === b.group && a.index === b.index && a.metric === b.metric && a.live === b.live && a.previous === b.previous && a.completed === b.completed && a.exerciseName === b.exerciseName &&
  a.values.reps === b.values.reps && a.values.weight === b.values.weight && a.values.duration === b.values.duration && a.values.note === b.values.note);

/** Prototype `.addset`: dashed full-width "Add set" row. */
export function AddSetRow({ onPress, label = 'Add set', disabled }: { onPress: () => void; label?: string; disabled?: boolean }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={{ marginTop: 4, minHeight: 40, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }}>
    <Ionicons name="add" size={16} color={p.muted}/><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 12 }}>{label}</Text>
  </MotionPressable>;
}
