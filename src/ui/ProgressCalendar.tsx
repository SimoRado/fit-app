import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, useWindowDimensions, View } from 'react-native';
import { TapPressable as Pressable } from './MotionPressable';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './LocalizedText';
import { BottomSheet } from './BottomSheet';
import { fonts } from './theme';
import { CircleButton, usePalette } from './voltKit';
import { useReducedMotion } from './motion';
import { CalendarMiniMonth, CalendarMonthGrid, HistoryScale, NavRow, UpgradePrompt, WorkoutScale, type CalendarCell, type LockReason, type MiniCell } from './HistoryCalendar';
import { fromDay } from '../core/date';
import { guardMonth, type CalendarAccess } from '../core/calendarAccess';
import { monthKey, shiftMonth, yearMonths } from '../core/habitHistory';

/**
 * The one calendar system used by Habits, Workouts and Nutrition: two header buttons
 * ([Year] [Month] next to each page's main action) that open bottom sheets in the same language as
 * the Habits History sheet. Each page supplies a `cellFor(day)` adapter and its own selected-day
 * details; this file owns navigation, the Free/Pro guard, legends and the upgrade prompts.
 */

/** Visible month + lock state. Every change goes through `guardMonth`, and an expired Pro plan
 *  (or a restored/deep-linked earlier month) falls back to the current month. */
export function useCalendarMonth(access: CalendarAccess) {
  const [month, setMonth] = useState(access.current);
  const [locked, setLocked] = useState<LockReason | null>(null);
  useEffect(() => { if (!access.canBrowseMonth(month)) setMonth(access.current); }, [access, month]);
  useEffect(() => { if (access.isPro) setLocked(null); }, [access.isPro]);
  const go = useCallback((requested: string) => {
    const result = guardMonth(access, requested);
    if (result.locked) { setLocked('months'); return; }
    if (result.month !== requested) return;
    setLocked(null); setMonth(requested);
  }, [access]);
  /** Shows the month of the given day when the plan allows it (no prompt): used when a sheet opens. */
  const focus = useCallback((day: string) => { setLocked(null); if (access.canBrowseMonth(monthKey(day))) setMonth(monthKey(day)); }, [access]);
  return { month, go, focus, locked, setLocked };
}
export type CalendarMonthState = ReturnType<typeof useCalendarMonth>;

/** [Year] [Month] header buttons. Placed immediately left of the page's main action. */
export function CalendarButtons({ onYear, onMonth, yearLocked }: { onYear: () => void; onMonth: () => void; yearLocked: boolean }) {
  return <>
    <CircleButton icon="grid-outline" label={yearLocked ? 'Year calendar, Cubyfit Pro' : 'Year calendar'} onPress={onYear}/>
    <CircleButton icon="calendar-outline" label="Month calendar" onPress={onMonth}/>
  </>;
}

const GAP = 6;
const SHEET_PADDING = 20;
const useSheetWidth = () => { const { width } = useWindowDimensions(); return Math.min(width, 620) - SHEET_PADDING * 2; };

type MonthSheetProps = {
  visible: boolean; onClose: () => void; title: string;
  state: CalendarMonthState; access: CalendarAccess;
  /** Earliest month with data: Pro navigation stops there. */
  firstMonth?: string | null;
  today: string; selected: string | null; locale: string;
  /** `close(after)` closes the sheet first, e.g. to continue in another sheet. */
  onSelect: (day: string, close: (after?: () => void) => void) => void;
  /** null while the month's data loads. */
  cellFor: ((day: string) => CalendarCell) | null;
  legend?: 'progress' | 'workout';
  /** Selected-day details (page-specific); receives the sheet's close function. */
  details?: (close: (after?: () => void) => void) => React.ReactNode;
  onUpgrade: () => void;
  checking?: boolean;
};

/** Month calendar bottom sheet (reference: Habits History → Month). */
export function MonthCalendarSheet(props: MonthSheetProps) {
  return <BottomSheet layout="fixed" fixedHeight="82%" visible={props.visible} title={props.title} onClose={props.onClose}>{close => <MonthBody {...props} close={close}/>}</BottomSheet>;
}

