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
