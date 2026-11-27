import { describe, expect, it, vi } from 'vitest';
import { NotificationSchedule } from '../src/core/types';
import { ReminderDefinition, reconcileScheduledReminders } from '../src/services/reminderPlanner';
import { desiredReminders } from '../src/core/reminderDefinitions';
import type { Habit } from '../src/core/types';

const reminder = (config = '08:00'): ReminderDefinition => ({
  key: 'motivation', config, title: 'Morning reminder', body: 'One step.', hour: Number(config.slice(0, 2)), minute: Number(config.slice(3)),
});

describe('habit reminder recurrence', () => {
  const habit: Habit = { id: 'h', owner_id: 'p', name: 'Walk', description: '', category: 'Body', icon: 'walk', frequency: 'daily', days: '0,1,2,3,4,5,6', weekly_target: 7, start_date: '2026-11-01', archived: 0, reminder_time: '08:30', reminder_enabled: 1, reminder_times: '["08:30"]', created_at: '2026-11-01' };
  const prefs = [{ key: 'habit_reminders', value: 'on' }];
  const planned = (row: Habit) => desiredReminders([row], prefs, '2026-11-27', 'android', 'en', 'Africa/Casablanca', 0);
  it('uses daily and selected weekdays at the chosen local time', () => {
    expect(planned(habit).map(row => [row.weekday, row.hour, row.minute])).toEqual([[undefined, 8, 30]]);
    expect(planned({ ...habit, frequency: 'days', days: '1,3,5' }).map(row => row.weekday)).toEqual([2, 4, 6]);
  });
  it('schedules a three times weekly goal on Monday, Wednesday and Friday', () => {
    expect(planned({ ...habit, frequency: 'quota', weekly_target: 3 }).map(row => row.weekday)).toEqual([2, 4, 6]);
  });
  it('does not schedule disabled or archived habits', () => {
    expect(planned({ ...habit, reminder_enabled: 0 })).toEqual([]);
    expect(planned({ ...habit, archived: 1 })).toEqual([]);
  });
  it('changes schedule configuration when local timezone changes', () => {
    expect(desiredReminders([habit], prefs, '2026-11-27', 'android', 'en', 'Africa/Casablanca', 0)[0].config)
      .not.toBe(desiredReminders([habit], prefs, '2026-11-27', 'android', 'en', 'Europe/Paris', -60)[0].config);
  });
});
const prior: NotificationSchedule = { key: 'motivation', config: '07:00', notification_id: 'old' };

describe('notification reconciliation', () => {
  it('keeps unchanged schedules and identifiers', async () => {
    const schedule = vi.fn(async () => 'new'), cancel = vi.fn(async () => {}), persist = vi.fn(async () => {});
    const result = await reconcileScheduledReminders([{ ...reminder('07:00') }], [prior], new Set(['old']), { schedule, cancel, persist });
    expect(result).toEqual([prior]); expect(schedule).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled(); expect(persist).toHaveBeenCalledWith([prior]);
  });
  it('schedules a changed reminder before cancelling the previous one', async () => {
    const order: string[] = [];
    const result = await reconcileScheduledReminders([reminder()], [prior], new Set(['old']), {
      schedule: async () => { order.push('schedule'); return 'new'; },
      cancel: async id => { order.push(`cancel:${id}`); },
      persist: async () => { order.push('persist'); },
    });
    expect(order).toEqual(['schedule', 'cancel:old', 'persist']);
    expect(result).toEqual([{ key: 'motivation', config: '08:00', notification_id: 'new' }]);
  });
  it('preserves existing schedules when replacement creation fails', async () => {
    const cancel = vi.fn(async () => {}), persist = vi.fn(async () => {});
    await expect(reconcileScheduledReminders([reminder()], [prior], new Set(['old']), {
      schedule: async () => { throw new Error('native scheduling failed'); }, cancel, persist,
    })).rejects.toThrow('native scheduling failed');
    expect(cancel).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
  });
  it('cancels and removes schedules after reminders are disabled', async () => {
    const cancel = vi.fn(async () => {}), persist = vi.fn(async () => {});
    const result = await reconcileScheduledReminders([], [prior], new Set(['old']), { schedule: vi.fn(), cancel, persist });
    expect(result).toEqual([]); expect(cancel).toHaveBeenCalledWith('old'); expect(persist).toHaveBeenCalledWith([]);
  });
  it('recreates an identifier missing from the operating system schedule', async () => {
    const schedule = vi.fn(async () => 'restored'), cancel = vi.fn(async () => {});
    const result = await reconcileScheduledReminders([reminder('07:00')], [prior], new Set(), { schedule, cancel, persist: async () => {} });
    expect(schedule).toHaveBeenCalledOnce(); expect(result[0].notification_id).toBe('restored');
  });
});
