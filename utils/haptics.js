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
