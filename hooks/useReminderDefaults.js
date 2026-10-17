import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setReminderHour } from '../utils/dailyReminder'
import { reportError } from '../utils/errors'

// The daily reminder starts switched on, at 9 PM. This runs once per device: the first
// time Home is ready, it turns it on (which is also when notification permission is
// asked for, so the prompt doesn't land on top of another popup) and remembers that it
// has. After that the choice belongs to the user in Settings, so a reminder they switch
// off stays off. If permission is refused, nothing is turned on and it is not asked
// again; Settings is where they can change their mind.
const DONE_KEY = 'okana_reminders_defaulted'
const DEFAULT_HOUR = 21

export function useReminderDefaults({ ready, name }) {
  useEffect(() => {
    if (!ready) return undefined
    ;(async () => {
      if (await AsyncStorage.getItem(DONE_KEY)) return
      await AsyncStorage.setItem(DONE_KEY, '1')
      await setReminderHour(DEFAULT_HOUR, name)
    })().catch(reportError)
    // Once per device, on the first ready render; later changes must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
}
