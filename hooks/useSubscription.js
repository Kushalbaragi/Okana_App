import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const cacheKey = (userId) => `okana_subscription_cache_${userId}`;

async function loadCachedSubscription(userId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveCachedSubscription(userId, data) {
  try {
    if (data) await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(data));
    else await AsyncStorage.removeItem(cacheKey(userId));
  } catch {
    // best-effort
  }
}

// Native (Apple/Google) purchases only — RevenueCat writes to this table via
// revenuecat-webhook, so this hook is purely a read of that row. There's no
// cancel/payment-method surface here: neither the App Store nor Play Store
// exposes a way for the app itself to cancel a subscription or read the
// underlying payment method, so those are managed entirely on-device
// (Settings → subscriptions), not through this app.
export function useSubscription(user) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  // Tracks whichever `user` is current "right now" — refresh() checks this
  // after its await resolves so a slow request for a since-replaced user
  // (rapid logout/login, or an account switch during testing) can't land
  // after a newer request already set fresh state and silently overwrite it
  // with stale data belonging to the old user.
  const latestUserIdRef = useRef(user?.id ?? null);
  useEffect(() => { latestUserIdRef.current = user?.id ?? null; }, [user]);

  // Shows the last synced-to-disk status immediately on a fresh mount,
  // before the network fetch below even resolves — a cold launch offline
  // would otherwise sit on "not started" (blocking Add-transaction, showing
  // Subscribe instead of Active) for however long the fetch takes to time
  // out, even for an already-Plus subscriber. Only fills in if refresh()
  // hasn't already set real state by the time this resolves.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadCachedSubscription(user.id).then(cached => {
      if (!cancelled && cached && user.id === latestUserIdRef.current) {
        setSubscription(prev => prev ?? cached);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) { setSubscription(null); setLoading(false); return null; }
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (user.id !== latestUserIdRef.current) return null;
      if (error) throw error;
      setSubscription(data);
      await saveCachedSubscription(user.id, data);
      return data;
    } catch {
      // Supabase returns network failures as `{ data: null, error }` rather
      // than throwing, so this catches both that and a genuine thrown
      // error the same way — either means "couldn't refresh", not "there's
      // no subscription". Fall back to the last synced state on disk
      // instead of leaving it cleared to null.
      const cached = await loadCachedSubscription(user.id);
      if (user.id === latestUserIdRef.current && cached) setSubscription(cached);
      return cached;
    } finally {
      if (user.id === latestUserIdRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { subscription, loading, refresh };
}
