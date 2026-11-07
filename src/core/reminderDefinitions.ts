import { dayKey } from './date';
import { reminderTimes } from './habitExtras';
import { localize } from './i18n';
import { Habit, Language, Preference } from './types';
import { ReminderDefinition } from '../services/reminderPlanner';

export function desiredReminders(habits: Habit[], preferences: Preference[], today = dayKey(), platform = 'android', language: Language = 'en', zone = Intl.DateTimeFormat().resolvedOptions().timeZone, offset = new Date().getTimezoneOffset()): ReminderDefinition[] {
  const prefs = Object.fromEntries(preferences.map(({ key, value }) => [key, value]));
  const reminders: ReminderDefinition[] = [];
  const add = (reminder: Omit<ReminderDefinition, 'config'>) => reminders.push({
    ...reminder,
    config: JSON.stringify({ title: reminder.title, body: reminder.body, hour: reminder.hour, minute: reminder.minute, weekday: reminder.weekday ?? null, habitId: reminder.habitId ?? null, zone, offset, channel: platform === 'android' ? 'reminders' : null }),
  });
  if (prefs.habit_reminders === 'on') for (const habit of habits.filter(item => !item.archived && (item.reminder_enabled ?? Number(!!item.reminder_time)) && item.start_date <= today)) {
    for (const time of reminderTimes(habit)) {
      const [hour, minute] = time.split(':').map(Number);
      const definition = { title: localize(`Time for ${habit.name}`, language), body: localize('One small step counts.', language), hour, minute, habitId: habit.id };
      if (habit.frequency === 'days') for (const day of [...new Set(habit.days.split(',').map(Number))].filter(value => Number.isInteger(value) && value >= 0 && value <= 6)) add({ ...definition, key: `habit:${habit.id}:${time}:${day}`, weekday: day + 1 });
      else add({ ...definition, key: `habit:${habit.id}:${time}` });
    }
  }
  for (const kind of ['workout', 'motivation'] as const) {
    const time = prefs[`${kind}_time`] ?? '';
    if (prefs[`${kind}_reminders`] !== 'on' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
    const [hour, minute] = time.split(':').map(Number);
    add({ key: kind, title: localize(kind === 'workout' ? 'Workout reminder' : 'Today is a fresh opportunity', language), body: localize(kind === 'workout' ? 'Make time for your training.' : 'Progress begins with the next action.', language), hour, minute });
  }
  return reminders;
}
