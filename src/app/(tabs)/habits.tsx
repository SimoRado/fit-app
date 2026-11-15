import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay, weekStart } from '../../core/date';
import { habitDone, habitRate, habitStreak, scheduled } from '../../core/logic';
import { Habit, HabitCompletion, HabitProgress } from '../../core/types';
import { filterHabits, habitProgressOn, reminderTimes, weeklyConsistency } from '../../core/habitExtras';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { Button, Field, Page, confirm, message } from '../../ui/components';
import { BottomSheet } from '../../ui/BottomSheet';
import { fonts } from '../../ui/theme';
import { reconcileReminders } from '../../services/reminders';
import { MotionPressable } from '../../ui/MotionPressable';
import { CircleButton, EmptyAction, MiniBar, SectionLink, VCard, isLight, useEntering, usePalette, type VoltIcon } from '../../ui/voltKit';

/**
 * Volt Habits (prototype `hab12`): summary header, segmented day bar, week strip,
 * a timed schedule and an "Anytime" list. Interactions are tap-only by design —
 * the prototype's swipe-to-complete/edit/delete gestures are intentionally not used;
 * the row's "⋯" button opens the same actions in a sheet.
 */
export default function Habits() {
  const { changed, language } = useApp();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [progress, setProgress] = useState<HabitProgress[]>([]);
  const [selected, setSelected] = useState(dayKey());
  const [category, setCategory] = useState('All Habits');
  const [summaryWeek, setSummaryWeek] = useState(weekStart(dayKey()));
  const [amountDraft, setAmountDraft] = useState('');
  const [menu, setMenu] = useState<Habit | null>(null);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions(), repo.habitProgress()]).then(([allHabits, allCompletions, allProgress]) => {
      setHabits(allHabits); setCompletions(allCompletions); setProgress(allProgress);
    }).catch(message);
  }, [revision]);

  const ordered = filterHabits(habits, category);
  const due = ordered.filter(habit => !habit.archived && scheduled(habit, selected));
  const categories = ['All Habits', ...new Set(habits.map(habit => habit.category || 'Other'))];
  const summary = weeklyConsistency(habits, completions, progress, summaryWeek, today);
  const isDone = (habit: Habit, day = selected) => {
    const row = habitProgressOn(progress, habit.id, day);
    return habit.habit_type === 'quantity' ? !!row && row.amount >= row.target_snapshot : habitDone(habit, completions, day);
  };
  const doneCount = due.filter(habit => isDone(habit)).length;
  const timed = due.filter(habit => reminderTimes(habit).length).sort((a, b) => reminderTimes(a)[0].localeCompare(reminderTimes(b)[0]));
  const anytime = due.filter(habit => !reminderTimes(habit).length);
  const notDue = ordered.filter(habit => !due.includes(habit));
  const nowTime = new Date().toTimeString().slice(0, 5);

  async function setCompletion(id: string, completed: boolean) {
    try { await repo.setHabitCompletion(id, today, completed); changed(); }
    catch (error) { message(error); }
  }
  async function addAmount(habit: Habit) {
    try {
      const current = habitProgressOn(progress, habit.id, selected)?.amount ?? 0;
      const next = Math.round((current + (habit.increment ?? 1)) * 10000) / 10000;
      await repo.setHabitAmount(habit.id, selected, next); changed();
    } catch (error) { message(error); }
  }
  async function resetAmount(habit: Habit) { try { await repo.setHabitAmount(habit.id, selected, 0); changed(); } catch (error) { message(error); } }
  async function saveAmount(habit: Habit) {
    if (!/^\d+(\.\d+)?$/.test(amountDraft.trim())) throw Error('Enter a valid nonnegative total.');
    await repo.setHabitAmount(habit.id, selected, Number(amountDraft));
    changed();
  }
  async function move(id: string, direction: -1 | 1) { try { await repo.moveHabit(id, direction); changed(); } catch (error) { message(error); } }
  async function deleteHabit(id: string) {
    try { await repo.remove('habits', id); await reconcileReminders(); changed(); }
    catch (error) { message(error); }
  }
  /** Primary tap action for the round check button. */
  const primary = (habit: Habit) => {
    if (habit.habit_type === 'quantity') return selected <= today ? addAmount(habit) : undefined;
    if (selected === today) return setCompletion(habit.id, !isDone(habit));
    return undefined;
  };
  const canAct = (habit: Habit) => habit.habit_type === 'quantity' ? selected <= today : selected === today;
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(fromDay(selected));
  const menuProgress = menu ? habitProgressOn(progress, menu.id, selected) : undefined;

  return <Page title="" >
    {/* .top — eyebrow + calendar/history + add */}
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>{selected === today ? `Today · ${dayLabel}` : dayLabel}</Text>
      {selected !== today && <CircleButton icon="today-outline" label="Back to today" onPress={() => setSelected(today)}/>}
      <CircleButton icon="add" tone="accent" label="Create habit" onPress={() => router.push('/habit-form')}/>
    </View>
    {/* .h12-head — title + summary */}
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 41, lineHeight: 45, letterSpacing: -1.2 }}>Habits<Text style={{ color: p.titleAccent }}>.</Text></Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingBottom: 8 }}>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 22 }}>{doneCount}/{due.length}</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>done</Text>
      </View>
    </View>
    {/* .h12-bar — one segment per habit due */}
    {due.length > 0 && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: due.length, now: doneCount }} style={{ flexDirection: 'row', gap: 4 }}>
      {due.map(habit => <View key={habit.id} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: isDone(habit) ? p.g1 : p.qTrack }}/>)}
    </View>}

    {/* .h12-wk — week strip */}
    <View style={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row', gap: 6, marginTop: 4 }}>
      {weekDays.map(day => {
        const rate = habitRate(habits, completions, day, day);
        const level = rate.due ? rate.done / rate.due : 0;
        const on = day === selected;
        const levelColor = !rate.due || level === 0 ? p.qTrack : level < 0.5 ? p.lv1 : level < 1 ? p.lv2 : p.lv3;
        return <MotionPressable key={day} selected={on} pressScale={0.92} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day))} onPress={() => setSelected(day)} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 9, borderRadius: 14, backgroundColor: on ? p.g1 : 'transparent' }}>
          <Text style={{ color: on ? p.plInk : p.muted, fontFamily: fonts.bold, fontSize: 10.5 }}>{new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(day))}</Text>
          <Text style={{ color: on ? p.plInk : day === today ? p.accent : p.text, fontFamily: fonts.displayHeavy, fontSize: 16, lineHeight: 18 }}>{fromDay(day).getDate()}</Text>
          <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: on ? p.plInk : levelColor, opacity: on ? 0.5 : 1 }}/>
        </MotionPressable>;
      })}
    </View>

    {categories.length > 2 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {categories.map(option => { const on = option === category; return <MotionPressable key={option} selected={on} pressScale={0.95} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setCategory(option)} style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? p.g1 : p.c8, borderWidth: 1, borderColor: on ? p.g1 : p.c8Line }}><Text style={{ color: on ? p.plInk : p.text, fontFamily: fonts.bold, fontSize: 12 }}>{option === 'All Habits' ? 'All' : option}</Text></MotionPressable>; })}
    </View>}

    {/* Schedule (timed habits) */}
    <SectionLink title="Schedule" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{timed.length} planned</Text><CircleButton icon="add" tone="accent" size={30} label="Create timed habit" onPress={() => router.push('/habit-form')}/></View>}/>
    {timed.length ? <View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 46 + 26, top: 10, bottom: 10, width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong }}/>
      {timed.map((habit, index) => {
        const time = reminderTimes(habit)[0];
        const previous = index ? reminderTimes(timed[index - 1])[0] : '';
        return <React.Fragment key={habit.id}>
          {selected === today && previous <= nowTime && time > nowTime && index > 0 && <NowMarker/>}
          <HabitRow habit={habit} index={index} time={time} done={isDone(habit)} progress={habitProgressOn(progress, habit.id, selected)} streak={habitStreak(habit, completions).current} canAct={canAct(habit)} onPrimary={() => primary(habit)} onMore={() => { setAmountDraft(String(habitProgressOn(progress, habit.id, selected)?.amount ?? 0)); setMenu(habit); }}/>
        </React.Fragment>;
      })}
    </View> : <EmptyAction text="Give a habit a reminder time to see it on your schedule." icon="time-outline" onPress={() => router.push('/habit-form')}/>}

    {/* Anytime */}
    <SectionLink title="Anytime" right={<Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>whenever suits you</Text>}/>
    {anytime.length ? anytime.map((habit, index) => <HabitRow key={habit.id} habit={habit} index={index} done={isDone(habit)} progress={habitProgressOn(progress, habit.id, selected)} streak={habitStreak(habit, completions).current} canAct={canAct(habit)} onPrimary={() => primary(habit)} onMore={() => { setAmountDraft(String(habitProgressOn(progress, habit.id, selected)?.amount ?? 0)); setMenu(habit); }}/>)
      : due.length === 0 ? <EmptyAction text="No habits scheduled for this day. Create one or check your schedule." onPress={() => router.push('/habit-form')}/> : <EmptyAction text="Every habit here has a time." icon="checkmark"/>}

    {selected !== today && <View style={{ marginTop: 6, padding: 12, borderRadius: 14, backgroundColor: isLight(p) ? p.soft1 : p.card2 }}><Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>Viewing a past day. Measured habits can still be adjusted; yes/no habits can only be checked off for today.</Text></View>}

    {/* Weekly consistency */}
    <SectionLink title="This week"/>
    <VCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <CircleButton icon="chevron-back" label="Previous week" onPress={() => setSummaryWeek(addDays(summaryWeek, -7))}/>
        <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13.5 }}>{summary.first} – {summary.last}</Text>
        <CircleButton icon="chevron-forward" label="Next week" disabled={summaryWeek >= weekStart(today)} onPress={() => setSummaryWeek(addDays(summaryWeek, 7))}/>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 14 }}>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 44, lineHeight: 46, letterSpacing: -2 }}>{summary.percent}<Text style={{ color: p.muted, fontSize: 18 }}>%</Text></Text>
        <Text style={{ flex: 1, color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5, paddingBottom: 6 }}>{summary.due ? `${summary.done} of ${summary.due} scheduled habit-days${summary.partial ? ` · ${summary.partial} partly done` : ''}` : 'No habits scheduled for this week.'}</Text>
      </View>
      <View style={{ marginTop: 12 }}><MiniBar value={summary.due ? summary.done / summary.due : 0} color={p.pgBar} track={p.qTrack}/></View>
    </VCard>

    {notDue.length > 0 && <>
      <SectionLink title="Not scheduled on this day"/>
      {notDue.map((habit, index) => <HabitRow key={habit.id} habit={habit} index={index} done={false} streak={habitStreak(habit, completions).current} canAct={false} inactive onPrimary={() => undefined} onMore={() => { setAmountDraft('0'); setMenu(habit); }}/>)}
    </>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><Ionicons name="information-circle-outline" size={14} color={p.muted}/><Text style={{ flex: 1, color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>Tap the circle to complete a habit. Tap ⋯ for edit, history, order and delete.</Text></View>

    <BottomSheet visible={!!menu} title={menu?.name ?? 'Habit'} onClose={() => setMenu(null)}>{close => menu && <View style={{ gap: 6 }}>
      {menu.habit_type === 'quantity' ? <>
        <Text style={{ color: p.muted, fontFamily: fonts.semibold }}>{menuProgress?.amount ?? 0} / {menuProgress?.target_snapshot ?? menu.target_value ?? 1} {menuProgress?.unit_snapshot ?? menu.unit ?? ''}</Text>
        <MiniBar value={(menuProgress?.amount ?? 0) / (menuProgress?.target_snapshot ?? menu.target_value ?? 1)} color={p.pgBar} track={p.qTrack}/>
        {selected <= today && !menu.archived && scheduled(menu, selected) && <>
          <ActionItem icon="add" tone="ok" label={`Add ${menu.increment ?? 1} ${menu.unit ?? ''}`.trim()} onPress={() => close(() => { void addAmount(menu); })}/>
          <Field label="Set total" value={amountDraft} onChangeText={setAmountDraft} keyboardType="decimal-pad"/>
          <Button title="Save total" kind="ghost" onPress={async () => { await saveAmount(menu); close(); }}/>
          <ActionItem icon="refresh" label="Reset day" onPress={() => confirm('Reset this day’s progress?', () => close(() => { void resetAmount(menu); }), 'This removes the measured progress for this day.', 'Reset')}/>
        </>}
      </> : selected === today && !menu.archived && scheduled(menu, selected) ? <ActionItem icon={isDone(menu) ? 'arrow-undo' : 'checkmark'} tone="ok" label={isDone(menu) ? 'Mark as not done' : 'Mark as done'} onPress={() => close(() => { void setCompletion(menu.id, !isDone(menu)); })}/> : null}
      <ActionItem icon="create-outline" tone="ed" label="Edit habit" onPress={() => close(() => router.push({ pathname: '/habit-form', params: { id: menu.id } }))}/>
      <ActionItem icon="time-outline" label="History" onPress={() => close(() => router.push({ pathname: '/habit-history', params: { id: menu.id } }))}/>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}><ActionItem icon="arrow-up" label="Move up" onPress={() => { void move(menu.id, -1); }}/></View>
        <View style={{ flex: 1 }}><ActionItem icon="arrow-down" label="Move down" onPress={() => { void move(menu.id, 1); }}/></View>
      </View>
      <ActionItem icon="trash-outline" tone="del" label="Delete habit" onPress={() => confirm('Delete habit and its history?', () => close(() => { void deleteHabit(menu.id); }))}/>
    </View>}</BottomSheet>
  </Page>;
}

function NowMarker() {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: p.lime }}><Text style={{ color: '#0B1446', fontFamily: fonts.bold, fontSize: 10.5 }}>Now</Text></View>
    <View style={{ flex: 1, height: 1.5, backgroundColor: p.lime }}/>
  </View>;
}

