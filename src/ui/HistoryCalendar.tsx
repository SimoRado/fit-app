import React, { memo } from 'react';
import { View } from 'react-native';
import { TapPressable as Pressable } from './MotionPressable';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Text } from './LocalizedText';
import { alpha, brand, fonts, type Palette } from './theme';
import { CircleButton, isLight, usePalette } from './voltKit';
import { cellState, monthWeeks, percentLabel, type CellState, type HistoryDay } from '../core/habitHistory';
import { fromDay } from '../core/date';

/**
 * History intensity scale (reference: very pale → pale → sky → deep navy on Volt
 * Light). Derived from the active style's palette, so Lotus runs the same four
 * steps in lilac → violet. Neutral states (future, no record, no habits due)
 * are faint tiles or outlines, never a colour that reads as 0%.
 */
export function historyColors(p: Readonly<Palette>) {
  const light = isLight(p);
  return {
    fill: light ? [p.chartTrack, p.paleBlue, p.blue, p.accent] : [alpha(p.blue, 0.1), alpha(p.blue, 0.3), alpha(p.blue, 0.6), p.blue],
    ink: light ? [p.muted, p.text, p.text, '#FFFFFF'] : [p.muted, p.text, p.text, p.accentInk],
    /** Future / no-record days: a faint tile on the sheet. */
    empty: light ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.04)',
    outline: light ? p.borderStrong : 'rgba(255,255,255,0.14)',
    selected: p.text,
  };
}
export type HistoryColors = ReturnType<typeof historyColors>;

export const LEGEND: { level: 0 | 1 | 2 | 3; label: string }[] = [{ level: 0, label: '0%' }, { level: 1, label: '1–33%' }, { level: 2, label: '34–67%' }, { level: 3, label: '68–100%' }];

/** History weeks start on Sunday, as in the reference calendar. */
export const HISTORY_WEEK_START = 0 as const;

// ---------------------------------------------------------------------------
// Shared cell model. Every calendar (Habits, Workouts, Nutrition) describes a day with this, so
// all three draw the same rounded squares, colours, selection ring and icons.

export type Shade = 0 | 1 | 2 | 3;
export type CalendarIcon = 'moon' | 'barbell';
export type CalendarCell = {
  /** Intensity step, or null for a neutral (uncoloured) tile. */
  shade: Shade | null;
  /** Neutral variants: `none` = outlined (nothing was due), `future` = faded number. */
  tone?: 'empty' | 'none' | 'future';
  /** Small marker under the number (rest day, planned training). */
  icon?: CalendarIcon;
  /** Screen-reader description of the day (date + status). */
  label: string;
  disabled?: boolean;
  locked?: boolean;
};
const ICONS: Record<CalendarIcon, React.ComponentProps<typeof Ionicons>['name']> = { moon: 'moon', barbell: 'barbell' };

export const dayLabel = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day));

