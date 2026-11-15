/**
 * Shared seven-day week selector (Volt day pills + week range header with previous/next controls).
 * Screens choose the rules: Train allows today and the future only; Nutrition allows the past only.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './LocalizedText';
import { fonts } from './theme';
import { CircleButton, DayPills, usePalette, type DayPill } from './voltKit';
import { dayKey, fromDay } from '../core/date';
import { daySelectable, moveSelectionByWeek, weekDays, weekNavigation, weekRangeLabel, type WeekRules } from '../core/weekCalendar';

export function WeekCalendar({ selected, onSelect, rules = {}, locale = 'en-US', marker, todayLabel = 'Today', onDayPress }: {
  /** Selected day; the visible week is the week containing it. */
  selected: string;
  onSelect: (day: string) => void;
  rules?: WeekRules;
  locale?: string;
  /** Optional per-day marker (plan dot, logged indicator…). */
  marker?: (day: string) => React.ReactNode;
  todayLabel?: string;
  /** Called after a day is selected by tapping its pill (e.g. to open a planning sheet). */
  onDayPress?: (day: string) => void;
}) {
  const p = usePalette();
  const today = dayKey();
  const days = weekDays(selected, rules.startsOn);
  const { canPrevious, canNext } = weekNavigation(selected, rules);
  const showToday = !days.includes(today) || selected !== today;
  const pills: DayPill[] = days.map(day => ({
    key: day,
    number: String(fromDay(day).getDate()),
    label: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromDay(day)),
    disabled: !daySelectable(day, rules),
    today: day === today,
    accessibilityLabel: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromDay(day)) + (day === today ? ', today' : ''),
    marker: marker?.(day),
  }));
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <CircleButton icon="chevron-back" size={34} label="Previous week" disabled={!canPrevious} onPress={() => onSelect(moveSelectionByWeek(selected, -1, rules))}/>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14 }}>{weekRangeLabel(selected, locale, rules.startsOn, today)}</Text>
        {showToday && daySelectable(today, rules)
          ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onSelect(today)}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 11.5 }}>{todayLabel}</Text></Pressable>
          : <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{days.includes(today) ? 'This week' : ' '}</Text>}
      </View>
      <CircleButton icon="chevron-forward" size={34} label="Next week" disabled={!canNext} onPress={() => onSelect(moveSelectionByWeek(selected, 1, rules))}/>
    </View>
    <DayPills days={pills} selected={selected} onSelect={day => { onSelect(day); onDayPress?.(day); }}/>
  </View>;
}
