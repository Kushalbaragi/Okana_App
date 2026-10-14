import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// The evening "anything to log today?" nudge: one repeating local notification at a
// time the user picks. It lives on the device (no server, no push token), is off
// until they turn it on, and asks for notification permission only at that moment.
// The setting is just the hour, stored locally; null means off.
const KEY = 'okana_daily_reminder_hour'
const CHANNEL = 'reminders'

// The times offered in Settings, as 24-hour hours.
export const REMINDER_HOURS = [20, 21, 22]

// "Hi Kushal" — the first word of the name, or a plain "Hi" without one. The text of
// a scheduled notification is fixed when it is scheduled, so a changed name means
// scheduling the reminder again (see Settings).
function titleFor(name) {
  const first = (name || '').trim().split(/\s+/)[0]
  return first ? `Hi ${first}` : 'Hi'
}

export function hourLabel(hour) {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

export async function getReminderHour() {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const hour = raw == null ? null : Number(raw)
    return Number.isInteger(hour) ? hour : null
  } catch {
    return null
  }
}

// Sets the reminder to `hour`, or turns it off for null. Returns false when it could
// not be turned on (permission refused), in which case nothing is changed: the
// previous reminder, if any, stays scheduled and saved.
export async function setReminderHour(hour, name) {
  if (Platform.OS === 'web') return false
  const Notifications = require('expo-notifications')

  if (hour != null) {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Daily reminder',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }
    const current = await Notifications.getPermissionsAsync()
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted
    if (!granted) return false
  }

  // One reminder at most: a changed time (or name) replaces the old one.
  await Notifications.cancelAllScheduledNotificationsAsync()
  if (hour == null) {
    await AsyncStorage.removeItem(KEY)
    return true
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: titleFor(name),
      body: 'Add today’s expenses.',
      data: { route: '/(app)' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      channelId: CHANNEL,
    },
  })
  await AsyncStorage.setItem(KEY, String(hour))
  return true
}
