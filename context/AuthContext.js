import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Apple App Review only — see supabase/functions/review-login (deployed
// separately, not checked into this repo) for the full reasoning. Okana's
// passwordless email-OTP login can't be driven by App Store Connect's own
// "Sign-In Information" fields (Apple types whatever's given directly into
// the app, never checks an external inbox), so this one hardcoded demo
// address routes through a server-side bypass with a single fixed code
// instead of a real emailed OTP. Every other email is untouched.
const REVIEW_EMAIL = 'okanapreview@gmail.com';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial session — falls back to signed-out rather than hanging
    // on the loading spinner forever if this rejects (e.g. no network).
    //
    // Raced against a timeout for the same reason as sendOtp below: if the
    // stored access token has expired (the default is after 1 hour, so any
    // cold start more than an hour after the last one hits this), getSession
    // triggers a network refresh before resolving — with no connectivity or
    // a slow connection, that call has no built-in timeout and can hang the
    // entire app on the launch spinner indefinitely. Falling back to
    // signed-out on timeout is the safe direction to fail in: worst case is
    // an easy re-login, not showing another user's cached data.
    Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 6000)),
    ])
      .then(({ data: { session } }) => setUser(session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
  async function sendOtp({ email }) {
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
  }

  // Verifies the code and reports back whether this is a brand-new account
  // (no name set yet) — the OTP screen uses that to decide whether to route
  // through a name-capture step before continuing, since the old signup
  // form (which used to collect it alongside a password) no longer exists.
  async function verifyOtp({ email, token }) {
    if (email.trim().toLowerCase() === REVIEW_EMAIL) {
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/review-login`, {
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
      // account is used it genuinely has no name yet, and should route
      // through onboarding exactly like any other new signup so a reviewer
      // sees the full app, not just a skipped-ahead Dashboard.
      return { isNewUser: !data.user?.user_metadata?.name };
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    const isNewUser = !data.user?.user_metadata?.name;
    return { isNewUser };
  }

  async function setName({ name }) {
    const { error } = await supabase.auth.updateUser({ data: { name } });
    if (error) throw error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  // Convenience getters from Supabase user object
  const profile = user ? {
    name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    email: user.email,
    phone: user.user_metadata?.phone || '',
    joinDate: user.created_at,
    avatar: user.user_metadata?.avatar_url || null,
  } : null;

  return (
    <AuthContext.Provider value={{ user, profile, loading, sendOtp, verifyOtp, setName, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
