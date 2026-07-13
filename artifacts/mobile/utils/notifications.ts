/**
 * CleanDroid — local notification scheduler.
 *
 * Schedules a single repeating "time to clean" reminder based on the user's
 * chosen frequency. A fixed identifier means re-scheduling replaces the
 * existing reminder rather than stacking new ones.
 *
 * Notification fires at 10:00 AM (device local time) on the chosen cadence:
 *   daily   → every morning
 *   weekly  → every Sunday morning
 *   monthly → first of each month
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logError, logDebug } from './logger';

// Fixed identifier — cancelling by ID is safe even if nothing was scheduled.
const REMINDER_ID = 'cleandroid_clean_reminder';
const HOUR = 10; // 10:00 AM local time

export type NotifPermission = 'granted' | 'denied' | 'undetermined';

// Configure how notifications appear when the app is foregrounded
Notifications.setNotificationHandler({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleNotification: async (): Promise<any> => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Request permission and return the resulting status. */
export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (Platform.OS === 'web') return 'denied';
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await Notifications.requestPermissionsAsync() as any;
    return result.granted ? 'granted' : 'denied';
  } catch (err) {
    logError('notifications/requestPermission', err);
    return 'denied';
  }
}

/** Get current permission status without prompting. */
export async function getNotificationPermission(): Promise<NotifPermission> {
  if (Platform.OS === 'web') return 'denied';
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await Notifications.getPermissionsAsync() as any;
    if (result.granted) return 'granted';
    return result.canAskAgain ? 'undetermined' : 'denied';
  } catch (err) {
    logError('notifications/getPermission', err);
    return 'undetermined';
  }
}

/** Schedule (or replace) the repeating clean reminder. Returns true on success. */
export async function scheduleCleanReminder(
  frequency: 'daily' | 'weekly' | 'monthly',
): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  // Always cancel the existing reminder first to avoid stacking.
  await cancelCleanReminder();

  try {
    const content: Notifications.NotificationContentInput = {
      title: 'CLEANDROID — TIME TO CLEAN',
      body: 'Your scheduled storage clean is ready to run. Tap to start.',
      sound: true,
    };

    if (frequency === 'daily') {
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: HOUR,
          minute: 0,
        },
      });
    } else if (frequency === 'weekly') {
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 1, // Sunday (1–7 where 1 = Sunday)
          hour: HOUR,
          minute: 0,
        },
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: 1,
          hour: HOUR,
          minute: 0,
        },
      });
    }

    return true;
  } catch (err) {
    logError('notifications/scheduleCleanReminder', err);
    return false;
  }
}

/** Cancel the clean reminder if one exists. */
export async function cancelCleanReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch (err) {
    // Safe to ignore — either never scheduled or already cancelled.
    logDebug('notifications/cancel', `cancel failed: ${err}`);
  }
}

/** Returns true if the reminder is currently scheduled on this device. */
export async function isReminderScheduled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some(n => n.identifier === REMINDER_ID);
  } catch (err) {
    logError('notifications/isScheduled', err);
    return false;
  }
}
