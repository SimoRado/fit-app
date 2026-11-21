import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type Svg from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './LocalizedText';
import { BottomSheet } from './BottomSheet';
import { Button, message } from './components';
import { fonts, brand } from './theme';
import { CircleButton, isLight, usePalette } from './voltKit';
import { HabitGlyph, groupColors } from './HabitVisuals';
import { HISTORY_WEEK_START, HistoryScale, MiniMonth, MonthGrid, WeekRow, historyColors } from './HistoryCalendar';
import { SHARE_HEIGHT, SHARE_WIDTH, YearShareCard } from './YearShareCard';
import { useReducedMotion } from './motion';
import { addDays, dayKey, fromDay } from '../core/date';
import { cellState, historyAccess, monthKey, percentLabel, shiftMonth, yearMonths, type HistoryDay, type HistoryItem } from '../core/habitHistory';
import { formatAmount } from '../core/habitProgress';
import { habitGroup } from '../core/habitDesign';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { useSubscription } from '../state/subscriptions';
import { canShareFiles, shareFile, writePng } from '../services/shareImage';

type Tab = 'week' | 'month' | 'year';
/** First day (Sunday) of the history week containing `day`. */
const historyWeekStart = (day: string) => addDays(day, -((fromDay(day).getDay() - HISTORY_WEEK_START + 7) % 7));
type Locked = 'months' | 'year' | 'share' | null;
const SHEET_PADDING = 20;

/**
 * Habits History: every completed month is available on-device for everyone; the yearly heatmap
 * and its share action are Cubyfit Pro. It reads only local SQLite snapshots, so it works offline.
 */
export function HabitHistorySheet({ visible, onClose, onUpgrade, locale }: { visible: boolean; onClose: () => void; onUpgrade: () => void; locale: string }) {
  const [sheetTab, setSheetTab] = useState<Tab>('month');
  useEffect(() => { if (!visible) setSheetTab('month'); }, [visible]);
  return <BottomSheet layout="fixed" fixedHeight={sheetTab === 'week' ? '60%' : '82%'} visible={visible} title="History" onClose={onClose}>{close => <HistoryBody locale={locale} onTabChange={setSheetTab} onUpgrade={() => close(onUpgrade)}/>}</BottomSheet>;
}

