import { Platform } from 'react-native'

// expo-notifications is native-only — every entry point here is guarded so
// the web preview (`expo start --web`) never touches an API that doesn't
// exist there.

export async function requestNotificationPermission() {
  if (Platform.OS === 'web') return false
  const Notifications = require('expo-notifications')
  const { status } = await Notifications.getPermissionsAsync()
  if (status === 'granted') return true
  const { status: requested } = await Notifications.requestPermissionsAsync()
  return requested === 'granted'
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return
  const Notifications = require('expo-notifications')
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

// Schedules a local notification for ~9:00 AM the calendar day after "now".
export async function scheduleForNextMorning({ title = 'Okana', body }) {
  if (Platform.OS === 'web') return
  const granted = await requestNotificationPermission()
  if (!granted) return
  await ensureAndroidChannel()

  const Notifications = require('expo-notifications')
  const trigger = new Date()
  trigger.setDate(trigger.getDate() + 1)
  trigger.setHours(9, 0, 0, 0)

  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  })
}
