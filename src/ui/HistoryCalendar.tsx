import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { fonts, type Palette } from './theme';
import { isLight, usePalette } from './voltKit';
import { cellState, monthWeeks, percentLabel, type CellState, type HistoryDay } from '../core/habitHistory';
import { fromDay } from '../core/date';

/**
 * Volt History shades: very pale → light → medium → deep navy on Shore. On the dark appearances
 * navy would vanish, so the same four steps run from a faint to a full ice blue.
 * Neutral states (future, unavailable, no habits due) are outlines, never a colour that reads as 0%.
 */
export function historyColors(p: Readonly<Palette>) {
  const light = isLight(p);
  return {
    fill: light ? ['#E3ECFA', '#C9E3FF', '#9CCBFF', '#1D2E8F'] : ['rgba(156,203,255,0.10)', 'rgba(156,203,255,0.30)', 'rgba(156,203,255,0.60)', '#9CCBFF'],
    ink: light ? ['#4A5679', '#0B1446', '#0B1446', '#FFFFFF'] : ['#A8B0C8', '#EEF6FF', '#EEF6FF', '#0B1446'],
    outline: light ? '#CCDAEE' : 'rgba(255,255,255,0.14)',
    selected: light ? '#0B1446' : '#EEF6FF',
  };
}
export type HistoryColors = ReturnType<typeof historyColors>;

export const LEGEND: { level: 0 | 1 | 2 | 3; label: string }[] = [{ level: 0, label: '0%' }, { level: 1, label: '1–33%' }, { level: 2, label: '34–67%' }, { level: 3, label: '68–100%' }];

function cellLabel(day: string, state: CellState, row: HistoryDay | undefined, locale: string) {
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day));
  if (state === 'future') return `${date}, upcoming`;
  if (state === 'unavailable') return `${date}, no record`;
  if (state === 'none' || !row) return `${date}, no habits due`;
  return `${date}, ${percentLabel(row)} complete, ${row.completed} of ${row.eligible} habits`;
}

/** Large month grid (reference 1). Cells are rounded squares sized to fill seven equal columns. */
export const MonthGrid = memo(function MonthGrid({ month, rows, today, selected, size, locale, onSelect }: {
  month: string; rows: ReadonlyMap<string, HistoryDay>; today: string; selected: string | null; size: number; locale: string; onSelect: (day: string) => void;
}) {
  const p = usePalette();
  const c = historyColors(p);
  const gap = Math.max(4, Math.round(size * 0.13));
  const weeks = monthWeeks(month);
  const weekdayNames = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 10, 16 + index, 12)));
  return <View style={{ gap }}>
    <View style={{ flexDirection: 'row', gap }}>
      {weekdayNames.map((name, index) => <Text key={index} style={{ width: size, textAlign: 'center', color: p.muted, fontFamily: fonts.bold, fontSize: 11 }}>{name}</Text>)}
    </View>
    {weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
      {week.map((day, column) => {
        if (!day) return <View key={column} style={{ width: size, height: size }}/>;
        const row = rows.get(day);
        const state = cellState(day, today, row);
        const shaded = typeof state === 'number';
        const on = day === selected;
        const isToday = day === today;
        return <Pressable key={day} disabled={state === 'future'} onPress={() => onSelect(day)} accessibilityRole="button" accessibilityState={{ selected: on, disabled: state === 'future' }} accessibilityLabel={cellLabel(day, state, row, locale) + (isToday ? ', today' : '')}
          style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), padding: 2, borderWidth: 2, borderColor: on ? c.selected : 'transparent' }}>
          <View style={{ flex: 1, borderRadius: Math.round(size * 0.24), alignItems: 'center', justifyContent: 'center',
            backgroundColor: shaded ? c.fill[state] : 'transparent',
            borderWidth: shaded ? 0 : 1, borderStyle: state === 'unavailable' ? 'dashed' : 'solid', borderColor: state === 'future' ? 'transparent' : c.outline }}>
            <Text style={{ color: shaded ? c.ink[state] : p.muted, opacity: state === 'future' ? 0.45 : 1, fontFamily: isToday ? fonts.displayHeavy : fonts.bold, fontSize: Math.round(size * 0.32), textDecorationLine: isToday ? 'underline' : 'none' }}>{fromDay(day).getDate()}</Text>
            {state === 'none' && <View style={{ position: 'absolute', bottom: Math.round(size * 0.06), width: 4, height: 4, borderRadius: 2, backgroundColor: c.outline }}/>}
          </View>
        </Pressable>;
      })}
    </View>)}
  </View>;
});