function HistoryBody({ locale, onTabChange, onUpgrade }: { locale: string; onTabChange: (tab: Tab) => void; onUpgrade: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { revision } = useApp();
  const subscription = useSubscription();
  const today = dayKey();
  const current = monthKey(today);
  // Pro only from the verified RevenueCat entitlement (unknown/offline without cache = Free).
  const isPro = subscription.isPremium;
  const access = useMemo(() => historyAccess(isPro, today), [isPro, today]);
  const content = Math.min(width, 620) - SHEET_PADDING * 2;
  const [tab, setTab] = useState<Tab>('month');
  const [month, setMonth] = useState(current);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [selected, setSelected] = useState<string | null>(today);
  const [locked, setLocked] = useState<Locked>(null);
  const [sharing, setSharing] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [monthRows, setMonthRows] = useState<Map<string, HistoryDay> | null>(null);
  const [week, setWeek] = useState(() => historyWeekStart(today));
  const [weekRows, setWeekRows] = useState<Map<string, HistoryDay> | null>(null);
  const [yearRows, setYearRows] = useState<Map<string, HistoryDay> | null>(null);

  // Entitlement can expire while the sheet is open: return from Year to Month without touching data.
  useEffect(() => { if (!access.canOpenYear && tab === 'year' && locked !== 'year') { setTab('month'); onTabChange('month'); setSharing(false); } }, [access, tab, locked, onTabChange]);
  useEffect(() => { if (isPro) setLocked(null); }, [isPro]);
  useEffect(() => { repo.habitHistoryFirstDay().then(setFirst).catch(() => setFirst(null)); }, [revision]);
  useEffect(() => {
    let active = true;
    const [y, m] = month.split('-').map(Number);
    const last = dayKey(new Date(y, m, 0, 12));
    repo.habitHistory(`${month}-01`, last, true).then(rows => { if (active) setMonthRows(new Map(rows.map(row => [row.day, row]))); }).catch(error => { if (active) { setMonthRows(new Map()); message(error); } });
    return () => { active = false; };
  }, [month, current, revision]);
  useEffect(() => {
    if (tab !== 'week') return;
    let active = true;
    const end = addDays(week, 6);
    repo.habitHistory(week, end, true).then(rows => { if (active) setWeekRows(new Map(rows.map(row => [row.day, row]))); }).catch(error => { if (active) { setWeekRows(new Map()); message(error); } });
    return () => { active = false; };
  }, [tab, week, current, revision]);
  useEffect(() => {
    if (tab !== 'year' || !access.canOpenYear) return;
    let active = true;
    repo.habitHistory(`${year}-01-01`, `${year}-12-31`, false).then(rows => { if (active) setYearRows(new Map(rows.map(row => [row.day, row]))); }).catch(error => { if (active) { setYearRows(new Map()); message(error); } });
    return () => { active = false; };
  }, [tab, year, access.canOpenYear, revision]);

  const firstMonth = first ? monthKey(first) : current;
  const firstYear = Number(firstMonth.slice(0, 4));
  const previousMonth = shiftMonth(month, -1);
  const canPrevious = previousMonth >= firstMonth;
  function goMonth(delta: number) {
    const next = shiftMonth(month, delta);
    if (!access.canBrowseMonth(next)) return;
    setLocked(null); setMonth(next); setSelected(next === current ? today : null);
  }
  function goWeek(delta: number) {
    const next = addDays(week, delta * 7);
    if (delta > 0 && next > today) return;
    if (delta < 0 && !access.canBrowseMonth(monthKey(addDays(next, 6)))) return;
    setLocked(null); setWeek(next); setSelected(today >= next && today <= addDays(next, 6) ? today : null);
  }
  function chooseTab(next: Tab) {
    if (next === 'year' && !access.canOpenYear) { setLocked('year'); setTab('year'); onTabChange('year'); return; }
    setLocked(null); setSharing(false); setTab(next); onTabChange(next);
    if (next === 'week') { const start = historyWeekStart(selected && access.canBrowseMonth(monthKey(selected)) ? selected : today); setWeek(start); }
  }
  function openMonth(next: string) {
    if (!access.canBrowseMonth(next)) return;
    setMonth(next); setSelected(next === current ? today : null); setTab('month'); onTabChange('month');
  }

  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: SHEET_PADDING, paddingBottom: 10 }}><TabSwitch tab={tab} width={content} yearLocked={!access.canOpenYear} onChange={chooseTab}/></View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: SHEET_PADDING, paddingBottom: Math.max(24, insets.bottom + 12), gap: 12 }}>
      {/* Shown where the tap happened, above the calendar, so it is never below the fold. */}
      {locked === 'months' && <UpgradePrompt reason={locked} checking={!subscription.ready && !subscription.error} onUpgrade={onUpgrade} onDismiss={() => setLocked(null)}/>}
      {tab === 'week' ? <WeekView week={week} rows={weekRows} today={today} selected={selected} locale={locale} width={content}
          canPrevious={monthKey(addDays(week, -1)) >= firstMonth || !isPro} previousLocked={!access.canBrowseMonth(monthKey(addDays(week, -1)))} canNext={addDays(week, 7) <= today}
          onPrevious={() => goWeek(-1)} onNext={() => goWeek(1)} onSelect={setSelected} detailAllowed={access.canSeeDetail} isLocked={day => !access.canBrowseMonth(monthKey(day))}/>
        : tab === 'month' ? <MonthView month={month} rows={monthRows} today={today} selected={selected} locale={locale} width={content}
          canPrevious={canPrevious || !isPro} previousLocked={!access.canBrowseMonth(previousMonth)} canNext={month < current}
          onPrevious={() => goMonth(-1)} onNext={() => goMonth(1)} onSelect={setSelected} detailAllowed={access.canSeeDetail}/>
        : locked === 'year' ? null
        : sharing ? <SharePreview year={year} rows={yearRows} today={today} locale={locale} width={content} onBack={() => setSharing(false)}/>
        : <YearView year={year} rows={yearRows} today={today} locale={locale} width={content} canPrevious={year > firstYear} canNext={year < Number(today.slice(0, 4))}
            onYear={delta => setYear(value => value + delta)} onMonth={openMonth} onShare={() => { if (access.canShare) setSharing(true); else setLocked('share'); }}/>}
      {locked && locked !== 'months' && <UpgradePrompt reason={locked} checking={!subscription.ready && !subscription.error} onUpgrade={onUpgrade} onDismiss={locked === 'year' ? () => chooseTab('month') : () => setLocked(null)}/>}
    </ScrollView>
  </View>;
}

