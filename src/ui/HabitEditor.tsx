import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, TextInput, View, type HostInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './LocalizedText';
import { fonts, radii } from './theme';
import { confirm, message } from './components';
import { BloomSwitch } from './MotionBlocks';
import { MotionPressable } from './MotionPressable';
import { Segmented } from './NutritionSheets';
import { usePalette } from './voltKit';
import { useReducedMotion } from './motion';
import { WheelTimePicker, WHEEL_HEIGHT, deviceUses12h } from './WheelTimePicker';
import { HabitGlyph, groupColors } from './HabitVisuals';
import { useApp } from '../state/app';
import { repo } from '../data/db';
import { uid } from '../core/date';
import type { Habit } from '../core/types';
import { reminderTimes, validReminderTime } from '../core/habitExtras';
import { HABIT_GROUPS, HABIT_ICON_IDS, HABIT_ICONS, WEEKDAYS, displayTime, frequencyLabel, frequencyPreset, habitGroup, isHabitIconId, normalizeDays, type FrequencyPreset, type HabitGroup } from '../core/habitDesign';
import { reconcileReminders, requestReminderPermission } from '../services/reminders';

type Close = (after?: () => void) => void;
const PICKER_HEIGHT = WHEEL_HEIGHT + 76;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Volt "New habit" sheet content (references 2–3). Lives in a fixed-layout
 * BottomSheet: scrolling form + pinned footer action. Also used for editing.
 * Writes only existing synced columns (no schema change):
 *   category → Body | Mind | Routine, icon → stable id,
 *   frequency/days/weekly_target → WHEN presets,
 *   reminder_times → the scheduled time ("[]" for Anytime),
 *   reminder_enabled → notifications, off unless the user turns them on.
 */
