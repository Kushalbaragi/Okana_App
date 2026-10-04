import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Public anon key — safe to expose in mobile builds
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// fetch has no timeout of its own, so a request on a bad connection can hang for
// minutes with nothing on screen but a spinner. Every request to Supabase is cut
// off after this long and fails as a connectivity error (see isConnectivityError),
// which every caller already handles by falling back to the cache or the queue.
const REQUEST_TIMEOUT_MS = 30000;
// File uploads (the profile photo) legitimately take longer on a slow link.
const UPLOAD_TIMEOUT_MS = 120000;

export function fetchWithTimeout(input, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Still honours a signal the caller passed in.
  const { signal } = init;
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function supabaseFetch(input, init) {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  return fetchWithTimeout(input, init, url.includes('/storage/v1/') ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: supabaseFetch },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
