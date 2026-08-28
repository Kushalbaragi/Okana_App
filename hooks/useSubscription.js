import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

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

  const refresh = useCallback(async () => {
    if (!user) { setSubscription(null); setLoading(false); return null; }
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (user.id !== latestUserIdRef.current) return null;
      setSubscription(data);
      return data;
    } catch {
      // Best-effort — a failed fetch just leaves the previous subscription
      // state in place rather than hanging on "loading" forever.
      return null;
    } finally {
      if (user.id === latestUserIdRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { subscription, loading, refresh };
}
