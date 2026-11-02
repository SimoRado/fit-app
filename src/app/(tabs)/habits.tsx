import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from '../../ui/LocalizedText';
import { dayKey, weekStart } from '../../core/date';
import { habitDone, habitRate, habitStreak, scheduled } from '../../core/logic';
import { Habit, HabitCompletion } from '../../core/types';
import { repo } from '../../data/db';
import { useApp } from '../../state/app';
import { Button, Card, Empty, Page, styles, confirm, message } from '../../ui/components';
import { reconcileReminders } from '../../services/reminders';

export default function Habits() {
  const { revision, changed } = useApp();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const today = dayKey();

  useEffect(() => {
    Promise.all([repo.habits(), repo.completions()]).then(([allHabits, allCompletions]) => {
      setHabits(allHabits); setCompletions(allCompletions);
    }).catch(message);
  }, [revision]);

  const due = habits.filter(habit => scheduled(habit, today));
  const rate = habitRate(habits, completions, today, today);
  async function setCompletion(id: string, completed: boolean) {
    try { await repo.setHabitCompletion(id, today, completed); changed(); }
    catch (error) { message(error); }
  }
  async function deleteHabit(id: string) {
    try { await repo.remove('habits', id); await reconcileReminders(); changed(); }
    catch (error) { message(error); }
  }

  return <Page title="Habits">
    <Card>
      <Text style={styles.text}>{rate.done} of {rate.due} scheduled habits today · {rate.percent}%</Text>
      <Button title="Create habit" onPress={() => router.push('/habit-form')}/>
    </Card>
    {due.length ? due.map(habit => <Card key={habit.id}>
      <View style={styles.row}><Text style={styles.text}>{habit.icon} {habit.name}</Text><Text style={styles.muted}>{habitStreak(habit, completions).current} streak</Text></View>
      <Text style={styles.muted}>{habit.category} · {habit.frequency === 'quota' ? `${Math.min(habit.weekly_target, completions.filter(c => c.habit_id === habit.id && c.day >= weekStart(today) && c.day <= today).length)}/${habit.weekly_target} this week` : habit.frequency === 'days' ? habit.days : 'Every day'}</Text>
      <Button title={habitDone(habit, completions, today) ? 'Undo completion' : 'Complete today'} onPress={() => setCompletion(habit.id, !habitDone(habit, completions, today))} kind={habitDone(habit, completions, today) ? 'ghost' : 'primary'}/>
      <View style={styles.row}>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/habit-form', params: { id: habit.id } })}/>
        <Button title="History" kind="ghost" onPress={() => router.push({ pathname: '/habit-history', params: { id: habit.id } })}/>
      </View>
    </Card>) : <Empty text="No habits scheduled today. Create one or check your schedule."/>}
    <Text style={styles.subtitle}>All habits</Text>
    {habits.filter(habit => !due.includes(habit)).map(habit => <Card key={habit.id}>
      <Text style={styles.text}>{habit.name} {habit.archived ? '(archived)' : ''}</Text>
      <View style={styles.row}>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/habit-form', params: { id: habit.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete habit and its history?', () => { void deleteHabit(habit.id); })}/>
      </View>
    </Card>)}
  </Page>;
}
