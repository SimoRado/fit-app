import { describe, expect, it } from 'vitest';
import { Habit, HabitCompletion, HabitProgress } from '../src/core/types';
import { filterHabits, reminderTimes, weeklyConsistency } from '../src/core/habitExtras';
import { desiredReminders } from '../src/core/reminderDefinitions';

const habit = (id: string, extra: Partial<Habit> = {}): Habit => ({ id, owner_id: 'account', name: id, description: '', category: 'Other', icon: '✓', frequency: 'daily', days: '', weekly_target: 7, start_date: '2026-11-02', archived: 0, reminder_time: null, created_at: '2026-11-02T00:00:00Z', ...extra });
const completion = (habit_id: string, day: string): HabitCompletion => ({ id: `${habit_id}-${day}`, habit_id, day, created_at: `${day}T12:00:00Z` });
const progress = (habit_id: string, day: string, amount: number, target_snapshot = 4): HabitProgress => ({ id: `${habit_id}:${day}`, habit_id, day, amount, target_snapshot, unit_snapshot: 'L', updated_at: `${day}T12:00:00Z` });

describe('habit additions', () => {
  it('counts scheduled past days, full quantities, and partial quantities separately', () => {
    const rows = [habit('daily'), habit('water', { habit_type: 'quantity', target_value: 4 }), habit('mon-wed', { frequency: 'days', days: '1,3' })];
    const result = weeklyConsistency(rows, [completion('daily', '2026-11-02'), completion('mon-wed', '2026-11-02')], [progress('water', '2026-11-02', 2), progress('water', '2026-11-03', 4)], '2026-11-02', '2026-11-03');
    expect(result).toMatchObject({ due: 5, done: 3, partial: 1, percent: 60 });
  });
  it('uses historical target snapshots and ignores future dates', () => {
    const result = weeklyConsistency([habit('water', { habit_type: 'quantity', target_value: 8 })], [], [progress('water', '2026-11-02', 4, 4)], '2026-11-02', '2026-11-02');
    expect(result).toMatchObject({ due: 1, done: 1, percent: 100 });
  });
  it('handles an empty prior week and quotas without counting all seven days as due', () => {
    expect(weeklyConsistency([habit('new', { start_date: '2026-11-09' })], [], [], '2026-11-02', '2026-11-15').due).toBe(0);
    expect(weeklyConsistency([habit('gym', { frequency: 'quota', weekly_target: 3 })], [completion('gym', '2026-11-02')], [], '2026-11-02', '2026-11-03')).toMatchObject({ due: 2, done: 1 });
  });
  it('filters categories without changing stored records and keeps preferred order', () => {
    const rows = [habit('one', { category: 'Fitness', sort_order: 2 }), habit('two', { category: 'Nutrition', sort_order: 0 }), habit('three', { category: 'Fitness', sort_order: 1 })];
    expect(filterHabits(rows, 'Fitness').map(row => row.id)).toEqual(['three', 'one']);
    expect(filterHabits(rows, 'All Habits').map(row => row.id)).toEqual(['two', 'three', 'one']);
    expect(rows).toHaveLength(3);
  });
  it('parses distinct multiple reminders and rejects malformed times', () => {
    expect(reminderTimes(habit('read', { reminder_times: '["21:00","12:00","21:00","99:00"]' }))).toEqual(['12:00', '21:00']);
  });
  it('schedules each enabled time only on selected weekdays and skips archived habits', () => {
    const rows = [habit('read', { reminder_enabled: 1, reminder_times: '["12:00","21:00"]', frequency: 'days', days: '1,3' }), habit('old', { reminder_enabled: 1, reminder_times: '["09:00"]', archived: 1 })];
    const desired = desiredReminders(rows, [{ key: 'habit_reminders', value: 'on' }], '2026-11-03', 'android', 'en', 'Africa/Casablanca', 0);
    expect(desired.map(row => row.key)).toEqual(['habit:read:12:00:1', 'habit:read:12:00:3', 'habit:read:21:00:1', 'habit:read:21:00:3']);
    expect(desired.map(row => row.weekday)).toEqual([2, 4, 2, 4]);
    expect(desiredReminders(rows, [{ key: 'habit_reminders', value: 'off' }], '2026-11-03')).toEqual([]);
    expect(desiredReminders([habit('read', { reminder_enabled: 0, reminder_times: '["21:00"]' })], [{ key: 'habit_reminders', value: 'on' }], '2026-11-03')).toEqual([]);
  });
  it('changes schedule configuration after a timezone change', () => {
    const rows = [habit('read', { reminder_enabled: 1, reminder_times: '["21:00"]' })];
    const prefs = [{ key: 'habit_reminders', value: 'on' }];
    expect(desiredReminders(rows, prefs, '2026-11-03', 'android', 'en', 'UTC', 0)[0].config).not.toBe(desiredReminders(rows, prefs, '2026-11-03', 'android', 'en', 'Africa/Casablanca', -60)[0].config);
  });
});