/** Timeline / list row: time, icon capsule, label, round check, ⋯ menu. */
function HabitRow({ habit, time, done, progress, streak, canAct, inactive = false, index, onPrimary, onMore }: { habit: Habit; time?: string; done: boolean; progress?: HabitProgress; streak: number; canAct: boolean; inactive?: boolean; index: number; onPrimary: () => unknown; onMore: () => void }) {
  const p = usePalette();
  const entering = useEntering(index);
  const quantity = habit.habit_type === 'quantity';
  const capsule = index % 2 === 0 ? p.g1 : p.lime;
  const capsuleInk = capsule === p.lime ? '#0B1446' : p.plInk;
  const sub = quantity ? `${progress?.amount ?? 0} / ${progress?.target_snapshot ?? habit.target_value ?? 1} ${progress?.unit_snapshot ?? habit.unit ?? ''}`.trim() : habit.frequency === 'quota' ? `${habit.weekly_target}× per week` : habit.frequency === 'days' ? habit.days : 'Every day';
  const check: VoltIcon = quantity && !done ? 'add' : 'checkmark';
  return <Animated.View entering={entering} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, opacity: inactive ? 0.6 : 1 }}>
    {time !== undefined && <Text style={{ width: 46, color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{time}</Text>}
    <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? capsule : p.c8, borderWidth: done ? 0 : 1.5, borderColor: p.c8Line }}>
      <Text style={{ fontSize: 20, color: done ? capsuleInk : p.accent }}>{habit.icon || '•'}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${habit.name} options`} onPress={onMore} style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <Text numberOfLines={1} style={{ color: done ? p.muted : p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{habit.name}</Text>
      <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>{sub}{streak > 0 ? ` · ${streak} day streak` : ''}</Text>
      {quantity && <View style={{ marginTop: 4, maxWidth: 160 }}><MiniBar value={(progress?.amount ?? 0) / (progress?.target_snapshot ?? habit.target_value ?? 1)} color={p.pgBar} track={p.qTrack} height={4}/></View>}
    </Pressable>
    {!inactive && <MotionPressable pressScale={0.86} disabled={!canAct} accessibilityRole={quantity ? 'button' : 'checkbox'} accessibilityState={{ checked: done, disabled: !canAct }} accessibilityLabel={quantity ? `Add ${habit.increment ?? 1} to ${habit.name}` : habit.name} onPress={() => { void onPrimary(); }}
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? p.g1 : 'transparent', borderWidth: done ? 0 : 2, borderColor: p.borderStrong, opacity: canAct || done ? 1 : 0.4 }}>
      {(done || quantity) && <Ionicons name={check} size={17} color={done ? p.plInk : p.accent}/>}
    </MotionPressable>}
    <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${habit.name}`} hitSlop={6} onPress={onMore} style={{ width: 32, height: 34, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={18} color={p.muted}/></Pressable>
  </Animated.View>;
}

/** `.am-b` — action menu item. */
function ActionItem({ icon, label, onPress, tone }: { icon: VoltIcon; label: string; onPress: () => void; tone?: 'ok' | 'ed' | 'del' }) {
  const p = usePalette();
  const bg = tone === 'ok' ? p.lime : tone === 'ed' ? p.blue : tone === 'del' ? p.g1 : p.c8;
  const fg = tone === 'ok' || tone === 'ed' ? '#0B1446' : tone === 'del' ? p.plInk : p.text;
  return <MotionPressable pressScale={0.97} accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: isLight(p) ? p.soft1 : p.card2 }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}><Ionicons name={icon} size={18} color={fg}/></View>
    <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 15 }}>{label}</Text>
  </MotionPressable>;
}
