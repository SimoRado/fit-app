import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { alpha, fonts, type Palette } from './theme';
import { isLight, usePalette } from './voltKit';
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

function cellLabel(day: string, state: CellState, row: HistoryDay | undefined, locale: string) {
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day));
  if (state === 'future') return `${date}, upcoming`;
  if (state === 'unavailable') return `${date}, no record`;
  if (state === 'none' || !row) return `${date}, no habits due`;
  return `${date}, ${percentLabel(row)} complete, ${row.completed} of ${row.eligible} habits`;
}

/** Narrow weekday names, Sunday first. */
export function weekdayInitials(locale: string) {
  return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 10, 15 + index, 12)));
}

/** One rounded-square day. Future days are not pressable; locked days show a small lock. */
export function DayCell({ day, row, today, selected, size, locale, onSelect, locked = false }: { day: string; row: HistoryDay | undefined; today: string; selected: boolean; size: number; locale: string; onSelect: (day: string) => void; locked?: boolean }) {
  const p = usePalette();
  const c = historyColors(p);
  const state = locked ? 'unavailable' : cellState(day, today, row);
  const shaded = typeof state === 'number';
  const isToday = day === today;
  const disabled = state === 'future' || locked;
  const radius = Math.round(size * 0.26);
  return <Pressable disabled={disabled} onPress={() => onSelect(day)} accessibilityRole="button" accessibilityState={{ selected, disabled }}
    accessibilityLabel={locked ? `${cellLabel(day, 'unavailable', undefined, locale)}, Cubyfit Pro` : cellLabel(day, state, row, locale) + (isToday ? ', today' : '')}
    style={{ width: size, height: size, borderRadius: radius + 2, padding: selected ? 2 : 0, borderWidth: selected ? 2 : 0, borderColor: c.selected }}>
    <View style={{ flex: 1, borderRadius: selected ? radius - 1 : radius, alignItems: 'center', justifyContent: 'center',
      backgroundColor: shaded ? c.fill[state] : c.empty,
      borderWidth: state === 'none' ? 1 : 0, borderColor: c.outline }}>
      {locked ? <Ionicons name="lock-closed" size={Math.round(size * 0.26)} color={p.muted}/>
        : <Text style={{ color: shaded ? c.ink[state] : p.muted, opacity: state === 'future' ? 0.5 : 1, fontFamily: isToday ? fonts.displayHeavy : fonts.bold, fontSize: Math.round(size * 0.3) }}>{fromDay(day).getDate()}</Text>}
      {state === 'none' && <View style={{ position: 'absolute', bottom: Math.round(size * 0.08), width: 4, height: 4, borderRadius: 2, backgroundColor: c.outline }}/>}
    </View>
  </Pressable>;
}

/** Weekday header row aligned to the cells. */
export function WeekdayHeader({ size, gap, locale }: { size: number; gap: number; locale: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', gap }}>
    {weekdayInitials(locale).map((name, index) => <Text key={index} style={{ width: size, textAlign: 'center', color: p.muted, fontFamily: fonts.bold, fontSize: 11.5 }}>{name}</Text>)}
  </View>;
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

/** Twelve of these make the year heatmap. One Pressable per month, plain Views per day. */
export const MiniMonth = memo(function MiniMonth({ month, rows, today, width, locale, onPress, current }: {
  month: string; rows: ReadonlyMap<string, HistoryDay>; today: string; width: number; locale: string; onPress: (month: string) => void; current: boolean;
}) {
  const p = usePalette();
  const c = historyColors(p);
  const gap = 2;
  const cell = Math.min(8, Math.floor((width - gap * 6) / 7));
  const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromDay(`${month}-15`));
  const weeks = monthWeeks(month, HISTORY_WEEK_START);
  let done = 0, tracked = 0;
  for (const row of rows.values()) if (row.day.startsWith(month) && row.eligible) { tracked++; done += row.percent; }
  const average = tracked ? Math.round(done / tracked) : null;
  return <Pressable onPress={() => onPress(month)} accessibilityRole="button"
    accessibilityLabel={`${new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(`${month}-15`))}${average === null ? ', no record' : `, average ${average}%`}. Open month`}
    style={{ width, minHeight: 88, gap: 5, padding: current ? 5 : 0, borderWidth: current ? 1 : 0, borderColor: c.selected, borderRadius: 15 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={{ color: current ? p.text : p.muted, fontFamily: current ? fonts.displayHeavy : fonts.bold, fontSize: 12.5 }}>{name}</Text>
    </View>
    <View style={{ gap }}>
      {tracked > 0 && weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
        {week.map((day, column) => {
          if (!day) return <View key={column} style={{ width: cell, height: cell }}/>;
          const state = cellState(day, today, rows.get(day));
          const shaded = typeof state === 'number';
          return <View key={day} style={{ width: cell, height: cell, borderRadius: Math.max(2, Math.round(cell * 0.28)),
            backgroundColor: shaded ? c.fill[state] : 'transparent' }}/>;
        })}
      </View>)}
    </View>
  </Pressable>;
});

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
