import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Only accounts this young are shown the first-run tour. A returning user who
// reinstalls the app — or one who simply signed up a while ago — never sees it.
const NEW_ACCOUNT_DAYS = 3;
const DAY_MS = 86400000;

// One-time "has this coach-mark been shown" flag per (user, step).
//
// A step is shown only to a brand-new account, and at most once: seen is
// remembered both on the device (AsyncStorage, instant) and on the account
// itself (Supabase user_metadata.tour_seen), so reinstalling the app on a new
// account doesn't replay a step it already showed. The account check is what
// keeps a returning user from ever seeing it, whatever either flag says.
//
// `seen` starts true (hidden) until that is worked out, so a step never flashes
// on-screen for a returning user while still loading.
export function useTourStep(userId, stepKey) {
  const { user } = useAuth();
  const [seen, setSeen] = useState(true);
  const key = userId ? `okana_tour_${stepKey}_${userId}` : null;

  const isNewAccount = !!user?.created_at && Date.now() - new Date(user.created_at).getTime() < NEW_ACCOUNT_DAYS * DAY_MS;
  const seenOnAccount = !!user?.user_metadata?.tour_seen?.[stepKey];

  useEffect(() => {
    if (!key) return undefined;
    if (!isNewAccount || seenOnAccount) { setSeen(true); return undefined; }
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then(v => { if (!cancelled) setSeen(v === '1'); })
      .catch(() => { if (!cancelled) setSeen(true); });
    return () => { cancelled = true; };
  }, [key, isNewAccount, seenOnAccount]);

  const markSeen = useCallback(() => {
    setSeen(true);
    if (key) AsyncStorage.setItem(key, '1').catch(() => {});
    // Best-effort: offline or failing, the device flag still holds for now.
    if (user && !seenOnAccount) {
      const current = user.user_metadata?.tour_seen || {};
      supabase.auth.updateUser({ data: { tour_seen: { ...current, [stepKey]: true } } }).catch(() => {});
    }
  }, [key, user, seenOnAccount, stepKey]);

  return { seen, markSeen };
}