export function HabitEditor({ habit, startDay, initialMode = 'time', close, onSaved }: { habit: Habit | null; startDay: string; initialMode?: 'time' | 'anytime'; close: Close; onSaved: (saved?: Habit) => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { profile, language } = useApp();
  const hour12 = useMemo(() => deviceUses12h(), []);
  const existingTimes = habit ? reminderTimes(habit) : [];
  const [name, setName] = useState(habit?.name ?? '');
  const [group, setGroup] = useState<HabitGroup>(habit ? habitGroup(habit.category) : 'Body');
  const [icon, setIcon] = useState<string>(habit?.icon ?? HABIT_GROUPS[0].defaultIcon);
  const iconTouched = useRef(!!habit);
  const [preset, setPreset] = useState<FrequencyPreset>(habit ? frequencyPreset(habit) : 'daily');
  const [customKind] = useState<'days' | 'quota'>(habit?.frequency === 'quota' ? 'quota' : 'days');
  const [customDays, setCustomDays] = useState(habit?.frequency === 'days' ? normalizeDays(habit.days) : '1,3,5');
  const [quota, setQuota] = useState(habit?.frequency === 'quota' ? habit.weekly_target : 3);
  const [mode, setMode] = useState<'time' | 'anytime'>(habit ? (existingTimes.length ? 'time' : 'anytime') : initialMode);
  const [time, setTime] = useState(existingTimes[0] ?? '07:30');
  const [remind, setRemind] = useState(!!habit?.reminder_enabled);
  const [measured, setMeasured] = useState(habit?.habit_type === 'quantity');
  const [target, setTarget] = useState(String(habit?.target_value ?? 1)), [unit, setUnit] = useState(habit?.unit ?? ''), [step, setStep] = useState(String(habit?.increment ?? 1));
  const [archived, setArchived] = useState(!!habit?.archived);
  const [picker, setPicker] = useState<{ top: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const root = useRef<HostInstance>(null);
  const timePill = useRef<HostInstance>(null);

  const colors = groupColors(p, group);
  const fields = (): Pick<Habit, 'frequency' | 'days' | 'weekly_target'> =>
    preset === 'daily' ? { frequency: 'daily', days: '0,1,2,3,4,5,6', weekly_target: 7 }
      : preset === 'weekdays' ? { frequency: 'days', days: WEEKDAYS, weekly_target: 5 }
        : preset === 'quota3' ? { frequency: 'quota', days: habit?.days ?? '0,1,2,3,4,5,6', weekly_target: 3 }
          : customKind === 'quota' ? { frequency: 'quota', days: habit?.days ?? '0,1,2,3,4,5,6', weekly_target: quota }
            : { frequency: 'days', days: customDays, weekly_target: Math.max(1, customDays.split(',').filter(Boolean).length) };
  const whenLabel = `${frequencyLabel(fields())} · ${mode === 'time' ? displayTime(time, hour12) : 'Anytime'}`;
  const suggestions = HABIT_GROUPS.find(item => item.id === group)!.suggestions;

  function chooseGroup(next: HabitGroup) {
    setGroup(next);
    // Follow the category's icon until the user picks one; never touch the typed name.
    if (!iconTouched.current) setIcon(HABIT_GROUPS.find(item => item.id === next)!.defaultIcon);
  }
  function openPicker() {
    Keyboard.dismiss();
    const anchor = timePill.current, container = root.current;
    if (!anchor || !container) return setPicker({ top: 8 });
    container.measureInWindow((_x, rootY, _w, rootH) => anchor.measureInWindow((_ax, pillY, _aw, pillH) => {
      const above = pillY - rootY - PICKER_HEIGHT - 8;
      // Prefer above the field; otherwise below it, always inside the sheet.
      const top = above >= 8 ? above : Math.min(pillY - rootY + pillH + 8, rootH - PICKER_HEIGHT - 8);
      setPicker({ top: Math.max(8, top) });
    }));
  }
  function toggleDay(day: number) {
    const set = new Set(customDays.split(',').filter(Boolean).map(Number));
    if (set.has(day)) set.delete(day); else set.add(day);
    setCustomDays([...set].sort((a, b) => a - b).join(','));
  }

  async function save() {
    if (saving.current) return;
    try {
      if (!profile) throw Error('Complete your profile first.');
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 120) throw Error('Give your habit a name (up to 120 characters).');
      const when = fields();
      if (when.frequency === 'days' && !when.days) throw Error('Pick at least one day.');
      if (mode === 'time' && !validReminderTime(time)) throw Error('Choose a valid time.');
      const amount = Number(target.replace(',', '.')), tap = Number(step.replace(',', '.'));
      if (measured && (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !Number.isFinite(tap) || tap <= 0 || tap > 1000000)) throw Error('Enter a positive target and step.');
      saving.current = true; setBusy(true); setError('');
      const notify = mode === 'time' && remind;
      if (notify && !(await requestReminderPermission(language))) throw Error('Allow notifications to get reminders, or turn the reminder off.');
      const times = mode === 'time' ? [time] : [];
      const saved: Habit = {
        id: habit?.id ?? uid(), owner_id: profile.id, name: trimmed, description: habit?.description ?? '', category: group, icon,
        ...when, start_date: habit?.start_date ?? startDay, archived: Number(archived), created_at: habit?.created_at ?? new Date().toISOString(),
        reminder_time: times[0] ?? null, reminder_enabled: Number(notify), reminder_times: JSON.stringify(times),
        habit_type: measured ? 'quantity' : 'boolean', target_value: measured ? amount : 1, unit: measured ? unit.trim() : '', increment: measured ? tap : 1,
        sort_order: habit?.sort_order,
      };
      await repo.saveHabit(saved);
      if (notify) await repo.setPreference('habit_reminders', 'on');
      // Show the saved habit at once; notification rescheduling (slow on Android) follows in the background.
      onSaved(saved); close();
      void reconcileReminders();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this habit.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function remove() {
    if (!habit) return;
    confirm(`Delete “${habit.name}”?`, async () => {
      try { await repo.deleteHabit(habit.id); onSaved(); close(); void reconcileReminders(); } catch (cause) { message(cause); }
    }, 'This removes the habit. Days already in History keep their results.', 'Delete habit');
  }

  const label = { color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.7 } as const;
  const chip = (on: boolean) => ({ minHeight: 40, paddingHorizontal: 16, justifyContent: 'center' as const, borderRadius: radii.pill, borderWidth: 1, borderColor: on ? p.text : p.borderStrong, backgroundColor: on ? p.text : p.c8 });
  const title = name.trim() || 'Your habit';
  return <View ref={root} collapsable={false} style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, gap: 12 }}>
      {/* Live preview */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, borderWidth: 1.2, borderStyle: 'dashed', borderColor: p.borderStrong }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.solid }}><HabitGlyph icon={icon} size={20} color={colors.ink} filled/></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: name.trim() ? p.text : p.muted, fontFamily: fonts.displayHeavy, fontSize: 15.5 }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{whenLabel}</Text>
        </View>
        <Text style={{ ...label, fontSize: 10 }}>PREVIEW</Text>
      </View>

      <Text style={label}>NAME</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Give your habit a name" placeholderTextColor={p.subtle} maxLength={120} returnKeyType="done" accessibilityLabel="Habit name"
        style={{ minHeight: 52, paddingHorizontal: 18, borderRadius: radii.pill, borderWidth: 1, borderColor: p.borderStrong, backgroundColor: p.c8, color: p.text, fontFamily: fonts.semibold, fontSize: 15.5, marginTop: -4 }}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {suggestions.map(item => <MotionPressable key={item} pressScale={0.96} accessibilityRole="button" accessibilityLabel={`Use name ${item}`} onPress={() => setName(item)} style={{ ...chip(false), minHeight: 36, paddingHorizontal: 14 }}>
          <Text style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 12.5 }}>{item}</Text>
        </MotionPressable>)}
      </ScrollView>

      <Text style={label}>TYPE</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8, marginTop: -4 }}>
        {HABIT_GROUPS.map(item => {
          const on = item.id === group;
          return <MotionPressable key={item.id} selected={on} pressScale={0.97} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${item.id}, ${item.subtitle}`} onPress={() => chooseGroup(item.id)}
            style={{ flex: 1, minWidth: 0, gap: 4, paddingVertical: 12, paddingHorizontal: 11, borderRadius: 18, borderWidth: 1.5, borderColor: on ? p.text : 'transparent', backgroundColor: on ? p.c8 : 'transparent' }}>
            <View style={{ width: 22, height: 5, borderRadius: 3, backgroundColor: groupColors(p, item.id).solid }}/>
            <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14.5, marginTop: 3 }}>{item.id}</Text>
            <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 11 }}>{item.subtitle}</Text>
          </MotionPressable>;
        })}
      </View>

      <Text style={label}>ICON</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6, marginTop: -4 }}>
        {HABIT_ICON_IDS.map(id => {
          const on = icon === id;
          return <MotionPressable key={id} selected={on} pressScale={0.9} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={HABIT_ICONS[id].label}
            onPress={() => { iconTouched.current = true; setIcon(id); }}
            style={{ flex: 1, aspectRatio: 1, maxWidth: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? p.text : p.c8, borderWidth: on ? 0 : 1, borderColor: p.c8Line }}>
            <HabitGlyph icon={id} size={17} color={on ? p.bg : p.text} filled={on}/>
          </MotionPressable>;
        })}
      </View>
      {!isHabitIconId(icon) && <Text style={{ color: p.muted, fontSize: 12 }}>Current icon: {icon}. Pick one above to switch to the Volt set.</Text>}

      <Text style={label}>WHEN</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
        {([['daily', 'Daily'], ['weekdays', 'Weekdays'], ['quota3', '3× a week'], ['custom', customKind === 'quota' ? `${quota}× a week` : 'Pick days']] as const).map(([value, text]) => {
          const on = preset === value;
          return <MotionPressable key={value} selected={on} pressScale={0.96} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPreset(value)} style={chip(on)}>
            <Text style={{ color: on ? p.bg : p.text, fontFamily: fonts.bold, fontSize: 13 }}>{text}</Text>
          </MotionPressable>;
        })}
      </View>
      {preset === 'custom' && customKind === 'days' && <View style={{ flexDirection: 'row', gap: 6 }}>
        {DAY_ORDER.map(day => { const on = customDays.split(',').includes(String(day)); return <Pressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]} onPress={() => toggleDay(day)}
          style={{ flex: 1, aspectRatio: 1, maxWidth: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? p.text : p.c8, borderWidth: on ? 0 : 1, borderColor: p.borderStrong }}>
          <Text style={{ color: on ? p.bg : p.text, fontFamily: fonts.bold, fontSize: 13 }}>{DAY_LETTER[day]}</Text>
        </Pressable>; })}
      </View>}
      {preset === 'custom' && customKind === 'quota' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: p.text, fontFamily: fonts.semibold }}>Times per week</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fewer" disabled={quota <= 1} onPress={() => setQuota(value => Math.max(1, value - 1))} style={{ ...chip(false), opacity: quota <= 1 ? 0.4 : 1 }}><Ionicons name="remove" size={18} color={p.text}/></Pressable>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, minWidth: 22, textAlign: 'center' }}>{quota}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={quota >= 7} onPress={() => setQuota(value => Math.min(7, value + 1))} style={{ ...chip(false), opacity: quota >= 7 ? 0.4 : 1 }}><Ionicons name="add" size={18} color={p.text}/></Pressable>
      </View>}

      <View style={{ alignSelf: 'flex-start', minWidth: 210 }}>
        <Segmented options={['time', 'anytime'] as const} value={mode} onChange={setMode} tone="surface" label={item => item === 'time' ? 'At a time' : 'Anytime'}/>
      </View>
      {mode === 'time' && <>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 15 }}>Time</Text>
          <View ref={timePill} collapsable={false}>
            <MotionPressable pressScale={0.97} accessibilityRole="button" accessibilityLabel={`Time, ${displayTime(time, hour12)}. Change`} onPress={openPicker}
              style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderRadius: radii.pill, borderWidth: 1, borderColor: picker ? p.text : p.borderStrong, backgroundColor: p.c8 }}>
              <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 16, fontVariant: ['tabular-nums'] }}>{displayTime(time, hour12)}</Text>
              <Ionicons name="time-outline" size={18} color={p.text}/>
            </MotionPressable>
          </View>
        </View>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}><Text style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 15 }}>Remind me</Text><Text style={{ color: p.muted, fontSize: 12 }}>A notification at this time. Off unless you turn it on.</Text></View>
          <BloomSwitch label="Remind me" value={remind} onChange={() => setRemind(value => !value)}/>
        </View>
      </>}

      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}><Text style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 15 }}>Track an amount</Text><Text style={{ color: p.muted, fontSize: 12 }}>For example 20 min or 2 L. Minutes also set the schedule length.</Text></View>
        <BloomSwitch label="Track an amount" value={measured} onChange={() => setMeasured(value => !value)}/>
      </View>
      {measured && <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['Daily target', target, setTarget, 'decimal-pad'], ['Unit', unit, setUnit, 'default'], ['Per tap', step, setStep, 'decimal-pad']] as const).map(([text, value, set, keyboard]) => <View key={text} style={{ flex: 1, gap: 4 }}>
          <Text style={label}>{text.toUpperCase()}</Text>
          <TextInput value={value} onChangeText={set} keyboardType={keyboard} accessibilityLabel={text} placeholder={text === 'Unit' ? 'min' : ''} placeholderTextColor={p.subtle}
            style={{ minHeight: 46, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: p.borderStrong, backgroundColor: p.c8, color: p.text, fontFamily: fonts.semibold, fontSize: 15 }}/>
        </View>)}
      </View>}

      {habit && <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Pressable accessibilityRole="button" onPress={() => setArchived(value => !value)} style={{ ...chip(false), flex: 1, alignItems: 'center' }}><Text style={{ color: p.text, fontFamily: fonts.bold }}>{archived ? 'Restore habit' : 'Archive habit'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={remove} style={{ ...chip(false), flex: 1, alignItems: 'center', borderColor: p.danger }}><Text style={{ color: p.danger, fontFamily: fonts.bold }}>Delete habit</Text></Pressable>
      </View>}
    </ScrollView>

    <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 14, gap: 8, borderTopWidth: 1, borderTopColor: p.c8Line, backgroundColor: p.light ? p.bg : p.card }}>
      {error ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{error}</Text> : null}
      <MotionPressable pressScale={0.98} accessibilityRole="button" disabled={busy} onPress={() => { void save(); }}
        style={{ minHeight: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: p.text, opacity: busy ? 0.6 : 1 }}>
        <Text numberOfLines={1} style={{ color: p.bg, fontFamily: fonts.bold, fontSize: 15.5 }}>{busy ? 'Saving…' : habit ? 'Save changes' : name.trim() ? `Create “${name.trim()}”` : 'Create habit'}</Text>
      </MotionPressable>
    </View>

    {picker && <>
      <Pressable accessibilityRole="button" accessibilityLabel="Close time picker" onPress={() => setPicker(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}/>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} exiting={reduced ? undefined : FadeOut.duration(120)} style={{ position: 'absolute', top: picker.top, right: 20, width: 260 }}>
        <WheelTimePicker value={time} hour12={hour12} onCancel={() => setPicker(null)} onConfirm={next => { setTime(next); setPicker(null); }}/>
      </Animated.View>
    </>}
  </View>;
}
