import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import { dayKey } from '../core/date';
import { HabitCompletion, Language, NotificationSchedule } from '../core/types';
import { scheduled } from '../core/logic';
import { desiredReminders } from '../core/reminderDefinitions';
import { localize } from '../core/i18n';
import { db, getLocalAccount, repo } from '../data/db';
import { reconcileScheduledReminders } from './reminderPlanner';
import { runtimeSignals } from '../core/runtime';
import { reportFailure } from '../core/monitoring';
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
    if (notification.request.content.data?.kind === 'streak' && getLocalAccount()) {
      try { show = !(await todaysHabitsComplete()); }
      catch { /* Show the nudge when the database cannot be read. */ }
    }
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

/** True when every habit scheduled today (excluding weekly quotas) is completed. */
async function todaysHabitsComplete() {
  const today = dayKey();
  const [habits, completions] = await Promise.all([repo.habits(), (await db()).getAllAsync<HabitCompletion>('SELECT * FROM habit_completions WHERE day=?', today)]);
  const due = habits.filter(habit => habit.frequency !== 'quota' && scheduled(habit, today));
  return due.length > 0 && due.every(habit => completions.some(row => row.habit_id === habit.id));
}

export async function requestReminderPermission(language: Language = 'en') {
  if (Platform.OS === 'android') await ensureAndroidReminderChannel(language);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

async function ensureAndroidReminderChannel(language: Language) {
  const expoGo = runtimeSignals().kind === 'expo-go';
  try {
    const channel = await Notifications.setNotificationChannelAsync('reminders', { name: localize('Reminders', language), importance: AndroidImportance.DEFAULT });
    if (channel?.importance === AndroidImportance.NONE) throw Error('Notification channel is disabled in Android settings. Enable Reminders for Cubyfit, then try again.');
  } catch (cause) {
    reportFailure('reminder-channel', cause);
    if (cause instanceof Error && cause.message.startsWith('Notification channel is disabled')) throw cause;
    if (expoGo) throw Error('Expo Go could not set up Android reminders on this device. Open Cubyfit in a Development build and try again. Your habit has not been changed.');
    throw Error('Android could not set up reminders. The installed Development Client may need a new APK with the current Expo Notifications module. Your habit has not been changed.');
  }
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
  const existingByKey = new Map(existing.map(row => [row.key, row]));
  const needsNewSchedule = desired.some(reminder => {
    const prior = existingByKey.get(reminder.key);
    return !prior || prior.config !== reminder.config || !scheduledIds.has(prior.notification_id);
  });
  if (Platform.OS === 'android' && needsNewSchedule) {
    await ensureAndroidReminderChannel(profile?.language ?? 'en');
  }

  await reconcileScheduledReminders(desired, existing, scheduledIds, {
    schedule: async reminder => { assertAccount(); const identifier = await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body, data: reminder.habitId ? { habitId: reminder.habitId } : reminder.kind ? { kind: reminder.kind } : {} },
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