function MonthBody({ state, access, firstMonth, today, selected, locale, onSelect, cellFor, legend = 'progress', details, onUpgrade, checking = false, close }: MonthSheetProps & { close: (after?: () => void) => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const width = useSheetWidth();
  const size = Math.min(56, Math.floor((width - GAP * 6) / 7));
  const { month, go, locked, setLocked } = state;
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1);
  const previousLocked = access.needsPro(previous);
  const canPrevious = previousLocked || (access.canBrowseMonth(previous) && (!firstMonth || previous >= firstMonth));
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(`${month}-15`));
  const select = useCallback((day: string) => onSelect(day, close), [onSelect, close]);
  return <ScrollView contentContainerStyle={{ paddingHorizontal: SHEET_PADDING, paddingBottom: Math.max(24, insets.bottom + 12), gap: 12 }}>
    <NavRow title={title} onPrevious={() => go(previous)} onNext={() => go(next)} canPrevious={canPrevious} previousLocked={previousLocked} canNext={access.canBrowseMonth(next)} previousLabel="Previous month" nextLabel="Next month"/>
    {locked && <UpgradePrompt reason={locked} checking={checking} onUpgrade={() => close(onUpgrade)} onDismiss={() => setLocked(null)}/>}
    {cellFor ? <Animated.View key={month} entering={reduced ? undefined : FadeIn.duration(200)}>
      <CalendarMonthGrid month={month} cellFor={cellFor} today={today} selected={selected} size={size} gap={GAP} locale={locale} onSelect={select}/>
    </Animated.View> : <View style={{ height: size * 6, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.accent}/></View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>{legend === 'workout' ? <WorkoutScale/> : <HistoryScale/>}</View>
      {(month !== access.current || selected !== today) && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { go(access.current); select(today); }} style={{ minHeight: 32, justifyContent: 'center', marginTop: 6 }}>
        <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12 }}>Today</Text>
      </Pressable>}
    </View>
    {details?.(close)}
  </ScrollView>;
}

/**
 * Year calendar bottom sheet. With the verified Pro entitlement it shows the same twelve mini
 * months as the Habits year heatmap (one Pressable per month keeps 365/366 days cheap; tapping a
 * month opens it in the month sheet). Free users get the Pro explanation only — no locked data.
 */
export function YearCalendarSheet({ visible, onClose, access, year, onYear, firstYear, today, locale, miniFor, summaryFor, legend = 'progress', onMonth, onUpgrade, checking = false }: {
  visible: boolean; onClose: () => void; access: CalendarAccess; year: number; onYear: (year: number) => void; firstYear: number; today: string; locale: string;
  /** null while the year's data loads. */
  miniFor: ((day: string) => MiniCell) | null;
  summaryFor: (month: string) => string;
  legend?: 'progress' | 'workout';
  onMonth: (month: string) => void;
  onUpgrade: () => void;
  checking?: boolean;
}) {
  return <BottomSheet layout="fixed" fixedHeight={access.canOpenYear ? '82%' : '60%'} visible={visible} title="Year" onClose={onClose}>{close => access.canOpenYear
    ? <YearBody year={year} onYear={onYear} firstYear={firstYear} today={today} locale={locale} miniFor={miniFor} summaryFor={summaryFor} legend={legend} onMonth={month => close(() => onMonth(month))}/>
    : <YearLocked checking={checking} onUpgrade={() => close(onUpgrade)} onDismiss={() => close()}/>}
  </BottomSheet>;
}

function YearLocked({ checking, onUpgrade, onDismiss }: { checking: boolean; onUpgrade: () => void; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  return <ScrollView contentContainerStyle={{ paddingHorizontal: SHEET_PADDING, paddingBottom: Math.max(24, insets.bottom + 12) }}>
    <UpgradePrompt reason="year" checking={checking} onUpgrade={onUpgrade} onDismiss={onDismiss}/>
  </ScrollView>;
}

function YearBody({ year, onYear, firstYear, today, locale, miniFor, summaryFor, legend, onMonth }: { year: number; onYear: (year: number) => void; firstYear: number; today: string; locale: string; miniFor: ((day: string) => MiniCell) | null; summaryFor: (month: string) => string; legend: 'progress' | 'workout'; onMonth: (month: string) => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const width = useSheetWidth();
  const columns = width >= 520 ? 4 : 3;
  const gap = 14;
  const miniWidth = Math.floor((width - gap * (columns - 1)) / columns);
  const current = monthKey(today);
  const months = useMemo(() => yearMonths(year), [year]);
  return <ScrollView contentContainerStyle={{ paddingHorizontal: SHEET_PADDING, paddingBottom: Math.max(24, insets.bottom + 12), gap: 12 }}>
    <NavRow title={String(year)} onPrevious={() => onYear(year - 1)} onNext={() => onYear(year + 1)} canPrevious={year > firstYear} canNext={year < Number(today.slice(0, 4))} previousLabel="Previous year" nextLabel="Next year"/>
    {miniFor ? <Animated.View key={year} entering={reduced ? undefined : FadeIn.duration(220)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: 18 }}>
      {months.map(month => <CalendarMiniMonth key={month} month={month} miniFor={miniFor} width={miniWidth} locale={locale} current={month === current} summary={summaryFor(month)} onPress={onMonth}/>)}
    </Animated.View> : <View style={{ height: 320, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.accent}/></View>}
    {legend === 'workout' ? <WorkoutScale/> : <HistoryScale/>}
  </ScrollView>;
}
