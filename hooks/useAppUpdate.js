import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { isConnectivityError, reportError } from '../utils/errors'

const DISMISSED_KEY = 'okana_dismissed_update_version'

// Plain numeric compare, not string comparison — '1.0.10' > '1.0.9' would
// otherwise come out false (string comparison stops at the first differing
// character, '1' < '9').
function isNewer(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0
    if (na !== nb) return na > nb
  }
  return false
}

// Checks the app_config table (one row per platform — publishing a native
// build doesn't change anything here on its own; bumping this row is what
// actually turns the banner on for whoever's still on an older install) for
// a newer version than the one currently running, once per app open. Shows
// at most once per version — dismissing (the sheet's own close, or tapping
// Update, which also counts as handled) remembers that version locally so
// reopening the app doesn't show the same prompt again, only a genuinely
// newer one later.
export function useAppUpdate() {
  const [latestVersion, setLatestVersion] = useState(null)
  const [showUpdate, setShowUpdate] = useState(false)
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0'

  useEffect(() => {
    let cancelled = false
    const platform = Platform.OS === 'ios' ? 'ios' : 'android'

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('latest_version')
          .eq('id', platform)
          .single()
        if (error) throw error
        if (cancelled || !data) return

        setLatestVersion(data.latest_version)
        if (!isNewer(data.latest_version, currentVersion)) return

        const dismissedVersion = await AsyncStorage.getItem(DISMISSED_KEY)
        if (cancelled) return
        if (dismissedVersion && !isNewer(data.latest_version, dismissedVersion)) return

        setShowUpdate(true)
      } catch (err) {
        // Not being able to check for an update (offline, say) just means no
        // prompt this time. A dropped connection is expected; anything else
        // (the table missing, a rejected query) is reported.
        if (!isConnectivityError(err)) reportError(err)
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = () => {
    setShowUpdate(false)
    // If this can't be saved the prompt just shows again next time.
    if (latestVersion) AsyncStorage.setItem(DISMISSED_KEY, latestVersion).catch(reportError)
  }

  return { showUpdate, latestVersion, dismiss }
}
