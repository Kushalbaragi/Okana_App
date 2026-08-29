import { MONTH_NAMES } from './monthlyRecap'

export const PRICE_PER_YEAR = 499

// Shared "why subscribe" pitch content — used by both welcome.js's
// onboarding carousel and subscription.js's pre-conversion pitch. Lives
// here (not in either screen file) specifically so neither route file has
// to import from the other — Expo Router treats every file under app/ as a
// route, and a route-to-route import broke the Subscription page.
export const WHY_ITEMS = [
  { title: 'Keeping it simple', description: 'No distractions, unnecessary features, or colourful clutter. Just what you need to track your money.' },
  { title: 'Built for consistency', description: 'I removed as much friction as possible, so you can keep tracking without giving up after a week.' },
  { title: 'Make tracking a habit', description: 'Just add your income and expenses every day. Okana takes care of the rest.' },
  { title: 'Track every rupee', description: 'Every rupee matters. The more you track, the better you understand your money.' },
  { title: 'Spend with awareness', description: 'Set a budget, watch your spending calendar, and try to create more green days.' },
]

export function formatChargeDate(dateStr) {
  const d = new Date(dateStr)
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

  const expiresAt = subscription.expires_at ? new Date(subscription.expires_at) : null
  const isActive = subscription.status === 'active' || (expiresAt && expiresAt > new Date(todayStr))
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
