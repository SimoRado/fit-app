import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../ui/LocalizedText';
import { addDays, dayKey, fromDay, weekStart } from '../../core/date';
import { habitDone, habitRate, habitStreak, scheduled } from '../../core/logic';
import { Habit, HabitCompletion } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Choices, Empty, Page, styles, confirm, message } from '../../ui/components';
import { HabitCheck, ProgressBar, SectionHeader } from '../../ui/visuals';
import { colors, fonts } from '../../ui/theme';
import { reconcileReminders } from '../../services/reminders';
import { DisplayMetric } from '../../ui/DisplayMetric';

export default function Habits() {
  const { revision, changed, language } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [selected, setSelected] = useState(dayKey());
  const [category, setCategory] = useState('All');
  const today = dayKey();
  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions()]).then(([allHabits, allCompletions]) => {
      setHabits(allHabits); setCompletions(allCompletions);
    }).catch(message);
  }, [revision]);

  const due = habits.filter(habit => scheduled(habit, selected) && (category === 'All' || habit.category === category));
  const rate = habitRate(habits, completions, selected, selected);
  const categories = ['All', ...new Set(habits.map(habit => habit.category))];
  async function setCompletion(id: string, completed: boolean) {
    try { await repo.setHabitCompletion(id, today, completed); changed(); }
    catch (error) { message(error); }
  }
  async function deleteHabit(id: string) {
    try { await repo.remove('habits', id); await reconcileReminders(); changed(); }
    catch (error) { message(error); }
  }

  return <Page title="Habits">
    <View style={[styles.row, { alignItems: 'flex-end' }]}>
      <DisplayMetric value={rate.percent + '%'} size={100}/>
      <View style={{ flex: 1, minWidth: 90, paddingBottom: 8 }}><Text style={styles.text}>{selected === today ? 'Today' : selected}</Text><Text style={styles.muted}>{rate.done} / {rate.due} done</Text></View>
    </View>
    <ProgressBar value={rate.due ? rate.done / rate.due : 0}/>
    <View style={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 4, marginVertical: 8 }}>
      {Array.from({ length: 7 }, (_, index) => addDays(today, index - 6)).map(day => {
        const dayRate = habitRate(habits, completions, day, day);
        const isSelected = selected === day;
        return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={day} onPress={() => setSelected(day)} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 7, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: isSelected ? colors.accent : colors.border, backgroundColor: isSelected ? colors.card2 : 'transparent' }}>
          <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>{new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(fromDay(day))}</Text>
          <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, borderColor: dayRate.due && dayRate.done === dayRate.due ? colors.accent : colors.border, backgroundColor: dayRate.due && dayRate.done === dayRate.due ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{dayRate.due > 0 && dayRate.done === dayRate.due && <Text style={{ color: colors.accentText }}>✓</Text>}</View>
          <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 12, textAlign: 'center' }}>{new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(fromDay(day))}</Text>
        </Pressable>;
      })}
    </View>
    <Choices label="Category" options={categories} value={category} onChange={setCategory} pill/>
    <Button title="Create habit" onPress={() => router.push('/habit-form')}/>
    {due.length ? due.map(habit => {
      const done = habitDone(habit, completions, selected);
      const currentStreak = habitStreak(habit, completions).current;
      return <View key={habit.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 17, gap: 9 }}>
        <View style={[styles.row, { flexWrap: 'nowrap' }]}>
          {selected === today ? <HabitCheck checked={done} label={habit.name} onPress={() => setCompletion(habit.id, !done)}/> : <View style={{ width: 48, alignItems: 'center' }}><Text style={{ color: done ? colors.accent : colors.muted, fontSize: 23 }}>{done ? '✓' : '○'}</Text></View>}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={[styles.text, { fontWeight: '700' }]}>{habit.icon} {habit.name}</Text><Text style={styles.muted}>{habit.category} · {habit.frequency === 'quota' ? Math.min(habit.weekly_target, completions.filter(c => c.habit_id === habit.id && c.day >= weekStart(today) && c.day <= today).length) + '/' + habit.weekly_target + ' this week' : habit.frequency === 'days' ? habit.days : 'Every day'}</Text></View>
          <View style={{ alignItems: 'center' }}><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 32 }}>{currentStreak}</Text><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 9, textTransform: 'uppercase' }}>day streak</Text></View>
        </View>
        <View style={styles.row}><Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/habit-form', params: { id: habit.id } })}/><Button title="History" kind="ghost" onPress={() => router.push({ pathname: '/habit-history', params: { id: habit.id } })}/></View>
      </View>;
    }) : <Empty text="No habits scheduled today. Create one or check your schedule."/>}
    <SectionHeader title="All habits"/>
    {habits.filter(habit => !due.includes(habit) && (category === 'All' || habit.category === category)).map(habit => <Card key={habit.id}>
      <Text style={styles.text}>{habit.name} {habit.archived ? '(archived)' : ''}</Text>
      <View style={styles.row}><Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/habit-form', params: { id: habit.id } })}/><Button title="Delete" kind="danger" onPress={() => confirm('Delete habit and its history?', () => deleteHabit(habit.id))}/></View>
    </Card>)}
  </Page>;
}
