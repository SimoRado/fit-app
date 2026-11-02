import { describe, expect, it, vi } from 'vitest';
import { NotificationSchedule } from '../src/core/types';
import { ReminderDefinition, reconcileScheduledReminders } from '../src/services/reminderPlanner';

const reminder = (config = '08:00'): ReminderDefinition => ({
  key: 'motivation', config, title: 'Morning reminder', body: 'One step.', hour: Number(config.slice(0, 2)), minute: Number(config.slice(3)),
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
