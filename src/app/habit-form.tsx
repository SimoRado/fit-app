import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '../ui/LocalizedText';
import { dayKey, uid, validDay } from '../core/date';
import { Habit } from '../core/types';
import { HABIT_CATEGORIES, reminderTimes, validReminderTime } from '../core/habitExtras';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Field, message, Page, styles, confirm } from '../ui/components';
import { reconcileReminders, requestReminderPermission } from '../services/reminders';

export default function HabitForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, changed, language } = useApp();
  const [original, setOriginal] = useState<Habit | null>(null);
  const [name, setName] = useState(''), [description, setDescription] = useState('');
  const [category, setCategory] = useState('Other'), [icon, setIcon] = useState('✓');
  const [frequency, setFrequency] = useState<Habit['frequency']>('daily');
  const [days, setDays] = useState('1,3,5'), [weeklyTarget, setWeeklyTarget] = useState('3');
  const [start, setStart] = useState(dayKey()), [archived, setArchived] = useState(false);
  const [habitType, setHabitType] = useState<'boolean' | 'quantity'>('boolean');
  const [targetValue, setTargetValue] = useState('1'), [unit, setUnit] = useState(''), [increment, setIncrement] = useState('1');
  const [reminderEnabled, setReminderEnabled] = useState(false), [times, setTimes] = useState<string[]>(['21:00']);

  useEffect(() => {
    if (!id) return;
    repo.one<Habit>('habits', id).then(habit => {
      if (!habit) return;
      setOriginal(habit); setName(habit.name); setDescription(habit.description); setCategory(habit.category || 'Other');
      setIcon(habit.icon); setFrequency(habit.frequency); setDays(habit.days); setWeeklyTarget(String(habit.weekly_target));
      setStart(habit.start_date); setArchived(!!habit.archived); setHabitType(habit.habit_type ?? 'boolean');
      setTargetValue(String(habit.target_value ?? 1)); setUnit(habit.unit ?? ''); setIncrement(String(habit.increment ?? 1));
      setReminderEnabled(!!(habit.reminder_enabled ?? habit.reminder_time)); setTimes(reminderTimes(habit).length ? reminderTimes(habit) : ['21:00']);
    }).catch(message);
  }, [id]);

  async function save() {
    try {
      if (!profile) throw Error('Complete your profile first.');
      if (!name.trim() || name.trim().length > 120) throw Error('Enter a habit name up to 120 characters.');
      if (!validDay(start)) throw Error('Enter a valid start date.');
      const weekly = Number(weeklyTarget), amount = Number(targetValue), tap = Number(increment);
      if (!Number.isInteger(weekly) || weekly < 1 || weekly > 7) throw Error('Days per week must be from 1 to 7.');
      if (frequency === 'days' && (!/^[0-6](,[0-6])*$/.test(days) || new Set(days.split(',')).size !== days.split(',').length)) throw Error('Use unique weekday numbers 0 (Sunday) through 6 (Saturday), separated by commas.');
      if (habitType === 'quantity' && (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !Number.isFinite(tap) || tap <= 0 || tap > 1000000)) throw Error('Enter a positive target and tap amount.');
      if (reminderEnabled && (!times.length || times.length > 6 || times.some(time => !validReminderTime(time)) || new Set(times).size !== times.length)) throw Error('Enter up to six distinct reminder times in HH:MM format.');
      if (reminderEnabled && !(await requestReminderPermission(language))) throw Error('Notification permission is required to enable reminders.');
      await repo.saveHabit({
        id: original?.id ?? uid(), owner_id: profile.id, name: name.trim(), description, category, icon, frequency, days,
        weekly_target: weekly, start_date: start, archived: Number(archived), created_at: original?.created_at ?? new Date().toISOString(),
        reminder_time: reminderEnabled ? times[0] : null, habit_type: habitType, target_value: habitType === 'quantity' ? amount : 1,
        unit: habitType === 'quantity' ? unit.trim() : '', increment: habitType === 'quantity' ? tap : 1,
        reminder_enabled: Number(reminderEnabled), reminder_times: JSON.stringify([...times].sort()), sort_order: original?.sort_order,
      });
      if (reminderEnabled) await repo.setPreference('habit_reminders', 'on');
      await reconcileReminders(); changed(); router.back();
    } catch (error) { message(error); }
  }

  const categories = HABIT_CATEGORIES.includes(category as typeof HABIT_CATEGORIES[number]) ? HABIT_CATEGORIES : [...HABIT_CATEGORIES, category];
  return <Page title={id ? 'Edit habit' : 'Create habit'}><Card>
    <Field label="Habit name" value={name} onChangeText={setName}/>
    <Field label="Description (optional)" value={description} onChangeText={setDescription}/>
    <Choices label="Category" options={categories} value={category} onChange={setCategory}/>
    <Field label="Icon or emoji" value={icon} onChangeText={setIcon}/>
    <Choices label="Habit type" options={['boolean', 'quantity'] as const} value={habitType} onChange={setHabitType}/>
    {habitType === 'quantity' && <><Field label="Daily target" value={targetValue} onChangeText={setTargetValue} keyboardType="decimal-pad"/><Field label="Unit" value={unit} onChangeText={setUnit}/><Field label="Amount per tap" value={increment} onChangeText={setIncrement} keyboardType="decimal-pad"/></>}
    <Choices label="Frequency" options={['daily', 'days', 'quota'] as const} value={frequency} onChange={setFrequency}/>
    {frequency === 'days' && <Field label="Weekdays (0=Sun, 1=Mon, … 6=Sat)" value={days} onChangeText={setDays}/>}
    {frequency === 'quota' && <Field label="Days per week" value={weeklyTarget} onChangeText={setWeeklyTarget} keyboardType="numeric"/>}
    <Field label="Start date (YYYY-MM-DD)" value={start} onChangeText={setStart}/>
    <Choices label="Reminder" options={['Off', 'On'] as const} value={reminderEnabled ? 'On' : 'Off'} onChange={value => setReminderEnabled(value === 'On')}/>
    {reminderEnabled && <>{times.map((time, index) => <React.Fragment key={index}><Field label={`Reminder ${index + 1} (HH:MM)`} value={time} onChangeText={value => setTimes(current => current.map((item, position) => position === index ? value : item))}/>{times.length > 1 && <Button title={`Remove reminder ${index + 1}`} kind="ghost" onPress={() => setTimes(current => current.filter((_, position) => position !== index))}/>}</React.Fragment>)}{times.length < 6 && <Button title="Add another reminder" kind="ghost" onPress={() => setTimes(current => [...current, '12:00'])}/>}<Text style={styles.muted}>Times use your device&apos;s local time. Delivery may be delayed by your phone&apos;s notification settings.</Text></>}
    {id && <Button title={archived ? 'Restore habit' : 'Archive habit'} kind="ghost" onPress={() => setArchived(!archived)}/>}
    {id && <Button title="Delete habit" kind="danger" onPress={() => confirm('Delete habit and its history?', async () => { await repo.remove('habits', id); await reconcileReminders(); changed(); router.back(); })}/>}
    <Button title="Save habit" onPress={save}/>
  </Card></Page>;
}
