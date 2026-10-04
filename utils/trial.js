import { parseISO } from 'date-fns'
import { MONTH_NAMES } from './monthlyRecap'

export const PRICE_PER_YEAR = 499

// What Okana Plus gives, as the short lines the subscription page shows beside
// a tick. Lives here (not in the route file) so nothing under app/ has to
// import from another route — Expo Router treats every file under app/ as one.
export const PLUS_BENEFITS = [
  'Add unlimited transactions',
  'In a graph, watch your money grow or shrink',
  'Plan your budget and save toward goals',
  'Track and pay off loans',
  'Monthly recap summary',
  'Made for a common salary person',
]

export function formatChargeDate(dateStr) {
  const d = parseISO(dateStr)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// Maps a `subscriptions` row (Apple/Google, written by revenuecat-webhook)
// to what the UI needs to show. Statuses: not_started (no row) · trial (in
// the store's free intro period) · subscribed (actually being billed) ·
// expired. `expires_at` is the authoritative cutoff regardless of the raw
// RevenueCat status string, which carries its own vocabulary
// (in_grace_period, in_billing_retry_period, on_hold, paused, revoked,
// canceled, ...) that doesn't need hand-mapping beyond what's used below.
export function getSubscriptionDisplayStatus(subscription, todayStr) {
  if (!subscription) {
    return { status: 'not_started', chargeDate: null, cancelAtPeriodEnd: false, paymentFailed: false }
  }

  const expiresAt = subscription.expires_at ? parseISO(subscription.expires_at) : null
  // todayStr is a plain "YYYY-MM-DD" — parseISO (not `new Date(todayStr)`)
  // so this compares against local midnight, not UTC midnight; the native
  // constructor's UTC-midnight parsing of a date-only string would shift
  // the actual cutoff by the local UTC offset, mattering most right at a
  // day boundary — exactly where an expiry check needs to be correct.
  const isActive = subscription.status === 'active' || (expiresAt && expiresAt > parseISO(todayStr))
  if (!isActive) {
    return { status: 'expired', chargeDate: subscription.expires_at, cancelAtPeriodEnd: false, paymentFailed: subscription.status === 'on_hold' }
  }
  // RevenueCat's own period_type (TRIAL/INTRO/NORMAL), mirrored onto this
  // row by the webhook — without this, a still-in-trial subscriber would
  // show the same "subscribed" state as someone actually being billed, with
  // no sign they haven't been charged yet.
  if (subscription.is_trial) {
    return {
      status: 'trial',
      chargeDate: subscription.expires_at,
      cancelAtPeriodEnd: subscription.auto_renew === false,
      paymentFailed: false,
    }
  }
  return {
    status: 'subscribed',
    chargeDate: subscription.expires_at,
    cancelAtPeriodEnd: subscription.auto_renew === false,
    paymentFailed: ['in_grace_period', 'in_billing_retry_period'].includes(subscription.status),
  }
}
