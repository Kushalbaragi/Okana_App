import { Platform } from 'react-native'

// expo-haptics is native-only — guarded so the web preview
// (`expo start --web`) never touches an API that doesn't exist there.

export function hapticAdded() {
  if (Platform.OS === 'web') return
  const Haptics = require('expo-haptics')
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}

export function hapticDeleted() {
  if (Platform.OS === 'web') return
  const Haptics = require('expo-haptics')
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

// The light tap a picker makes as each value passes under the selection — a
// selection change, not an impact, so it stays a whisper even when a fling
// fires dozens of them in a row.
export function hapticTick() {
  if (Platform.OS === 'web') return
  const Haptics = require('expo-haptics')
  Haptics.selectionAsync()
}