/** Twelve of these make the year heatmap (reference 2). One Pressable per month, plain Views per day. */
export const MiniMonth = memo(function MiniMonth({ month, rows, today, width, locale, onPress, current }: {
  month: string; rows: ReadonlyMap<string, HistoryDay>; today: string; width: number; locale: string; onPress: (month: string) => void; current: boolean;
}) {
  const p = usePalette();
  const c = historyColors(p);
  const gap = 2;
  const cell = Math.floor((width - gap * 6) / 7);
  const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromDay(`${month}-15`));
  const weeks = monthWeeks(month);
  let done = 0, tracked = 0;
  for (const row of rows.values()) if (row.day.startsWith(month) && row.eligible) { tracked++; done += row.percent; }
  const average = tracked ? Math.round(done / tracked) : null;
  return <Pressable onPress={() => onPress(month)} accessibilityRole="button"
    accessibilityLabel={`${new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(`${month}-15`))}${average === null ? ', no record' : `, average ${average}%`}. Open month`}
    style={{ width, gap: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={{ color: current ? p.text : p.muted, fontFamily: current ? fonts.displayHeavy : fonts.bold, fontSize: 12.5 }}>{name}</Text>
      {average !== null && <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 10 }}>{average}%</Text>}
    </View>
    <View style={{ gap }}>
      {weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
        {week.map((day, column) => {
          if (!day) return <View key={column} style={{ width: cell, height: cell }}/>;
          const state = cellState(day, today, rows.get(day));
          const shaded = typeof state === 'number';
          return <View key={day} style={{ width: cell, height: cell, borderRadius: Math.max(2, Math.round(cell * 0.28)),
            backgroundColor: shaded ? c.fill[state] : 'transparent', borderWidth: shaded || state === 'future' ? 0 : 1, borderColor: c.outline,
            opacity: state === 'future' ? 0.4 : 1, ...(state === 'future' ? { backgroundColor: c.outline } : {}) }}/>;
        })}
      </View>)}
    </View>
  </Pressable>;
});

export function HistoryLegend({ compact = false }: { compact?: boolean }) {
  const p = usePalette();
  const c = historyColors(p);
  return <View accessibilityLabel="Legend: 0 percent, 1 to 33 percent, 34 to 67 percent, 68 to 100 percent" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: compact ? 10 : 14, rowGap: 6 }}>
    {LEGEND.map(item => <View key={item.level} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: c.fill[item.level] }}/>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11 }}>{item.label}</Text>
    </View>)}
  </View>;
}

/** Small key for the neutral outlines, shown under the month grid. */
export function NeutralKey() {
  const p = usePalette();
  const c = historyColors(p);
  const swatch = (dashed: boolean, dot: boolean) => <View style={{ width: 12, height: 12, borderRadius: 4, borderWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderColor: c.outline, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 1 }}>{dot && <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.outline }}/>}</View>;
  return <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{swatch(false, true)}<Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 10.5 }}>No habits due</Text></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{swatch(true, false)}<Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 10.5 }}>No record</Text></View>
  </View>;
}

export function LockBadge({ size = 14 }: { size?: number }) {
  const p = usePalette();
  return <Ionicons name="lock-closed" size={size} color={p.muted}/>;
}
