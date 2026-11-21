import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay, uid, weekStart } from '../../core/date';
import { habitDone, habitRate, habitStreak, scheduled } from '../../core/logic';
import { Habit, HabitCompletion, HabitProgress } from '../../core/types';
import { filterHabits, habitProgressOn, reminderTimes, weeklyConsistency } from '../../core/habitExtras';
import { amountLabel, applyAmountDelta, habitRatio, quantityDone } from '../../core/habitProgress';
import { STARTER_HABITS, frequencyLabel, habitDurationMinutes, habitGroup, minutesLeft, nowLineIndex, scheduleLine, type StarterHabit } from '../../core/habitDesign';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { useScreenRevision } from '../../state/useScreenRevision';
import { useLoadState } from '../../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonCircle, SkeletonScreen } from '../../ui/Skeleton';
import { Button, Field, Page, confirm, message } from '../../ui/components';
import { BottomSheet } from '../../ui/BottomSheet';
import { fonts, brand } from '../../ui/theme';
import { reconcileReminders } from '../../services/reminders';
import { MotionPressable } from '../../ui/MotionPressable';
import { CircleButton, EmptyAction, MiniBar, SectionLink, VCard, isLight, useEntering, usePalette, type VoltIcon } from '../../ui/voltKit';
import { CubyMark } from '../../ui/CubyMark';
import { HabitEditor } from '../../ui/HabitEditor';
import { HabitGlyph, groupColors } from '../../ui/HabitVisuals';
import { MonthWeekCalendar } from '../../ui/MonthWeekCalendar';
import { deviceUses12h } from '../../ui/WheelTimePicker';
import { useReducedMotion } from '../../ui/motion';
import { HabitHistorySheet } from '../../ui/HabitHistorySheet';
import { isFeatureLimitError } from '../../services/featureLimits';
import { useSubscription } from '../../state/subscriptions';

const clock = () => new Date().toTimeString().slice(0, 5);
const formatStep = (habit: Habit) => `${Number((habit.increment ?? 1).toFixed(2))} ${habit.unit ?? ''}`.trim();
type EditorState = { habit: Habit | null; mode: 'time' | 'anytime' } | null;

/**
 * Volt Habits (references 1, 4, 5, 7): empty state with one-tap starters, a
 * segmented completion bar, the shared month/week calendar, a timed Schedule
 * with a live "Now" line, and an Anytime list. Completed rows use their
 * category's bright colour, open rows a soft tint. Tap-only: the right circle
 * completes (or adds one step to a measured habit), ⋯ opens edit/correct/delete.
 */
/** Placeholder for the Schedule timeline, Anytime rows and the weekly summary card. */
function HabitsSkeleton() {
  const row = (key: number) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
    <SkeletonBlock width={46} height={11} radius={6}/>
    <SkeletonCircle size={52}/>
    <View style={{ flex: 1, gap: 7 }}><SkeletonBlock width="58%" height={13} radius={7}/><SkeletonBlock width="36%" height={10} radius={5}/></View>
    <SkeletonBlock width={20} height={20} radius={10}/>
  </View>;
  return <SkeletonScreen label="Loading habits">
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}><SkeletonBlock width={92} height={15} radius={8}/><SkeletonBlock width={70} height={11} radius={6}/></View>
    <View>{[0, 1, 2].map(row)}</View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}><SkeletonBlock width={84} height={15} radius={8}/><SkeletonBlock width={110} height={11} radius={6}/></View>
    <View>{[3, 4].map(row)}</View>
    <SkeletonBlock width={96} height={15} radius={8} style={{ marginTop: 8 }}/>
    <SkeletonCard style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><SkeletonCircle size={36}/><SkeletonBlock width={120} height={12} radius={6}/><SkeletonCircle size={36}/></View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}><SkeletonBlock width={84} height={40} radius={10}/><SkeletonBlock width="50%" height={11} radius={6} style={{ marginBottom: 6 }}/></View>
      <SkeletonBlock height={7} radius={4}/>
    </SkeletonCard>
  </SkeletonScreen>;
}