/** One rounded-square day. Disabled days are not pressable; locked days show a small lock. */
export const CalendarTile = memo(function CalendarTile({ day, cell, today, selected, size, onSelect }: { day: string; cell: CalendarCell; today: string; selected: boolean; size: number; onSelect: (day: string) => void }) {
  const p = usePalette();
  const c = historyColors(p);
  const shaded = cell.shade !== null;
  const isToday = day === today;
  const disabled = !!cell.disabled || !!cell.locked;
  const radius = Math.round(size * 0.26);
  const ink = shaded ? c.ink[cell.shade!] : p.muted;
  const iconColor = cell.icon === 'barbell' ? p.accent : shaded ? c.ink[cell.shade!] : p.muted;
  return <Pressable disabled={disabled} onPress={() => onSelect(day)} accessibilityRole="button" accessibilityState={{ selected, disabled }}
    accessibilityLabel={cell.locked ? `${cell.label}, Cubyfit Pro` : cell.label + (isToday ? ', today' : '')}
    style={{ width: size, height: size, borderRadius: radius + 2, padding: selected ? 2 : 0, borderWidth: selected ? 2 : 0, borderColor: c.selected }}>
    <View style={{ flex: 1, borderRadius: selected ? radius - 1 : radius, alignItems: 'center', justifyContent: 'center',
      backgroundColor: shaded ? c.fill[cell.shade!] : c.empty,
      borderWidth: cell.tone === 'none' ? 1 : 0, borderColor: c.outline }}>
      {cell.locked ? <Ionicons name="lock-closed" size={Math.round(size * 0.26)} color={p.muted}/>
        : <Text style={{ color: ink, opacity: cell.tone === 'future' ? 0.5 : 1, fontFamily: isToday ? fonts.displayHeavy : fonts.bold, fontSize: Math.round(size * (cell.icon ? 0.27 : 0.3)), lineHeight: Math.round(size * (cell.icon ? 0.32 : 0.38)) }}>{fromDay(day).getDate()}</Text>}
      {!cell.locked && cell.icon && <Ionicons name={ICONS[cell.icon]} size={Math.max(8, Math.round(size * 0.22))} color={iconColor}/>}
      {cell.tone === 'none' && !cell.icon && <View style={{ position: 'absolute', bottom: Math.round(size * 0.08), width: 4, height: 4, borderRadius: 2, backgroundColor: c.outline }}/>}
    </View>
  </Pressable>;
});

/** Narrow weekday names, Sunday first. */
export function weekdayInitials(locale: string) {
  return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 10, 15 + index, 12)));
}

/** Weekday header row aligned to the cells. */
export function WeekdayHeader({ size, gap, locale }: { size: number; gap: number; locale: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', gap }}>
    {weekdayInitials(locale).map((name, index) => <Text key={index} style={{ width: size, textAlign: 'center', color: p.muted, fontFamily: fonts.bold, fontSize: 11.5 }}>{name}</Text>)}
  </View>;
}

/** Generic month grid: seven equal columns of rounded squares, Sunday first. */
export const CalendarMonthGrid = memo(function CalendarMonthGrid({ month, cellFor, today, selected, size, gap, locale, onSelect }: {
  month: string; cellFor: (day: string) => CalendarCell; today: string; selected: string | null; size: number; gap: number; locale: string; onSelect: (day: string) => void;
}) {
  const weeks = monthWeeks(month, HISTORY_WEEK_START);
  return <View style={{ gap, alignItems: 'center' }}>
    <WeekdayHeader size={size} gap={gap} locale={locale}/>
    {weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
      {week.map((day, column) => day
        ? <CalendarTile key={day} day={day} cell={cellFor(day)} today={today} selected={day === selected} size={size} onSelect={onSelect}/>
        : <View key={column} style={{ width: size, height: size }}/>)}
    </View>)}
  </View>;
});

// ---------------------------------------------------------------------------
// Habits adapter (History sheet + Habits page).

function cellLabel(day: string, state: CellState, row: HistoryDay | undefined, locale: string) {
  const date = dayLabel(day, locale);
  if (state === 'future') return `${date}, upcoming`;
  if (state === 'unavailable') return `${date}, no record`;
  if (state === 'none' || !row) return `${date}, no habits due`;
  return `${date}, ${percentLabel(row)} complete, ${row.completed} of ${row.eligible} habits`;
}

/** Habit day → shared cell. `futureSelectable` lets the Habits page open upcoming days for planning. */
export function habitCell(day: string, today: string, row: HistoryDay | undefined, locale: string, locked = false, futureSelectable = false): CalendarCell {
  if (locked) return { shade: null, label: cellLabel(day, 'unavailable', undefined, locale), locked: true };
  const state = cellState(day, today, row);
  const label = cellLabel(day, state, row, locale);
  if (typeof state === 'number') return { shade: state, label };
  return { shade: null, tone: state === 'future' ? 'future' : state === 'none' ? 'none' : 'empty', label, disabled: state === 'future' && !futureSelectable };
}

