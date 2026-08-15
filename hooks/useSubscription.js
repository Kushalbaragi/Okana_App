import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

async function authToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return token;
}

async function callFunction(name, token, body) {
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to call ${name}`);
  return data;
}

// No startTrial/purchase flow here — native billing (RevenueCat) isn't wired
// up yet (needs App Store Connect / Play Console setup first). This hook
// only surfaces the read side (subscription state + payment method) and
// cancellation, which work today via the existing Razorpay/web backend.
export function useSubscription(user) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) { setSubscription(null); setLoading(false); return null; }
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setSubscription(data);
    setLoading(false);
    return data;
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const TERMINAL = ['created', 'cancelled', 'expired', 'completed'];
    if (!user || !subscription || TERMINAL.includes(subscription.status)) {
      setPaymentMethod(null);
      return;
    }
    let cancelled = false;
    authToken()
      .then(token => callFunction('get-payment-method', token))
      .then(data => { if (!cancelled) setPaymentMethod(data.method ? data : null); })
      .catch(() => { if (!cancelled) setPaymentMethod(null); });
    return () => { cancelled = true; };
  }, [user, subscription]);

  const cancelSubscription = useCallback(async ({ immediate = false } = {}) => {
    if (!user) return false;
    setCancelling(true);
    setError(null);
    try {
      const token = await authToken();
      await callFunction('cancel-subscription', token, { immediate });
      await refresh();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setCancelling(false);
    }
  }, [user, refresh]);

  return {
    subscription, loading, cancelling, error, paymentMethod,
    cancelSubscription, refresh,
  };
}
