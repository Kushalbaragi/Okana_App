import * as Sentry from '@sentry/react-native';

// A raw fetch/network failure ("Network request failed", "Failed to
// fetch", etc.) doesn't mean the same thing as a genuine server-side
// rejection (validation, RLS, business logic) — the first one means "you
// have no signal", the second means "the server said no". Callers use
// this to decide banner-and-abort vs. show-the-real-error-inline.
const NETWORK_ERROR_PATTERN = /network request failed|failed to fetch|network error|fetch failed|load failed/i;

// `isOnline` (from useNetwork()) is checked first and wins outright — a
// request can fail in a network-shaped way even while NetInfo still
// thinks we're online (a request that was already in flight when
// connectivity dropped), so the pattern match is the fallback, not the
// only signal.
export function isConnectivityError(err, isOnline) {
  if (isOnline === false) return true;
  const message = err?.message || (typeof err === 'string' ? err : '');
  return !!(message && NETWORK_ERROR_PATTERN.test(message));
}

// Every call site below already branches `isConnectivityError(err, isOnline)
// ? notifyOffline() : setError(err.message || 'fallback')` — the second
// branch is precisely "this wasn't just the user being offline, something
// actually went wrong," which until now went nowhere but that one on-screen
// message: no record survives past the user dismissing it. This is the
// other half of that branch — call it alongside setError, not instead of
// it. A no-op if EXPO_PUBLIC_SENTRY_DSN isn't set (Sentry.init made that an
// explicit no-op — see app/_layout.js) or in dev (enabled: !__DEV__ there).
export function reportError(err) {
  Sentry.captureException(err);
}