/** One habit day (History sheet). */
export function DayCell({ day, row, today, selected, size, locale, onSelect, locked = false }: { day: string; row: HistoryDay | undefined; today: string; selected: boolean; size: number; locale: string; onSelect: (day: string) => void; locked?: boolean }) {
  return <CalendarTile day={day} cell={habitCell(day, today, row, locale, locked)} today={today} selected={selected} size={size} onSelect={onSelect}/>;
}

/** Month grid (reference): seven equal columns of rounded squares, Sunday first. */
export const MonthGrid = memo(function MonthGrid({ month, rows, today, selected, size, gap, locale, onSelect }: {
  month: string; rows: ReadonlyMap<string, HistoryDay>; today: string; selected: string | null; size: number; gap: number; locale: string; onSelect: (day: string) => void;
}) {
  const weeks = monthWeeks(month, HISTORY_WEEK_START);
  return <View style={{ gap, alignItems: 'center' }}>
    <WeekdayHeader size={size} gap={gap} locale={locale}/>
    {weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
      {week.map((day, column) => day
        ? <DayCell key={day} day={day} row={rows.get(day)} today={today} selected={day === selected} size={size} locale={locale} onSelect={onSelect}/>
        : <View key={column} style={{ width: size, height: size }}/>)}
    </View>)}
  </View>;
});

/** One week (Week tab). Days in months the plan does not include are shown locked. */
export const WeekRow = memo(function WeekRow({ days, rows, today, selected, size, gap, locale, onSelect, isLocked }: {
  days: string[]; rows: ReadonlyMap<string, HistoryDay>; today: string; selected: string | null; size: number; gap: number; locale: string; onSelect: (day: string) => void; isLocked: (day: string) => boolean;
}) {
  return <View style={{ gap, alignItems: 'center' }}>
    <WeekdayHeader size={size} gap={gap} locale={locale}/>
    <View style={{ flexDirection: 'row', gap }}>
      {days.map(day => <DayCell key={day} day={day} row={rows.get(day)} today={today} selected={day === selected} size={size} locale={locale} onSelect={onSelect} locked={isLocked(day)}/>)}
    </View>
  </View>;
});

// ---------------------------------------------------------------------------
// Year heatmap: twelve mini months. One Pressable per month, plain Views per day.

/** Mini day: an intensity step (or none) plus an optional centre dot (e.g. planned training). */
export type MiniCell = { shade: Shade | null; dot?: boolean };

export const CalendarMiniMonth = memo(function CalendarMiniMonth({ month, miniFor, width, locale, onPress, current, summary, showDays = true }: {
  month: string; miniFor: (day: string) => MiniCell; width: number; locale: string; onPress: (month: string) => void; current: boolean; summary: string; showDays?: boolean;
}) {
  const p = usePalette();
  const c = historyColors(p);
  const gap = 2;
  const cell = Math.min(8, Math.floor((width - gap * 6) / 7));
  const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromDay(`${month}-15`));
  const weeks = monthWeeks(month, HISTORY_WEEK_START);
  return <Pressable onPress={() => onPress(month)} accessibilityRole="button"
    accessibilityLabel={`${new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(`${month}-15`))}, ${summary}. Open month`}
    style={{ width, minHeight: 88, gap: 5, padding: current ? 5 : 0, borderWidth: current ? 1 : 0, borderColor: c.selected, borderRadius: 15 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={{ color: current ? p.text : p.muted, fontFamily: current ? fonts.displayHeavy : fonts.bold, fontSize: 12.5 }}>{name}</Text>
    </View>
    <View style={{ gap }}>
      {showDays && weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
        {week.map((day, column) => {
          if (!day) return <View key={column} style={{ width: cell, height: cell }}/>;
          const mini = miniFor(day);
          return <View key={day} style={{ width: cell, height: cell, borderRadius: Math.max(2, Math.round(cell * 0.28)), alignItems: 'center', justifyContent: 'center',
            backgroundColor: mini.shade !== null ? c.fill[mini.shade] : 'transparent' }}>
            {mini.dot && <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: p.accent }}/>}
          </View>;
        })}
      </View>)}
    </View>
  </Pressable>;
});

