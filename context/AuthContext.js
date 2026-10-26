import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePostHog } from 'posthog-react-native';
import { supabase, fetchWithTimeout } from '../lib/supabase';
import { EMPTY_WIDGET_SNAPSHOT } from '../utils/widgetSnapshot';
import { pushWidgetSnapshot } from '../utils/widgetBridge';

const AuthContext = createContext(null);

// Apple App Review only — see supabase/functions/review-login (deployed
// separately, not checked into this repo) for the full reasoning. Okana's
// passwordless email-OTP login can't be driven by App Store Connect's own
// "Sign-In Information" fields (Apple types whatever's given directly into
// the app, never checks an external inbox), so this one hardcoded demo
// address routes through a server-side bypass with a single fixed code
// instead of a real emailed OTP. Every other email is untouched.
const REVIEW_EMAIL = 'okanapreview@gmail.com';

// The user from the session supabase-js persisted, read without any network call.
async function readStoredUser() {
  try {
    const raw = await AsyncStorage.getItem(supabase.auth.storageKey);
    return raw ? JSON.parse(raw)?.user ?? null : null;
  } catch {
    return null;
  }
}

// A brand-new account: it has never been through the welcome pages. Signup no longer
// asks for a name, so `welcomed` (set when those pages finish, see welcome.js) is
// what says so; a name means an account from before that, which counts as welcomed.
export function isNewAccount(user) {
  const meta = user?.user_metadata || {};
  return !meta.welcomed && !meta.name;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const posthog = usePostHog();

  useEffect(() => {
    // Load initial session. getSession refreshes an expired access token over the
    // network first (they last 1 hour, so any launch after a gap hits this), and
    // that can be slow or fail offline. That must not look like a logout: the
    // session is still in storage and the refresh is retried in the background, so
    // on a timeout or a connectivity failure fall back to the stored user. Only a
    // real SIGNED_OUT event (refresh token rejected) sends the user to login.
    Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 6000)),
    ])
      .then(async ({ data: { session }, error }) => {
        if (session) setUser(session.user);
        else if (error) setUser(await readStoredUser());
        else setUser(null);
      })
      .catch(async () => setUser(await readStoredUser()))
      .finally(() => setLoading(false));

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A launch-time refresh that fails on connectivity reports a null session
      // here even though the stored one is intact; the load above handles it.
      if (event === 'INITIAL_SESSION' && !session) return;
      setUser(session?.user ?? null);
    });

    // supabase-js only auto-refreshes while the app is in the foreground; on
    // React Native it can't see that itself, so tell it. Coming back to the app
    // then refreshes the token straight away instead of on the next 30 s tick.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  // Whatever way the session ended (logout, deleted account, expired token), the
  // home screen widgets must stop showing that account's numbers. Waits for the
  // initial session check so a cold start isn't treated as signed out.
  useEffect(() => {
    if (!loading && !user) pushWidgetSnapshot(EMPTY_WIDGET_SNAPSHOT);
  }, [loading, user]);

  // Sends a 6-digit code to `email` — works for both new and returning
  // users (shouldCreateUser lets a brand-new address create the account
  // right here), so there's no separate "sign up" entry point anymore.
  //
  // Raced against a timeout — an unbounded await here means a slow/hung
  // Supabase response leaves the caller's button spinning forever with no
  // error and no way out, which is exactly what tempts a user to force-quit
  // and retry, generating the extra send attempts a hung request can't
  // otherwise explain (there's no automatic retry anywhere in this app).
  // The timeout only stops the client from waiting — it doesn't cancel
  // whatever Supabase is doing server-side.
  const sendOtp = useCallback(async ({ email }) => {
    // The review account never gets a real OTP — verifyOtp below routes it
    // through the server-side bypass instead, so there's nothing to send.
    if (email.trim().toLowerCase() === REVIEW_EMAIL) return;
    const { error } = await Promise.race([
      supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
      ),
    ]);
    if (error) throw error;
  }, []);

  // Verifies the code and reports back whether this is a brand-new account
  // (no name set yet) — the OTP screen uses that to decide whether to route
  // through a name-capture step before continuing, since the old signup
  // form (which used to collect it alongside a password) no longer exists.
  const verifyOtp = useCallback(async ({ email, token }) => {
    if (email.trim().toLowerCase() === REVIEW_EMAIL) {
      const res = await fetchWithTimeout(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/review-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: token }),
      });
      const body = await res.json();
      // Thrown the same way a real wrong/expired code is — otp.js's catch
      // block doesn't need to know this path exists at all.
      if (!res.ok) throw new Error(body.error || 'Incorrect or expired code.');
      // token_hash (not token+email) — generateLink's hashed_token is only
      // accepted on the wire as token_hash; confirmed directly against the
      // REST endpoint, since verifyOtp's token param silently 403s
      // ("otp_expired") on a hash instead of a plain 6-digit code.
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: body.hashed_token, type: 'magiclink' });
      if (error) throw error;
      // Same check as the real path below — the very first time this
      // account is used it has never been welcomed, and should route
      // through onboarding exactly like any other new signup so a reviewer
      // sees the full app, not just a skipped-ahead Dashboard.
      return { isNewUser: isNewAccount(data.user) };
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    const isNewUser = isNewAccount(data.user);
    // Signup only, not every login — login_completed was mostly redundant
    // with PostHog's own automatic app-opened event for a returning user.
    // Not fired on the review-account bypass above — that's Apple's
    // reviewer, not a real user, and would otherwise pollute the funnel.
    if (isNewUser) posthog?.capture('signup_completed');
    return { isNewUser };
  }, [posthog]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Convenience getters from Supabase user object
  const profile = useMemo(() => (user ? {
    name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    email: user.email,
    phone: user.user_metadata?.phone || '',
    joinDate: user.created_at,
    avatar: user.user_metadata?.avatar_url || null,
  } : null), [user]);

  // Memoised, so every screen reading useAuth() re-renders only when one of these
  // actually changes, not whenever this provider happens to render.
  const value = useMemo(() => ({ user, profile, loading, sendOtp, verifyOtp, logout }), [user, profile, loading, sendOtp, verifyOtp, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
