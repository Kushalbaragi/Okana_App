import { Platform } from 'react-native'

// expo-haptics is native-only — guarded so the web preview
// (`expo start --web`) never touches an API that doesn't exist there.
//
// A vibration is decoration, so one that can't play (a device without a haptic
// engine, a client built without the module) is left alone on purpose: it is not
// a bug worth a report, and it must never throw out of the tap that asked for it.
function fire(play) {
  if (Platform.OS === 'web') return
  try {
    const Haptics = require('expo-haptics')
    Promise.resolve(play(Haptics)).catch(() => {})
  } catch {
    // no haptics available
  }
}

export function hapticAdded() {
  fire(H => H.notificationAsync(H.NotificationFeedbackType.Success))
}

export function hapticDeleted() {
  fire(H => H.impactAsync(H.ImpactFeedbackStyle.Medium))
}

// The strongest single pulse the API offers — for a save that should be felt
// firmly (the Success/Warning patterns read more as a "ding").
export function hapticHeavy() {
  fire(H => H.impactAsync(H.ImpactFeedbackStyle.Heavy))
}

// The light tap a picker makes as each value passes under the selection — a
// selection change, not an impact, so it stays a whisper even when a fling
// fires dozens of them in a row.
export function hapticTick() {
  fire(H => H.selectionAsync())
}
