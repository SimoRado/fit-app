import { addDays, daysBetween, weekStart } from './date';
import { scheduled } from './logic';
import { Habit, HabitCompletion, HabitProgress } from './types';

export const HABIT_CATEGORIES = ['Fitness', 'Nutrition', 'Productivity', 'Mental Well-being', 'Personal Development', 'Other'] as const;
export const validReminderTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function reminderTimes(habit: Habit): string[] {
  let values: unknown;
  try { values = habit.reminder_times ? JSON.parse(habit.reminder_times) : habit.reminder_time ? [habit.reminder_time] : []; } catch { return []; }
  return Array.isArray(values) ? [...new Set(values.filter((time): time is string => typeof time === 'string' && validReminderTime(time)))].sort() : [];
}
export const filterHabits = (habits: Habit[], category: string) => habits.filter(habit => category === 'All Habits' || habit.category === category).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || b.created_at.localeCompare(a.created_at));
export const habitProgressOn = (rows: HabitProgress[], habitId: string, day: string) => rows.find(row => row.habit_id === habitId && row.day === day);
export function weeklyConsistency(habits: Habit[], completions: HabitCompletion[], progress: HabitProgress[], week: string, today: string) {
  const first = weekStart(week), last = addDays(first, 6), end = last < today ? last : today;
  let due = 0, done = 0, partial = 0;
  if (end < first) return { due, done, partial, percent: 0, first, last };
  const completed = new Set(completions.map(row => `${row.habit_id}:${row.day}`));
  for (const habit of habits) {
    if (habit.archived) continue;
    const eligible = daysBetween(first, end).filter(day => scheduled(habit, day));
    if (habit.frequency === 'quota') {
      const target = Math.min(habit.weekly_target, eligible.length);
      due += target;
      let hits = 0;
      for (const day of eligible) {
        const row = habitProgressOn(progress, habit.id, day);
        const full = habit.habit_type === 'quantity' ? !!row && row.amount >= row.target_snapshot : completed.has(`${habit.id}:${day}`);
        if (full) hits++;
        else if (row && row.amount > 0) partial++;
      }
      done += Math.min(hits, target);
    } else for (const day of eligible) {
      due++;
      const row = habitProgressOn(progress, habit.id, day);
      const full = habit.habit_type === 'quantity' ? !!row && row.amount >= row.target_snapshot : completed.has(`${habit.id}:${day}`);
      if (full) done++;
      else if (row && row.amount > 0) partial++;
    }
  }
  return { due, done, partial, percent: due ? Math.round(done / due * 100) : 0, first, last };
}
