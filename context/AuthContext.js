import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial session — falls back to signed-out rather than hanging
    // on the loading spinner forever if this rejects (e.g. no network).
    supabase.auth.getSession()
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
