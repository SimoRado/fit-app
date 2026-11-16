import { dayKey } from './date';
import { reminderTimes } from './habitExtras';
import { localize } from './i18n';
import { Habit, Language, Preference } from './types';
import { ReminderDefinition } from '../services/reminderPlanner';
import { gymSchedulePreferenceKey, parseGymSchedule } from './gymSchedule';

/** Default local times used when a reminder is switched on without a saved time. */
export const reminderDefaults = { motivation: '07:30', workout: '18:00', streak: '20:00' } as const;
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

export function desiredReminders(habits: Habit[], preferences: Preference[], today = dayKey(), platform = 'android', language: Language = 'en', zone = Intl.DateTimeFormat().resolvedOptions().timeZone, offset = new Date().getTimezoneOffset()): ReminderDefinition[] {
  const prefs = Object.fromEntries(preferences.map(({ key, value }) => [key, value]));
  const reminders: ReminderDefinition[] = [];
  const add = (reminder: Omit<ReminderDefinition, 'config'>) => reminders.push({
    ...reminder,
    config: JSON.stringify({ title: reminder.title, body: reminder.body, hour: reminder.hour, minute: reminder.minute, weekday: reminder.weekday ?? null, habitId: reminder.habitId ?? null, kind: reminder.kind ?? null, zone, offset, channel: platform === 'android' ? 'reminders' : null }),
  });
  if (prefs.habit_reminders === 'on') for (const habit of habits.filter(item => !item.archived && (item.reminder_enabled ?? Number(!!item.reminder_time)) && item.start_date <= today)) {
    for (const time of reminderTimes(habit)) {
      const [hour, minute] = time.split(':').map(Number);
      const definition = { title: localize(`Time for ${habit.name}`, language), body: localize('One small step counts.', language), hour, minute, habitId: habit.id };
      if (habit.frequency === 'days') for (const day of [...new Set(habit.days.split(',').map(Number))].filter(value => Number.isInteger(value) && value >= 0 && value <= 6)) add({ ...definition, key: `habit:${habit.id}:${time}:${day}`, weekday: day + 1 });
      else add({ ...definition, key: `habit:${habit.id}:${time}` });
    }
  }
  // Daily check-in (stored as the original "motivation" reminder).
  const morning = prefs.motivation_time ?? reminderDefaults.motivation;
  if (prefs.motivation_reminders === 'on' && validTime(morning)) {
    const [hour, minute] = morning.split(':').map(Number);
    add({ key: 'motivation', title: localize('Today is a fresh opportunity', language), body: localize('Progress begins with the next action.', language), hour, minute });
  }
  // Workout reminder: only on planned training days when a weekly plan exists, otherwise daily.
  const workoutTime = prefs.workout_time ?? reminderDefaults.workout;
  if (prefs.workout_reminders === 'on' && validTime(workoutTime)) {
    const [hour, minute] = workoutTime.split(':').map(Number);
    const definition = { title: localize('Workout reminder', language), body: localize('Make time for your training.', language), hour, minute };
    const trainingDays = parseGymSchedule(prefs[gymSchedulePreferenceKey]).filter(item => item.kind === 'routine').map(item => item.weekday);
    if (trainingDays.length) for (const day of trainingDays) add({ ...definition, key: `workout:${day}`, weekday: day + 1 });
    else add({ ...definition, key: 'workout' });
  }
  // Streak at risk: an evening nudge. In the foreground it is hidden when today's habits are done.
  const streakTime = prefs.streak_time ?? reminderDefaults.streak;
  if (prefs.streak_reminders === 'on' && validTime(streakTime)) {
    const [hour, minute] = streakTime.split(':').map(Number);
    add({ key: 'streak', title: localize('Keep your streak going', language), body: localize('If today is still open, one small win keeps it alive.', language), hour, minute, kind: 'streak' });
  }
  return reminders;
}
