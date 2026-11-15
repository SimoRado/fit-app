import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { fonts } from './theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './components';
import { MotionPressable } from './MotionPressable';
import { DayPills, usePalette } from './voltKit';
import { addDays, dayKey, daysBetween, fromDay } from '../core/date';
import { weekDays } from '../core/weekCalendar';

/**
 * Volt month chip + seven-day pills (reference 5, as on Home) with the
 * "Choose a date" month sheet. Monday-first like Nutrition and Train.
 * `open`/`onOpenChange` let a header calendar button open the same sheet.
 */
export function MonthWeekCalendar({ selected, onSelect, locale = 'en-US', marker, maxDay, open, onOpenChange }: {
  selected: string;
  onSelect: (day: string) => void;
  locale?: string;
  marker?: (day: string) => React.ReactNode;
  maxDay?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const p = usePalette();
  const today = dayKey();
  const [cursor, setCursor] = useState(() => fromDay(selected));
  const week = useMemo(() => weekDays(selected, 1), [selected]);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromDay(selected));
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return daysBetween(dayKey(first), addDays(dayKey(first), 41));
  }, [cursor]);
  const canNextMonth = !maxDay || new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) <= fromDay(maxDay);
  const openSheet = () => { setCursor(fromDay(selected)); onOpenChange(true); };
  return <View style={{ gap: 10 }}>
    <MotionPressable pressScale={0.96} accessibilityRole="button" accessibilityLabel={`Choose date, ${monthLabel}`} onPress={openSheet}
      style={{ alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 999, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line }}>
      <Ionicons name="calendar-outline" size={15} color={p.text}/><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{monthLabel}</Text><Ionicons name="chevron-down" size={14} color={p.text}/>
    </MotionPressable>
    <DayPills selected={selected} onSelect={onSelect} days={week.map(day => ({
      key: day,
      number: String(fromDay(day).getDate()),
      label: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)),
      disabled: !!maxDay && day > maxDay,
      today: day === today,
      accessibilityLabel: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day)) + (day === today ? ', today' : ''),
      marker: marker?.(day),
    }))}/>
    <BottomSheet visible={open} title="Choose a date" onClose={() => onOpenChange(false)}>{close => <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setCursor(value => new Date(value.getFullYear(), value.getMonth() - 1, 1, 12))} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={20} color={p.text}/></Pressable>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18 }}>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canNextMonth }} disabled={!canNextMonth} onPress={() => setCursor(value => new Date(value.getFullYear(), value.getMonth() + 1, 1, 12))} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: canNextMonth ? 1 : 0.35 }}><Ionicons name="chevron-forward" size={20} color={p.text}/></Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>{grid.slice(0, 7).map(day => <Text key={day} style={{ width: '14.285%', color: p.muted, textAlign: 'center', fontFamily: fonts.bold, fontSize: 10 }}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)).slice(0, 2)}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
        {grid.map(day => {
          const on = day === selected;
          const outside = fromDay(day).getMonth() !== cursor.getMonth();
          const blocked = !!maxDay && day > maxDay;
          return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: on, disabled: blocked }} disabled={blocked}
            accessibilityLabel={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromDay(day))}
            onPress={() => { onSelect(day); close(); }}
            style={{ width: '14.285%', minHeight: 42, alignItems: 'center', justifyContent: 'center', opacity: blocked ? 0.3 : 1 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? p.g1 : 'transparent', borderWidth: !on && day === today ? 1.5 : 0, borderColor: p.accent }}>
              <Text style={{ color: on ? p.plInk : outside ? p.muted : p.text, fontFamily: fonts.bold, fontSize: 13.5, opacity: outside && !on ? 0.55 : 1 }}>{fromDay(day).getDate()}</Text>
            </View>
          </Pressable>;
        })}
      </View>
      <Button title="Today" kind="ghost" disabled={selected === today} onPress={() => { onSelect(today); close(); }}/>
    </View>}</BottomSheet>
  </View>;
}
