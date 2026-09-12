import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time "has this coach-mark been shown" flag per (user, step) — same
// on-device-only tradeoff already accepted for the onboarding/welcome-seen
// flags elsewhere in this app (a reinstall replays it once more; that's
// fine for a tour, unlike the monthly recap which has its own server-side
// backstop). `seen` starts true (hidden) until the AsyncStorage read
// resolves, so a step never flashes on-screen for a returning user while
// still loading.
export function useTourStep(userId, stepKey) {
  const [seen, setSeen] = useState(true);
  const key = userId ? `okana_tour_${stepKey}_${userId}` : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then(v => { if (!cancelled) setSeen(v === '1'); })
      .catch(() => { if (!cancelled) setSeen(true); });
    return () => { cancelled = true; };
  }, [key]);

  const markSeen = useCallback(() => {
    setSeen(true);
    if (key) AsyncStorage.setItem(key, '1').catch(() => {});
  }, [key]);

  return { seen, markSeen };
}
