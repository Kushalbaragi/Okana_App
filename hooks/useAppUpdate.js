import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

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
      const { data, error } = await supabase
        .from('app_config')
        .select('latest_version')
        .eq('id', platform)
        .single()
      if (cancelled || error || !data) return

      setLatestVersion(data.latest_version)
      if (!isNewer(data.latest_version, currentVersion)) return

      const dismissedVersion = await AsyncStorage.getItem(DISMISSED_KEY)
      if (cancelled) return
      if (dismissedVersion && !isNewer(data.latest_version, dismissedVersion)) return

      setShowUpdate(true)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = () => {
    setShowUpdate(false)
    if (latestVersion) AsyncStorage.setItem(DISMISSED_KEY, latestVersion)
  }

  return { showUpdate, latestVersion, dismiss }
}
