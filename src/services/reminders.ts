import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import { dayKey } from '../core/date';
import { Language, NotificationSchedule } from '../core/types';
import { desiredReminders } from '../core/reminderDefinitions';
import { localize } from '../core/i18n';
import { db, getLocalAccount, repo } from '../data/db';
import { reconcileScheduledReminders } from './reminderPlanner';
export { desiredReminders } from '../core/reminderDefinitions';

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    let show = true;
    const habitId = notification.request.content.data?.habitId;
    if (typeof habitId === 'string' && getLocalAccount()) {
      try {
        const row = await (await db()).getFirstAsync('SELECT 1 FROM habit_completions WHERE habit_id=? AND day=?', habitId, dayKey());
        show = !row;
      } catch { /* A locked or unavailable database must not block other notifications. */ }
    }
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

export async function requestReminderPermission(language: Language = 'en') {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('reminders', { name: localize('Reminders', language), importance: AndroidImportance.DEFAULT });
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === IosAuthorizationStatus.PROVISIONAL;
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
      content: { title: reminder.title, body: reminder.body, data: reminder.habitId ? { habitId: reminder.habitId } : {} },
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