const TABS: Tab[] = ['week', 'month', 'year'];
/** WEEK | MONTH | YEAR segmented selector (reference): pale track, white sliding pill. */
function TabSwitch({ tab, width, yearLocked, onChange }: { tab: Tab; width: number; yearLocked: boolean; onChange: (tab: Tab) => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const light = isLight(p);
  const third = (width - 8) / 3;
  const target = TABS.indexOf(tab) * third;
  const offset = useSharedValue(target);
  useEffect(() => { offset.value = reduced ? target : withTiming(target, { duration: 220 }); }, [target, offset, reduced]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: light ? p.soft1 : p.card2 }}>
    <Animated.View style={[{ position: 'absolute', top: 4, left: 4, bottom: 4, width: third, borderRadius: 999, backgroundColor: light ? p.c8 : p.lime, boxShadow: light ? '0px 2px 8px rgba(11,20,70,0.12)' : undefined }, thumb]}/>
    {TABS.map(item => {
      const name = item === 'week' ? 'Week' : item === 'month' ? 'Month' : 'Year';
      const on = tab === item;
      const ink = on ? (light ? p.text : brand.ink) : p.muted;
      return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={item === 'year' && yearLocked ? 'Year, Cubyfit Pro' : name} onPress={() => onChange(item)}
        style={{ flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Text style={{ color: ink, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' }}>{name}</Text>
        {item === 'year' && yearLocked && <Ionicons name="lock-closed" size={12} color={ink}/>}
      </Pressable>;
    })}
  </View>;
}

function NavRow({ title, onPrevious, onNext, canPrevious, previousLocked, canNext, previousLabel, nextLabel }: { title: string; onPrevious: () => void; onNext: () => void; canPrevious: boolean; previousLocked?: boolean; canNext: boolean; previousLabel: string; nextLabel: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
    <CircleButton icon={previousLocked ? 'lock-closed' : 'chevron-back'} label={previousLocked ? `${previousLabel}, Cubyfit Pro` : previousLabel} disabled={!canPrevious} onPress={onPrevious}/>
    <Animated.Text key={title} entering={FadeIn.duration(180)} accessibilityRole="header" style={{ flex: 1, textAlign: 'center', color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16, letterSpacing: -0.3 }}>{title}</Animated.Text>
    <CircleButton icon="chevron-forward" label={nextLabel} disabled={!canNext} onPress={onNext}/>
  </View>;
}

function MonthView({ month, rows, today, selected, locale, width, canPrevious, previousLocked, canNext, onPrevious, onNext, onSelect, detailAllowed }: {
  month: string; rows: Map<string, HistoryDay> | null; today: string; selected: string | null; locale: string; width: number;
  canPrevious: boolean; previousLocked: boolean; canNext: boolean; onPrevious: () => void; onNext: () => void; onSelect: (day: string) => void; detailAllowed: (day: string) => boolean;
}) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const gap = 6;
  const size = Math.min(56, Math.floor((width - gap * 6) / 7));
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(`${month}-15`));
  const row = selected ? rows?.get(selected) : undefined;
  return <>
    <NavRow title={title} onPrevious={onPrevious} onNext={onNext} canPrevious={canPrevious} previousLocked={previousLocked} canNext={canNext} previousLabel="Previous month" nextLabel="Next month"/>
    {rows ? <Animated.View key={month} entering={reduced ? undefined : FadeIn.duration(200)}>
      <MonthGrid month={month} rows={rows} today={today} selected={selected} size={size} gap={gap} locale={locale} onSelect={onSelect}/>
    </Animated.View> : <View style={{ height: size * 6, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.accent}/></View>}
    <HistoryScale/>
    {selected && rows && <DayPanel key={selected} day={selected} row={row} today={today} locale={locale} detail={detailAllowed(selected)}/>}
  </>;
}

function WeekView({ week, rows, today, selected, locale, width, canPrevious, previousLocked, canNext, onPrevious, onNext, onSelect, detailAllowed, isLocked }: {
  week: string; rows: Map<string, HistoryDay> | null; today: string; selected: string | null; locale: string; width: number;
  canPrevious: boolean; previousLocked: boolean; canNext: boolean; onPrevious: () => void; onNext: () => void; onSelect: (day: string) => void; detailAllowed: (day: string) => boolean; isLocked: (day: string) => boolean;
}) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const gap = 6;
  const size = Math.min(56, Math.floor((width - gap * 6) / 7));
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const end = days[6];
  const fmt = (day: string, withYear: boolean) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' as const } : {}) }).format(fromDay(day));
  const title = `${fmt(week, week.slice(0, 4) !== end.slice(0, 4))} \u2013 ${fmt(end, true)}`;
  const row = selected ? rows?.get(selected) : undefined;
  const summary = rows ? [...rows.values()].filter(item => item.eligible > 0 && !isLocked(item.day)) : [];
  const due = summary.reduce((sum, item) => sum + item.eligible, 0), done = summary.reduce((sum, item) => sum + Math.min(item.completed, item.eligible), 0);
  return <>
    <NavRow title={title} onPrevious={onPrevious} onNext={onNext} canPrevious={canPrevious} previousLocked={previousLocked} canNext={canNext} previousLabel="Previous week" nextLabel="Next week"/>
    {rows ? <Animated.View key={week} entering={reduced ? undefined : FadeIn.duration(200)}>
      <WeekRow days={days} rows={rows} today={today} selected={selected} size={size} gap={gap} locale={locale} onSelect={onSelect} isLocked={isLocked}/>
    </Animated.View> : <View style={{ height: size * 2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.accent}/></View>}
    <Text style={{ textAlign: 'center', color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>{due ? `${done} of ${due} habits completed this week \u00b7 ${Math.round(done / due * 100)}%` : 'No habits recorded this week'}</Text>
    <HistoryScale/>
    {selected && rows && !isLocked(selected) && <DayPanel key={selected} day={selected} row={row} today={today} locale={locale} detail={detailAllowed(selected)}/>}
  </>;
}

/** Every completed month can show its locally stored habit detail; future days never do. */
function DayPanel({ day, row, today, locale, detail }: { day: string; row: HistoryDay | undefined; today: string; locale: string; detail: boolean }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const c = historyColors(p);
  const state = cellState(day, today, row);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day));
  const shade = typeof state === 'number' ? state : null;
  const summary = state === 'unavailable' ? 'No record for this day' : state === 'none' ? 'No habits were due' : row ? `${row.completed} of ${row.eligible} habits completed` : '';
  return <Animated.View entering={reduced ? undefined : FadeInDown.duration(220).withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] })}
    style={{ gap: 12, padding: 16, borderRadius: 24, backgroundColor: isLight(p) ? p.c8 : p.card2, borderWidth: 1, borderColor: p.c8Line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: shade === null ? 'transparent' : c.fill[shade], borderWidth: shade === null ? 1 : 0, borderStyle: state === 'unavailable' ? 'dashed' : 'solid', borderColor: c.outline }}>
        <Text style={{ color: shade === null ? p.muted : c.ink[shade], fontFamily: fonts.displayHeavy, fontSize: 15 }}>{row ? percentLabel(row) : '–'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{day === today ? `Today · ${date}` : date}</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>{summary}{day === today && row ? ' · updates as you go' : ''}</Text>
      </View>
    </View>
    {detail && row?.items && row.items.length > 0 && <View style={{ gap: 6 }}>{row.items.map(item => <HistoryItemRow key={item.h} item={item}/>)}</View>}
    {detail && row && !row.items && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>Details for this day could not be read.</Text>}
    {!detail && row && row.eligible > 0 && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>Habit-by-habit details are available for the current month.</Text>}
    {row?.source === 'reconstructed' && <View style={{ flexDirection: 'row', gap: 6 }}><Ionicons name="information-circle-outline" size={14} color={p.muted}/><Text style={{ flex: 1, color: p.muted, fontFamily: fonts.medium, fontSize: 11.5 }}>Rebuilt from your saved completions, recorded before History started. Habits you deleted earlier can’t be included.</Text></View>}
  </Animated.View>;
}

function HistoryItemRow({ item }: { item: HistoryItem }) {
  const p = usePalette();
  const colors = groupColors(p, habitGroup(item.c));
  const done = item.d === 1;
  const ratio = item.t === 'q' && item.g ? Math.max(0, Math.min(1, (item.a ?? 0) / item.g)) : done ? 1 : 0;
  const amount = item.t === 'q' ? `${formatAmount(item.a ?? 0)} / ${formatAmount(item.g ?? 1)} ${item.u ?? ''}`.trim() : null;
  const status = done ? 'Completed' : amount && (item.a ?? 0) > 0 ? 'In progress' : 'Not completed';
  return <View accessibilityLabel={`${item.n}, ${status}${amount ? `, ${amount}` : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: isLight(p) ? p.soft1 : p.card }}>
    <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.solid : colors.soft }}><HabitGlyph icon={item.i} size={18} color={done ? colors.ink : colors.softInk} filled={done}/></View>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14 }}>{item.n}</Text>
      {amount ? <View style={{ gap: 4 }}>
        <Text style={{ color: done ? p.text : p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{amount}</Text>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: p.qTrack, overflow: 'hidden' }}><View style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 2, backgroundColor: p.pgBar }}/></View>
      </View> : <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{status}</Text>}
    </View>
    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.solid : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: p.borderStrong }}>
      {done && <Ionicons name="checkmark" size={15} color={colors.ink}/>}
    </View>
  </View>;
}

function YearView({ year, rows, today, locale, width, canPrevious, canNext, onYear, onMonth, onShare }: {
  year: number; rows: Map<string, HistoryDay> | null; today: string; locale: string; width: number; canPrevious: boolean; canNext: boolean;
  onYear: (delta: number) => void; onMonth: (month: string) => void; onShare: () => void;
}) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const columns = width >= 520 ? 4 : 3;
  const gap = 14;
  const miniWidth = Math.floor((width - gap * (columns - 1)) / columns);
  const current = monthKey(today);
  return <>
    <NavRow title={String(year)} onPrevious={() => onYear(-1)} onNext={() => onYear(1)} canPrevious={canPrevious} canNext={canNext} previousLabel="Previous year" nextLabel="Next year"/>
    {rows ? <Animated.View key={year} entering={reduced ? undefined : FadeIn.duration(220)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: 18 }}>
      {yearMonths(year).map(month => <MiniMonth key={month} month={month} rows={rows} today={today} width={miniWidth} locale={locale} current={month === current} onPress={month <= current ? onMonth : () => undefined}/>)}
    </Animated.View> : <View style={{ height: 320, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.accent}/></View>}
    <HistoryScale/>
    <Pressable accessibilityRole="button" accessibilityLabel={`Share my year ${year}`} onPress={onShare}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, backgroundColor: p.g1 }}>
      <Ionicons name="share-outline" size={18} color={p.plInk}/><Text style={{ color: p.plInk, fontFamily: fonts.bold, fontSize: 15 }}>Share my year</Text>
    </Pressable>
  </>;
}

/** Preview of the exported image; generated and shared entirely on the device. */
function SharePreview({ year, rows, today, locale, width, onBack }: { year: number; rows: Map<string, HistoryDay> | null; today: string; locale: string; width: number; onBack: () => void }) {
  const p = usePalette();
  const ref = useRef<Svg>(null);
  const [busy, setBusy] = useState(false);
  const available = canShareFiles();
  async function share() {
    const svg = ref.current;
    if (!svg || busy) return;
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('The image took too long to generate.')), 8000);
        svg.toDataURL(data => { clearTimeout(timer); resolve(data); }, { width: SHARE_WIDTH, height: SHARE_HEIGHT });
      });
      await shareFile(await writePng(base64, `cubyfit-year-${year}.png`), `My ${year} in Cubyfit`);
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  return <Animated.View entering={FadeIn.duration(200)} style={{ gap: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CircleButton icon="chevron-back" label="Back to year" onPress={onBack}/>
      <Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontFamily: fonts.displayHeavy, fontSize: 19 }}>Share my year</Text>
    </View>
    <View style={{ borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: p.c8Line }}>
      {rows ? <YearShareCard ref={ref} year={year} rows={rows} today={today} locale={locale} width={width - 2}/> : <ActivityIndicator color={p.accent}/>}
    </View>
    <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 }}>Only your year, the day colours and this heading are included — no habit names or account details. The image is made on this phone and is not uploaded.</Text>
    {!available && <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>Sharing images needs the next Cubyfit Dev build.</Text>}
    <Button title={busy ? 'Preparing image…' : 'Share image'} disabled={busy || !available || !rows} onPress={share}/>
  </Animated.View>;
}

function UpgradePrompt({ reason, checking, onUpgrade, onDismiss }: { reason: Exclude<Locked, null>; checking: boolean; onUpgrade: () => void; onDismiss: () => void }) {
  const p = usePalette();
  const light = isLight(p);
  const c = historyColors(p);
  const title = reason === 'year' ? 'See your whole year' : reason === 'share' ? 'Share your year' : 'Look back further';
  const body = reason === 'year' ? 'Cubyfit Pro unlocks the yearly heatmap and every month you have recorded.'
    : reason === 'share' ? 'Cubyfit Pro lets you export a clean image of your year to share.'
    : 'Your earlier months are saved. Cubyfit Pro lets you browse every month you have recorded.';
  return <Animated.View entering={FadeInDown.duration(220).withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })}
    style={{ gap: 14, padding: 18, borderRadius: 26, backgroundColor: light ? brand.violet : p.card2, borderWidth: light ? 0 : 1, borderColor: p.c8Line }}>
    <View style={{ flexDirection: 'row', gap: 4 }}>{c.fill.map((fill, index) => <View key={index} style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: light && index === 3 ? brand.orchid : fill }}/>)}</View>
    <View style={{ gap: 6 }}>
      <Text style={{ color: light ? '#FFFFFF' : p.text, fontFamily: fonts.displayHeavy, fontSize: 20 }}>{title}</Text>
      <Text style={{ color: light ? 'rgba(255,255,255,0.82)' : p.muted, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19 }}>{body}</Text>
      {checking && <Text style={{ color: light ? 'rgba(255,255,255,0.7)' : p.muted, fontFamily: fonts.medium, fontSize: 12 }}>Checking your Cubyfit Pro status…</Text>}
    </View>
    <Pressable accessibilityRole="button" onPress={onUpgrade} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: light ? brand.orchid : p.lime }}>
      <Text style={{ color: brand.ink, fontFamily: fonts.bold, fontSize: 15 }}>See Cubyfit Pro</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={onDismiss} style={{ minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: light ? '#FFFFFF' : p.text, fontFamily: fonts.semibold, fontSize: 13.5 }}>Not now</Text>
    </Pressable>
  </Animated.View>;
}
