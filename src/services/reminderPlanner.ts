import { NotificationSchedule } from '../core/types';

export type ReminderDefinition = {
  key: string;
  config: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  weekday?: number;
};

type ReminderOperations = {
  schedule: (reminder: ReminderDefinition) => Promise<string>;
  cancel: (identifier: string) => Promise<void>;
  persist: (schedules: NotificationSchedule[]) => Promise<void>;
};

/** Schedule replacements first; only remove working reminders after every replacement exists. */
export async function reconcileScheduledReminders(
  desired: ReminderDefinition[],
  existing: NotificationSchedule[],
  scheduledIds: Set<string>,
  operations: ReminderOperations,
) {
  if (new Set(desired.map(reminder => reminder.key)).size !== desired.length) {
    throw new Error('Reminder keys must be unique.');
  }
  const byKey = new Map(existing.map(row => [row.key, row]));
  const created = new Map<string, NotificationSchedule>();
  const unchanged = new Map<string, NotificationSchedule>();

  try {
    for (const reminder of desired) {
      const current = byKey.get(reminder.key);
      if (current?.config === reminder.config && scheduledIds.has(current.notification_id)) {
        unchanged.set(reminder.key, current);
        continue;
      }
      const notification_id = await operations.schedule(reminder);
      created.set(reminder.key, { key: reminder.key, notification_id, config: reminder.config });
    }
  } catch (error) {
    await Promise.allSettled([...created.values()].map(row => operations.cancel(row.notification_id)));
    throw error;
  }

  const wanted = new Set(desired.map(reminder => reminder.key));
  const replacementKeys = new Set(created.keys());
  const stale = existing.filter(row => !wanted.has(row.key) || replacementKeys.has(row.key));
  try {
    for (const row of stale) if (scheduledIds.has(row.notification_id)) await operations.cancel(row.notification_id);
  } catch (error) {
    await Promise.allSettled([...created.values()].map(row => operations.cancel(row.notification_id)));
    throw error;
  }

  const next = desired.map(reminder => unchanged.get(reminder.key) ?? created.get(reminder.key)!);
  try {
    await operations.persist(next);
  } catch (error) {
    await Promise.allSettled([...created.values()].map(row => operations.cancel(row.notification_id)));
    throw error;
  }
  return next;
}