/** Habits mini month: hidden days until something was recorded, average in the label. */
export const MiniMonth = memo(function MiniMonth({ month, rows, today, width, locale, onPress, current }: {
  month: string; rows: ReadonlyMap<string, HistoryDay>; today: string; width: number; locale: string; onPress: (month: string) => void; current: boolean;
}) {
  let done = 0, tracked = 0;
  for (const row of rows.values()) if (row.day.startsWith(month) && row.eligible) { tracked++; done += row.percent; }
  const average = tracked ? Math.round(done / tracked) : null;
  const miniFor = (day: string): MiniCell => { const state = cellState(day, today, rows.get(day)); return { shade: typeof state === 'number' ? state : null }; };
  return <CalendarMiniMonth month={month} miniFor={miniFor} width={width} locale={locale} onPress={onPress} current={current} showDays={tracked > 0} summary={average === null ? 'no record' : `average ${average}%`}/>;
});

// ---------------------------------------------------------------------------
// Shared chrome: navigation row, legends and the Pro prompt.

export function NavRow({ title, onPrevious, onNext, canPrevious, previousLocked, canNext, previousLabel, nextLabel, size }: { title: string; onPrevious: () => void; onNext: () => void; canPrevious: boolean; previousLocked?: boolean; canNext: boolean; previousLabel: string; nextLabel: string; size?: number }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
    <CircleButton icon={previousLocked ? 'lock-closed' : 'chevron-back'} size={size} label={previousLocked ? `${previousLabel}, Cubyfit Pro` : previousLabel} disabled={!canPrevious} onPress={onPrevious}/>
    <Animated.Text key={title} entering={FadeIn.duration(180)} accessibilityRole="header" style={{ flex: 1, textAlign: 'center', color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16, letterSpacing: -0.3 }}>{title}</Animated.Text>
    <CircleButton icon="chevron-forward" size={size} label={nextLabel} disabled={!canNext} onPress={onNext}/>
  </View>;
}

/** Compact "Less ▢▢▢▢ More" key shown beneath the calendar. */
export function HistoryScale() {
  const p = usePalette();
  const c = historyColors(p);
  return <View accessibilityLabel="Completion heatmap, less to more, from 0 to 100 percent" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
    <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11, marginRight: 6 }}>Less</Text>
    {c.fill.map((fill, index) => <View key={index} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: fill }}/>)}
    <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11, marginLeft: 4 }}>More</Text>
  </View>;
}

/** Workouts key: done (full), rest (light + moon), planned (neutral + dumbbell). */
export function WorkoutScale() {
  const p = usePalette();
  const c = historyColors(p);
  const item = (fill: string, label: string, icon?: CalendarIcon, outline = false) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    <View style={{ width: 14, height: 14, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: fill, borderWidth: outline ? 1 : 0, borderColor: c.outline }}>{icon && <Ionicons name={ICONS[icon]} size={9} color={icon === 'barbell' ? p.accent : p.muted}/>}</View>
    <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11 }}>{label}</Text>
  </View>;
  return <View accessibilityLabel="Key: full colour is a completed workout, light colour with a moon is a rest day, a dumbbell is planned training" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 6 }}>
    {item(c.fill[3], 'Done')}{item(c.fill[1], 'Rest', 'moon')}{item(c.empty, 'Planned', 'barbell', true)}
  </View>;
}

export type LockReason = 'months' | 'year' | 'share';
export function UpgradePrompt({ reason, checking, onUpgrade, onDismiss }: { reason: LockReason; checking: boolean; onUpgrade: () => void; onDismiss: () => void }) {
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