export default function Habits() {
  const { changed, language, profile } = useApp();
  const subscription = useSubscription();
  // Reloads only while this tab is focused (see useScreenRevision).
  const revision = useScreenRevision();
  const p = usePalette();
  const params = useLocalSearchParams<{ new?: string; edit?: string }>();
  const hour12 = useMemo(() => deviceUses12h(), []);
  const [habits, setHabits] = useState<Habit[]>([]);
  // Completions and measured progress change together (a measured habit completes at its
  // target), so they share one state object and every optimistic update is functional.
  const [track, setTrack] = useState<{ completions: HabitCompletion[]; progress: HabitProgress[] }>({ completions: [], progress: [] });
  const { completions, progress } = track;
  // Measured-habit writes still in flight; a reload during a burst of taps would show an older total.
  const pendingWrites = useRef(0);
  // First load only; later reloads keep the list on screen. A failed first read shows a retry.
  const load = useLoadState('habits');
  const { attempt, succeed, fail } = load;
  const loaded = load.status === 'ready';
  const [selected, setSelected] = useState(dayKey());
  const [summaryWeek, setSummaryWeek] = useState(weekStart(dayKey()));
  const [amountDraft, setAmountDraft] = useState('');
  const [menu, setMenu] = useState<Habit | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [manage, setManage] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Set while the paywall (opened from History) is on top; History reopens when Habits regains focus.
  const returnToHistory = useRef(false);
  useFocusEffect(useCallback(() => { if (returnToHistory.current) { returnToHistory.current = false; setHistoryOpen(true); } }, []));
  const [nowTime, setNowTime] = useState(clock);
  const creating = useRef(false);
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';

  const showHabitLimit = useCallback(() => {
    Alert.alert('Free plan limit reached', 'You can track up to 3 habits on Cubyfit Free. Upgrade to Pro for unlimited habits.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Upgrade to Pro', onPress: () => router.push('/paywall') },
    ]);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([repo.habits(), repo.completions(), repo.habitProgress()]).then(([allHabits, allCompletions, allProgress]) => {
      if (!active) return;
      setHabits(allHabits);
      if (pendingWrites.current === 0) setTrack({ completions: allCompletions, progress: allProgress });
      succeed();
    }).catch(error => { if (active && !fail()) message(error); });
    return () => { active = false; };
  }, [revision, attempt, succeed, fail]);
  // Home / Progress links (`/habit-form`) arrive here with ?new=1 or ?edit=<id>.
  useEffect(() => {
    if (params.new) { setEditor({ habit: null, mode: 'time' }); router.setParams({ new: undefined }); }
  }, [params.new]);
  useEffect(() => {
    if (!params.edit || !loaded) return;
    const habit = habits.find(item => item.id === params.edit);
    if (habit) setEditor({ habit, mode: 'time' });
    router.setParams({ edit: undefined });
  }, [params.edit, loaded, habits]);
  // The Now line moves once a minute, and only while today is shown.
  useEffect(() => {
    if (selected !== today) return;
    setNowTime(clock());
    const timer = setInterval(() => setNowTime(clock()), 60000);
    return () => clearInterval(timer);
  }, [selected, today]);

  const ordered = filterHabits(habits, 'All Habits');
  const active = ordered.filter(habit => !habit.archived);
  const due = active.filter(habit => scheduled(habit, selected));
  const summary = weeklyConsistency(habits, completions, progress, summaryWeek, today);
  const isDone = (habit: Habit, day = selected) => habit.habit_type === 'quantity' ? quantityDone(habit, habitProgressOn(progress, habit.id, day)) : habitDone(habit, completions, day);
  /** 0–1 for the ring and the segment: partial for measured habits. */
  const ratio = (habit: Habit) => habitRatio(habit, habitProgressOn(progress, habit.id, selected), isDone(habit));
  const doneCount = due.filter(habit => isDone(habit)).length;
  // A stored time is the schedule (the reminder switch only controls notifications). Same-time habits keep their manual order.
  const timed = due.filter(habit => reminderTimes(habit).length).sort((a, b) => reminderTimes(a)[0].localeCompare(reminderTimes(b)[0]) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at));
  const anytime = due.filter(habit => !reminderTimes(habit).length);
  const nowIndex = selected === today ? nowLineIndex(timed.map(habit => reminderTimes(habit)[0]), nowTime) : null;

  /** Optimistic: the row, counter, bar and calendar update at once; SQLite then persists. */
  async function setCompletion(id: string, completed: boolean) {
    const without = (rows: HabitCompletion[]) => rows.filter(row => !(row.habit_id === id && row.day === today));
    setTrack(state => ({ ...state, completions: completed ? [...without(state.completions), { id: `local-${id}`, habit_id: id, day: today, created_at: new Date().toISOString() }] : without(state.completions) }));
    try { await repo.setHabitCompletion(id, today, completed); changed(); }
    catch (error) { setTrack(state => ({ ...state, completions: completed ? without(state.completions) : state.completions })); changed(); message(error); }
  }
  /**
   * Measured habit step (+increment or −increment). The screen updates at once with the same
   * maths SQLite applies; the write itself is an atomic read-add-write, so rapid taps are
   * serialised and none is lost or counted twice. One reload follows the last pending write.
   */
  async function changeAmount(habit: Habit, delta: number) {
    const day = selected;
    pendingWrites.current++;
    setTrack(state => { const next = applyAmountDelta(state.progress, state.completions, habit, day, delta); return { progress: next.progress, completions: next.completions }; });
    try { await repo.addHabitAmount(habit.id, day, delta); }
    catch (error) { message(error); }
    finally { pendingWrites.current--; if (pendingWrites.current === 0) changed(); }
  }
  async function resetAmount(habit: Habit) { try { await repo.setHabitAmount(habit.id, selected, 0); changed(); } catch (error) { message(error); } }
  async function saveAmount(habit: Habit) {
    if (!/^\d+(\.\d+)?$/.test(amountDraft.trim())) throw Error('Enter a valid nonnegative total.');
    await repo.setHabitAmount(habit.id, selected, Number(amountDraft));
    changed();
  }
  async function move(id: string, direction: -1 | 1) { try { await repo.moveHabit(id, direction); changed(); } catch (error) { message(error); } }
  /** A saved habit moves to its new section/position at once (time, Anytime, target); the reload then confirms. */
  function applySaved(saved?: Habit) {
    if (saved) {
      setHabits(rows => rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? { ...row, ...saved } : row) : [...rows, saved]);
      // Mirrors saveHabit: a new goal applies to today and later; earlier days keep their target.
      if (saved.habit_type === 'quantity') setTrack(state => {
        const target = saved.target_value ?? 1;
        const progress = state.progress.map(row => row.habit_id === saved.id && row.day >= today ? { ...row, target_snapshot: target, unit_snapshot: saved.unit ?? '' } : row);
        const reached = new Set(progress.filter(row => row.habit_id === saved.id && row.day >= today && row.amount >= target).map(row => row.day));
        const completions = state.completions.filter(row => row.habit_id !== saved.id || row.day < today || reached.has(row.day));
        for (const day of reached) if (!completions.some(row => row.habit_id === saved.id && row.day === day)) completions.push({ id: `local-${saved.id}:${day}`, habit_id: saved.id, day, created_at: new Date().toISOString() });
        return { progress, completions };
      });
    }
    changed();
  }
  /** Optimistic: the row disappears at once; restored if the local delete fails. */
  async function deleteHabit(id: string) {
    const before = habits;
    setHabits(rows => rows.filter(row => row.id !== id));
    try { await repo.deleteHabit(id); changed(); void reconcileReminders(); }
    catch (error) { setHabits(before); message(error); }
  }
  /** One-tap starter: saved locally at once with no reminder; editable afterwards. */
  async function createStarter(starter: StarterHabit) {
    if (creating.current) return;
    creating.current = true;
    try {
      if (!profile) throw Error('Complete your profile first.');
      const times = starter.time ? [starter.time] : [];
      await repo.saveHabit({ id: uid(), owner_id: profile.id, name: starter.name, description: '', category: starter.group, icon: starter.icon, frequency: 'daily', days: '0,1,2,3,4,5,6', weekly_target: 7, start_date: today, archived: 0, created_at: new Date().toISOString(), reminder_time: times[0] ?? null, reminder_enabled: 0, reminder_times: JSON.stringify(times), habit_type: 'boolean', target_value: 1, unit: '', increment: 1 }, { isPremium: subscription.isPremium });
      setSelected(today); changed();
    } catch (error) { if (isFeatureLimitError(error)) showHabitLimit(); else message(error); }
    finally { setTimeout(() => { creating.current = false; }, 600); }
  }
  /** The round control: yes/no toggles; measured adds one increment until the target (no accidental over-adding). */
  const primary = (habit: Habit) => {
    if (habit.habit_type === 'quantity') return selected <= today && !isDone(habit) ? changeAmount(habit, habit.increment ?? 1) : undefined;
    if (selected === today) return setCompletion(habit.id, !isDone(habit));
    return undefined;
  };
  const canAct = (habit: Habit) => habit.habit_type === 'quantity' ? selected <= today && !isDone(habit) : selected === today;
  const openMenu = (habit: Habit) => { setAmountDraft(String(habitProgressOn(progress, habit.id, selected)?.amount ?? 0)); setMenu(habit); };
  const dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(fromDay(selected)).toUpperCase();
  const menuProgress = menu ? habitProgressOn(progress, menu.id, selected) : undefined;
  const startDay = selected > today ? selected : today;
  const marker = (day: string) => {
    const rate = habitRate(habits, completions, day, day);
    if (!rate.due || day > today) return null;
    const level = rate.done / rate.due;
    const on = day === selected;
    return <View style={{ width: 14, height: 3.5, borderRadius: 2, marginTop: 2, backgroundColor: on ? p.plInk : level === 0 ? p.qTrack : level < 1 ? p.lv1 : p.lv3, opacity: on ? 0.6 : 1 }}/>;
  };

  const header = <>
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8 }}>{selected === today ? `TODAY · ${dayLabel}` : dayLabel}</Text>
      <CircleButton icon="grid-outline" label="History" onPress={() => setHistoryOpen(true)}/>
      <CircleButton icon="calendar-outline" label="Choose a date" onPress={() => setCalendarOpen(true)}/>
      <CircleButton icon="add" tone="accent" label="New habit" onPress={() => setEditor({ habit: null, mode: 'time' })}/>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 41, lineHeight: 45, letterSpacing: -1.2 }}>Habits<Text style={{ color: p.titleAccent }}>.</Text></Text>
      {active.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${doneCount} of ${due.length} done. Manage habits`} onPress={() => setManage(true)} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, paddingBottom: 8 }}>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 22 }}>{doneCount}/{due.length}</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>done · Manage</Text>
        <Ionicons name="chevron-forward" size={13} color={p.muted}/>
      </Pressable>}
    </View>
  </>;

  // Before the first read: real header and date selector, placeholders for the strip, timeline and lists.
  if (!loaded) return <Page title="">
    {header}
    {load.status === 'loading' && <SkeletonScreen><SkeletonBlock height={8} radius={4}/></SkeletonScreen>}
    <MonthWeekCalendar selected={selected} onSelect={setSelected} locale={locale} marker={marker} open={calendarOpen} onOpenChange={setCalendarOpen}/>
    {load.status === 'error' ? <LoadError text="Could not load your habits." onRetry={load.retry}/> : <HabitsSkeleton/>}
    <BottomSheet layout="fixed" visible={!!editor} title={editor?.habit ? 'Edit habit' : 'New habit'} onClose={() => setEditor(null)}>{close => editor && <HabitEditor key={editor.habit?.id ?? `new-${editor.mode}`} habit={editor.habit} startDay={startDay} initialMode={editor.mode} close={close} onSaved={applySaved} onLimit={showHabitLimit}/>}</BottomSheet>
    <HabitHistorySheet visible={historyOpen} locale={locale} onClose={() => setHistoryOpen(false)} onUpgrade={() => { returnToHistory.current = true; router.push('/paywall'); }}/>
  </Page>;

  if (loaded && active.length === 0) return <Page title="">
    {header}
    <EmptyHabits onPick={starter => { void createStarter(starter); }} onCreate={() => setEditor({ habit: null, mode: 'time' })}/>
    <BottomSheet layout="fixed" visible={!!editor} title={editor?.habit ? 'Edit habit' : 'New habit'} onClose={() => setEditor(null)}>{close => editor && <HabitEditor key={editor.habit?.id ?? 'new'} habit={editor.habit} startDay={startDay} initialMode={editor.mode} close={close} onSaved={applySaved} onLimit={showHabitLimit}/>}</BottomSheet>
    <HabitHistorySheet visible={historyOpen} locale={locale} onClose={() => setHistoryOpen(false)} onUpgrade={() => { returnToHistory.current = true; router.push('/paywall'); }}/>
    <ManageSheet open={manage} habits={ordered} onClose={() => setManage(false)} onEdit={habit => { setManage(false); setEditor({ habit, mode: 'time' }); }}/>
  </Page>;

  return <Page title="">
    {header}
    {due.length > 0 && <SegmentBar values={due.map(ratio)} ids={due.map(habit => habit.id)}/>}
    <MonthWeekCalendar selected={selected} onSelect={setSelected} locale={locale} marker={marker} open={calendarOpen} onOpenChange={setCalendarOpen}/>
    {selected !== today && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>{selected < today ? 'Looking back at' : 'Planning ahead for'} <Text style={{ color: p.text, fontFamily: fonts.bold }}>{dayLabel}</Text>. <Text accessibilityRole="button" onPress={() => setSelected(today)} style={{ color: p.accent, fontFamily: fonts.bold, textDecorationLine: 'underline' }}>Back to today</Text></Text>}

    <SectionLink title="Schedule" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{timed.length} planned</Text><CircleButton icon="add" tone="accent" size={30} label="New habit at a time" onPress={() => setEditor({ habit: null, mode: 'time' })}/></View>}/>
    {timed.length ? <View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 46 + 8 + 26, top: 16, bottom: 16, width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong }}/>
      {timed.map((habit, index) => <React.Fragment key={habit.id}>
        {nowIndex === index && <NowMarker/>}
        <HabitRow habit={habit} index={index} time={reminderTimes(habit)[0]} hour12={hour12} now={selected === today ? nowTime : null} done={isDone(habit)} ratio={ratio(habit)} progress={habitProgressOn(progress, habit.id, selected)} streak={habitStreak(habit, completions).current} canAct={canAct(habit)} onPrimary={() => primary(habit)} onMore={() => openMenu(habit)}/>
      </React.Fragment>)}
    </View> : <EmptyAction text="Give a habit a time to see it on your schedule." icon="time-outline" onPress={() => setEditor({ habit: null, mode: 'time' })}/>}

    <SectionLink title="Anytime" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>whenever suits you</Text><CircleButton icon="add" tone="accent" size={30} label="New anytime habit" onPress={() => setEditor({ habit: null, mode: 'anytime' })}/></View>}/>
    {anytime.length ? anytime.map((habit, index) => <HabitRow key={habit.id} habit={habit} index={index} hour12={hour12} now={null} done={isDone(habit)} ratio={ratio(habit)} progress={habitProgressOn(progress, habit.id, selected)} streak={habitStreak(habit, completions).current} canAct={canAct(habit)} onPrimary={() => primary(habit)} onMore={() => openMenu(habit)}/>)
      : <EmptyAction text="Add something to do anytime, like water" onPress={() => setEditor({ habit: null, mode: 'anytime' })}/>}
    {due.length === 0 && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>No habits are scheduled on this day. Manage shows every habit.</Text>}
    {selected !== today && <View style={{ padding: 12, borderRadius: 14, backgroundColor: isLight(p) ? p.soft1 : p.card2 }}><Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>{selected < today ? 'Viewing a past day. Measured habits can still be adjusted; yes/no habits can only be checked off for today.' : 'Viewing a future day. Habits can be completed on the day itself.'}</Text></View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="information-circle-outline" size={14} color={p.muted}/><Text style={{ flex: 1, color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>Tap the circle to complete or add progress. Tap ⋯ to edit, correct or delete.</Text></View>

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

    <BottomSheet layout="fixed" visible={!!editor} title={editor?.habit ? 'Edit habit' : 'New habit'} onClose={() => setEditor(null)}>{close => editor && <HabitEditor key={editor.habit?.id ?? `new-${editor.mode}`} habit={editor.habit} startDay={startDay} initialMode={editor.mode} close={close} onSaved={applySaved} onLimit={showHabitLimit}/>}</BottomSheet>
    <HabitHistorySheet visible={historyOpen} locale={locale} onClose={() => setHistoryOpen(false)} onUpgrade={() => { returnToHistory.current = true; router.push('/paywall'); }}/>
    <ManageSheet open={manage} habits={ordered} onClose={() => setManage(false)} onEdit={habit => { setManage(false); setEditor({ habit, mode: 'time' }); }}/>
    <BottomSheet visible={!!menu} title={menu?.name ?? 'Habit'} onClose={() => setMenu(null)}>{close => menu && <View style={{ gap: 6 }}>
      {menu.habit_type === 'quantity' ? <>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18 }}>{amountLabel(menu, menuProgress)}</Text>
        <MiniBar value={(menuProgress?.amount ?? 0) / (menuProgress?.target_snapshot ?? menu.target_value ?? 1)} color={p.pgBar} track={p.qTrack}/>
        {selected <= today && !menu.archived && scheduled(menu, selected) && <>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1 }}><ActionItem icon="remove" label={`Remove ${formatStep(menu)}`} disabled={!(menuProgress?.amount)} onPress={() => { void changeAmount(menu, -(menu.increment ?? 1)); }}/></View>
            <View style={{ flex: 1 }}><ActionItem icon="add" tone="ok" label={`Add ${formatStep(menu)}`} onPress={() => { void changeAmount(menu, menu.increment ?? 1); }}/></View>
          </View>
          <Field label="Set total" value={amountDraft} onChangeText={setAmountDraft} keyboardType="decimal-pad"/>
          <Button title="Save total" kind="ghost" onPress={async () => { await saveAmount(menu); close(); }}/>
          <ActionItem icon="refresh" label="Reset day" onPress={() => confirm('Reset this day’s progress?', () => close(() => { void resetAmount(menu); }), 'This removes the measured progress for this day.', 'Reset')}/>
        </>}
      </> : selected === today && !menu.archived && scheduled(menu, selected) ? <ActionItem icon={isDone(menu) ? 'arrow-undo' : 'checkmark'} tone="ok" label={isDone(menu) ? 'Mark as not done' : 'Mark as done'} onPress={() => close(() => { void setCompletion(menu.id, !isDone(menu)); })}/> : null}
      <ActionItem icon="create-outline" tone="ed" label="Edit habit" onPress={() => close(() => setEditor({ habit: menu, mode: 'time' }))}/>
      <ActionItem icon="time-outline" label="History" onPress={() => close(() => router.push({ pathname: '/habit-history', params: { id: menu.id } }))}/>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}><ActionItem icon="arrow-up" label="Move up" onPress={() => { void move(menu.id, -1); }}/></View>
        <View style={{ flex: 1 }}><ActionItem icon="arrow-down" label="Move down" onPress={() => { void move(menu.id, 1); }}/></View>
      </View>
      <ActionItem icon="trash-outline" tone="del" label="Delete habit" onPress={() => confirm(`Delete “${menu.name}”?`, () => close(() => { void deleteHabit(menu.id); }), 'This removes the habit. Days already in History keep their results.', 'Delete habit')}/>
    </View>}</BottomSheet>
  </Page>;
}

/** Reference 1 — empty state with one-tap starters. */
function EmptyHabits({ onPick, onCreate }: { onPick: (starter: StarterHabit) => void; onCreate: () => void }) {
  const p = usePalette();
  return <View style={{ gap: 10, marginTop: 6 }}>
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 22, overflow: 'hidden', marginBottom: 6 }}><CubyMark size={72} variant="brand"/></View>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 21, textAlign: 'center' }}>Start with one small habit</Text>
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19, textAlign: 'center', maxWidth: 290 }}>Pick one below, or make your own. You can change it anytime.</Text>
    </View>
    {STARTER_HABITS.map(starter => {
      const colors = groupColors(p, starter.group);
      return <MotionPressable key={starter.name} pressScale={0.98} accessibilityRole="button" accessibilityLabel={`Add habit ${starter.name}`} onPress={() => onPick(starter)}
        style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 18, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft }}><HabitGlyph icon={starter.icon} size={18} color={colors.softInk}/></View>
        <Text style={{ flex: 1, color: p.text, fontFamily: fonts.bold, fontSize: 14.5 }}>{starter.name}</Text>
        <Ionicons name="add" size={20} color={p.text}/>
      </MotionPressable>;
    })}
    <MotionPressable pressScale={0.98} accessibilityRole="button" onPress={onCreate}
      style={{ minHeight: 56, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, backgroundColor: p.text }}>
      <Ionicons name="add" size={20} color={p.bg}/><Text style={{ color: p.bg, fontFamily: fonts.bold, fontSize: 15.5 }}>Create my own</Text>
    </MotionPressable>
  </View>;
}

/** Thin segmented bar: one segment per habit due, each filled to that habit's progress (partial for measured habits). */
function SegmentBar({ values, ids }: { values: number[]; ids: string[] }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(values.length ? total / values.length * 100 : 0) }} style={{ flexDirection: 'row', gap: 4 }}>
    {values.map((value, index) => <Segment key={ids[index]} value={value}/>)}
  </View>;
}
function Segment({ value }: { value: number }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const fill = useSharedValue(value);
  useEffect(() => { fill.value = reduced ? value : withTiming(value, { duration: 280 }); }, [fill, value, reduced]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return <View style={{ flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: p.qTrack }}>
    <Animated.View style={[{ height: '100%', borderRadius: 3, backgroundColor: p.g1 }, style]}/>
  </View>;
}

function NowMarker() {
  const p = usePalette();
  return <View accessibilityLabel="Now" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: p.lime }}><Text style={{ color: brand.ink, fontFamily: fonts.bold, fontSize: 10.5 }}>Now</Text></View>
    <View style={{ flex: 1, height: 1.5, backgroundColor: p.lime }}/>
  </View>;
}

/** Schedule / Anytime row. Memoised so toggling one habit re-renders only that row. */
const HabitRow = memo(function HabitRow({ habit, time, hour12, now, done, ratio, progress, streak, canAct, index, onPrimary, onMore }: { habit: Habit; time?: string; hour12: boolean; now: string | null; done: boolean; ratio: number; progress?: HabitProgress; streak: number; canAct: boolean; index: number; onPrimary: () => unknown; onMore: () => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const entering = useEntering(index);
  const quantity = habit.habit_type === 'quantity';
  const colors = groupColors(p, habitGroup(habit.category));
  const duration = habitDurationMinutes(habit);
  const left = time && now ? minutesLeft(time, duration, now) : null;
  const fill = useSharedValue(done ? 1 : 0);
  useEffect(() => { fill.value = reduced ? Number(done) : withTiming(Number(done), { duration: 220 }); }, [done, fill, reduced]);
  const capsuleStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(fill.value, [0, 1], [colors.soft, colors.solid]) }), [colors.soft, colors.solid]);
  const sub = time ? (left !== null ? `${left} min left` : scheduleLine(time, duration, hour12)) : frequencyLabel(habit);
  const amount = quantity ? amountLabel(habit, progress) : null;
  // Taller capsule only when a real duration is stored (references 7: Read 20 min, Study 1 h).
  const capsuleHeight = duration ? Math.min(108, 52 + Math.round(Math.min(duration, 90) / 90 * 48)) : 52;
  return <Animated.View entering={entering}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
        {time !== undefined && <Text style={{ width: 46, alignSelf: 'flex-start', paddingTop: 6, color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{time}</Text>}
        <Animated.View style={[{ width: 52, height: capsuleHeight, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: left !== null && !done ? 2 : 0, borderColor: colors.solid }, capsuleStyle]}>
          <HabitGlyph icon={habit.icon} size={20} color={done ? colors.ink : colors.softInk} filled={done}/>
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${habit.name} options`} onPress={onMore} style={{ flex: 1, minWidth: 0, gap: 1, paddingVertical: 2 }}>
          <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>{sub}{!time && streak > 0 ? ` · ${streak} day streak` : ''}</Text>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15, lineHeight: 19 }}>{habit.name}</Text>
          {amount && <Text style={{ color: done ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 11.5 }}>{amount}</Text>}
        </Pressable>
        <Pressable disabled={!canAct} accessibilityRole={quantity ? 'button' : 'checkbox'} accessibilityState={{ checked: done, disabled: !canAct }}
          accessibilityLabel={quantity ? (done ? `${habit.name}, target reached, ${amount}` : `Add ${habit.increment ?? 1} ${habit.unit ?? ''} to ${habit.name}, ${amount}`) : `Complete ${habit.name}`}
          accessibilityHint={quantity && done ? 'Use the more actions button to correct the amount' : undefined} hitSlop={6} onPress={() => { void onPrimary(); }}>
          <ProgressCheck ratio={ratio} done={done} quantity={quantity} enabled={canAct || done} solid={colors.solid} ink={colors.ink}/>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${habit.name}`} hitSlop={6} onPress={onMore} style={{ width: 30, height: 34, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={18} color={p.muted}/></Pressable>
      </View>
  </Animated.View>;
});

/**
 * Right-side control. Yes/no: empty circle → filled check. Measured: a ring that
 * fills to amount/target with "+" inside, turning into the filled check at 100%.
 */
const RING = 34, STROKE = 3, RADIUS = (RING - STROKE) / 2, CIRC = 2 * Math.PI * RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
function ProgressCheck({ ratio, done, quantity, enabled, solid, ink }: { ratio: number; done: boolean; quantity: boolean; enabled: boolean; solid: string; ink: string }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const ring = useSharedValue(ratio);
  const full = useSharedValue(done ? 1 : 0);
  useEffect(() => { ring.value = reduced ? ratio : withTiming(ratio, { duration: 320 }); }, [ratio, reduced, ring]);
  useEffect(() => { full.value = reduced ? Number(done) : withTiming(Number(done), { duration: 200 }); }, [done, full, reduced]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: CIRC * (1 - ring.value) }));
  const fillStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(full.value, [0, 1], ['rgba(0,0,0,0)', solid]), transform: [{ scale: 0.92 + 0.08 * full.value }] }), [solid]);
  return <View style={{ width: RING, height: RING, opacity: enabled ? 1 : 0.4 }}>
    <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
      <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={p.borderStrong} strokeWidth={STROKE - 1} fill="none"/>
      {quantity && <AnimatedCircle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={solid} strokeWidth={STROKE} fill="none" strokeLinecap="round"
        strokeDasharray={`${CIRC} ${CIRC}`} animatedProps={ringProps} transform={`rotate(-90 ${RING / 2} ${RING / 2})`}/>}
    </Svg>
    <Animated.View style={[{ width: RING, height: RING, borderRadius: RING / 2, alignItems: 'center', justifyContent: 'center' }, fillStyle]}>
      {done ? <Ionicons name="checkmark" size={17} color={ink}/> : quantity ? <Ionicons name="add" size={17} color={p.accent}/> : null}
    </Animated.View>
  </View>;
}

/** "Manage": every habit, including ones not due today and archived ones. */
function ManageSheet({ open, habits, onClose, onEdit }: { open: boolean; habits: Habit[]; onClose: () => void; onEdit: (habit: Habit) => void }) {
  const p = usePalette();
  return <BottomSheet visible={open} title="Manage habits" onClose={onClose}>{() => <View style={{ gap: 6 }}>
    {habits.length ? habits.map(habit => {
      const colors = groupColors(p, habitGroup(habit.category));
      const times = reminderTimes(habit);
      return <MotionPressable key={habit.id} pressScale={0.98} accessibilityRole="button" accessibilityLabel={`Edit ${habit.name}`} onPress={() => onEdit(habit)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 16, backgroundColor: isLight(p) ? p.soft1 : p.card2, opacity: habit.archived ? 0.6 : 1 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft }}><HabitGlyph icon={habit.icon} size={17} color={colors.softInk}/></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14.5 }}>{habit.name}</Text>
          <Text style={{ color: p.muted, fontSize: 12 }}>{habitGroup(habit.category)} · {frequencyLabel(habit)} · {times.length ? times[0] : 'Anytime'}{habit.archived ? ' · Archived' : ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={p.muted}/>
      </MotionPressable>;
    }) : <Text style={{ color: p.muted }}>No habits yet.</Text>}
  </View>}</BottomSheet>;
}

/** `.am-b` — action menu item. */
function ActionItem({ icon, label, onPress, tone, disabled = false }: { icon: VoltIcon; label: string; onPress: () => void; tone?: 'ok' | 'ed' | 'del'; disabled?: boolean }) {
  const p = usePalette();
  const bg = tone === 'ok' ? p.lime : tone === 'ed' ? p.blue : tone === 'del' ? p.g1 : p.c8;
  const fg = tone === 'ok' || tone === 'ed' ? brand.ink : tone === 'del' ? p.plInk : p.text;
  return <MotionPressable pressScale={0.97} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: isLight(p) ? p.soft1 : p.card2, opacity: disabled ? 0.45 : 1 }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}><Ionicons name={icon} size={18} color={fg}/></View>
    <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 15 }}>{label}</Text>
  </MotionPressable>;
}
