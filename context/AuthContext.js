import { createContext, useContext, useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';

// Required once at module scope so the browser tab opened for Google's
// OAuth flow can hand control back to the app when it redirects.
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sends a 6-digit code to `email` — works for both new and returning
  // users (shouldCreateUser lets a brand-new address create the account
  // right here), so there's no separate "sign up" entry point anymore.
  async function sendOtp({ email }) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
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

  // Apple only hands back the user's name on the very first authorization
  // ever — never again, even after a fresh sign-in — so it's captured right
  // here instead of relying on the name.js step to ask for it.
  async function signInWithApple() {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    const isNewUser = !data.user?.user_metadata?.name;
    const appleName = credential.fullName?.givenName
      ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
      : null;
    if (isNewUser && appleName) {
      await supabase.auth.updateUser({ data: { name: appleName } });
      return { isNewUser: false };
    }
    return { isNewUser };
  }

  // Browser-based OAuth (rather than the native Google Sign-In SDK) so this
  // keeps working in Expo Go — no dev client / native rebuild required.
  async function signInWithGoogle() {
    const redirectTo = makeRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new Error('Sign in was cancelled.');

    const params = new URLSearchParams(result.url.split('#')[1] ?? result.url.split('?')[1] ?? '');
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error('Sign in failed. Please try again.');

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) throw sessionError;

    const isNewUser = !sessionData.user?.user_metadata?.name;
    const googleName = sessionData.user?.user_metadata?.full_name || sessionData.user?.user_metadata?.name;
    if (isNewUser && googleName) {
      await supabase.auth.updateUser({ data: { name: googleName } });
      return { isNewUser: false };
    }
    return { isNewUser };
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
    <AuthContext.Provider value={{ user, profile, loading, sendOtp, verifyOtp, setName, signInWithApple, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
