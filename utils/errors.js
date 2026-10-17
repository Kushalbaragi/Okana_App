import * as Sentry from '@sentry/react-native';

// A raw fetch/network failure ("Network request failed", "Failed to
// fetch", etc.) doesn't mean the same thing as a genuine server-side
// rejection (validation, RLS, business logic) — the first one means "you
// have no signal" (or a request cut off for taking too long — see
// lib/supabase.js), the second means "the server said no". Callers use
// this to decide banner-and-abort vs. show-the-real-error-inline.
const NETWORK_ERROR_PATTERN = /network request failed|failed to fetch|network error|fetch failed|load failed|aborted/i;

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

// What a person sees when something fails: never a raw server or library
// message, always a plain sentence that says what went wrong and what to do.
// Known failures get their own wording; anything else gets `fallback`. A message
// that is already written for people (our own validation errors, which carry
// `userMessage`) is shown as it is.
export const ACCESS_EXPIRED_MESSAGE = 'Your Okana Plus trial or subscription has expired. Subscribe to keep adding.';

const FRIENDLY = [
  [/network request failed|failed to fetch|network error|fetch failed|load failed|aborted|timed? ?out/i, "Couldn't reach the server. Check your connection and try again."],
  [/token has expired or is invalid|otp|invalid.*code|incorrect or expired code/i, "That code is incorrect or has expired. Check it, or ask for a new one."],
  [/jwt|invalid refresh token|refresh token not found|not authenticated|auth session missing|session.*expired/i, 'Your session has expired. Please sign in again.'],
  [/rate limit|too many requests|only request this after|security purposes/i, 'Too many attempts. Please wait a minute and try again.'],
  [/invalid.*email|email.*invalid|unable to validate email/i, "That email address doesn't look right."],
  [/duplicate key|already exists|23505/i, 'That already exists.'],
  // These tables only refuse a signed-in user's own row when their access has run out.
  [/row-level security/i, ACCESS_EXPIRED_MESSAGE],
  [/permission denied|not authori[sz]ed|forbidden|\b40[13]\b/i, "You don't have access to that. Please sign in again."],
  [/payment.*pending|pending.*payment/i, "Your payment is pending. It'll finish once the store approves it."],
  [/purchases? (are )?not allowed/i, "Purchases aren't allowed on this device."],
  [/store problem|app store|play store|billing/i, 'The store had a problem. Please try again.'],
  [/payload too large|file.*too large|exceeds.*size/i, 'That file is too large.'],
  [/cancel+ed/i, 'Cancelled.'],
  [/\b5\d\d\b|internal server error|service unavailable|bad gateway/i, 'The server is having trouble right now. Please try again in a moment.'],
];

export function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (err.userMessage) return err.userMessage;
  const message = typeof err === 'string' ? err : `${err.message || ''} ${err.code || ''} ${err.status || ''}`;
  for (const [pattern, text] of FRIENDLY) {
    if (pattern.test(message)) return text;
  }
  return fallback;
}

// An error whose message is already written for people, so friendlyError shows
// it as it is (validation, "nothing to export", a template that doesn't match).
export function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}
