import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import { dayKey } from '../core/date';
import { Habit, Language, NotificationSchedule, Preference } from '../core/types';
import { localize } from '../core/i18n';
import { db, getLocalAccount, repo } from '../data/db';
import { ReminderDefinition, reconcileScheduledReminders } from './reminderPlanner';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function requestReminderPermission(language: Language = 'en') {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('reminders', { name: localize('Reminders', language), importance: AndroidImportance.DEFAULT });
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

export function desiredReminders(habits: Habit[], preferences: Preference[], today = dayKey(), platform = Platform.OS, language: Language = 'en'): ReminderDefinition[] {
  const prefs = Object.fromEntries(preferences.map(({ key, value }) => [key, value]));
  const reminders: ReminderDefinition[] = [];
  const add = (reminder: Omit<ReminderDefinition, 'config'>) => {
    reminders.push({
      ...reminder,
      config: JSON.stringify({ title: reminder.title, body: reminder.body, hour: reminder.hour, minute: reminder.minute, weekday: reminder.weekday ?? null, channel: platform === 'android' ? 'reminders' : null }),
    });
  };

  if (prefs.habit_reminders === 'on') {
    for (const habit of habits.filter(h => !h.archived && h.reminder_time && h.start_date <= today)) {
      const [hour, minute] = habit.reminder_time!.split(':').map(Number);
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
      if (habit.frequency === 'days') {
        for (const day of [...new Set(habit.days.split(',').map(Number))].filter(n => Number.isInteger(n) && n >= 0 && n <= 6)) {
          add({ key: `habit:${habit.id}:${day}`, title: localize(`Time for ${habit.name}`, language), body: localize('One small step counts.', language), hour, minute, weekday: day + 1 });
        }
      } else add({ key: `habit:${habit.id}`, title: localize(`Time for ${habit.name}`, language), body: localize('One small step counts.', language), hour, minute });
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

let reconcileTail: Promise<void> = Promise.resolve();
export function reconcileReminders() {
  const account = getLocalAccount();
  const current = reconcileTail.then(() => reconcileRemindersNow(account), () => reconcileRemindersNow(account));
  reconcileTail = current.then(() => undefined, () => undefined);
  return current;
}

export function clearAccountReminders() {
  const current = reconcileTail.then(() => Notifications.cancelAllScheduledNotificationsAsync());
  reconcileTail = current.then(() => undefined, () => undefined);
  return current;
}

async function reconcileRemindersNow(account: string | null) {
  const assertAccount = () => { if (!account || getLocalAccount() !== account) throw new Error('Account changed while scheduling reminders'); };
  assertAccount();
  const database = await db();
  const [preferences, habits, existing, profile] = await Promise.all([
    repo.preferences(),
    repo.habits(),
    database.getAllAsync<NotificationSchedule>('SELECT * FROM notification_schedules'),
    repo.profile(),
  ]);
  assertAccount();
  const permission = await Notifications.getPermissionsAsync();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  assertAccount();
  const scheduledIds = new Set(scheduled.map(item => item.identifier));

  const permitted = permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  const desired = permitted ? desiredReminders(habits, preferences, dayKey(), Platform.OS, profile?.language ?? 'en') : [];
  if (Platform.OS === 'android' && desired.length) {
    await Notifications.setNotificationChannelAsync('reminders', { name: localize('Reminders', profile?.language ?? 'en'), importance: AndroidImportance.DEFAULT });
  }

  await reconcileScheduledReminders(desired, existing, scheduledIds, {
    schedule: async reminder => { assertAccount(); const identifier = await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: reminder.weekday
        ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: reminder.weekday, hour: reminder.hour, minute: reminder.minute, channelId: 'reminders' }
        : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: reminder.hour, minute: reminder.minute, channelId: 'reminders' },
    }); if (getLocalAccount() !== account) { await Notifications.cancelScheduledNotificationAsync(identifier); assertAccount(); } return identifier; },
    cancel: identifier => { assertAccount(); return Notifications.cancelScheduledNotificationAsync(identifier); },
    persist: async schedules => database.withExclusiveTransactionAsync(async tx => {
      assertAccount();
      const keys = schedules.map(row => row.key);
      const prior = await tx.getAllAsync<{ key: string }>('SELECT key FROM notification_schedules');
      for (const row of prior) if (!keys.includes(row.key)) await tx.runAsync('DELETE FROM notification_schedules WHERE key=?', row.key);
      for (const row of schedules) await tx.runAsync(
        'INSERT INTO notification_schedules (key,notification_id,config) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET notification_id=excluded.notification_id,config=excluded.config',
        row.key, row.notification_id, row.config,
      );
    }),
  });
}
