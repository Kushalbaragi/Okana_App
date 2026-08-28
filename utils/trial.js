import { MONTH_NAMES } from './monthlyRecap'
import { shiftDate } from './format'

export const TRIAL_DAYS = 30
export const PRICE_PER_YEAR = 499

export function getTrialInfo(trialStartStr, todayStr) {
  if (!trialStartStr) {
    return { status: 'not_started', daysLeft: TRIAL_DAYS, chargeDate: null }
  }

  const daysElapsed = Math.floor((new Date(todayStr) - new Date(trialStartStr)) / 86400000)
  const daysLeft = TRIAL_DAYS - daysElapsed
  const chargeDate = shiftDate(trialStartStr, TRIAL_DAYS)

  if (daysLeft <= 0) {
    return { status: 'expired', daysLeft: 0, chargeDate }
  }
  return { status: 'active', daysLeft, chargeDate }
}

export function formatChargeDate(dateStr) {
  const d = new Date(dateStr)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// Maps a `subscriptions` row (Razorpay status) to what the UI needs to show.
// Statuses: not_started (no row) · trial (mandate set up, 30-day window running —
// may already be cancelled, see `cancelAtPeriodEnd`) · subscribed (currently
// billed and active) · expired (trial lapsed / paid plan lapsed / halted).
//
// `everBilled` distinguishes "this expiry is a trial that ran out" from "this
// expiry is a paid plan whose billing period ended" — both land in `expired`,
// but need different messaging.
export function getSubscriptionDisplayStatus(subscription, todayStr) {
  if (!subscription) {
    return { status: 'not_started', daysLeft: TRIAL_DAYS, chargeDate: null, cancelAtPeriodEnd: false, paymentFailed: false, everBilled: false }
  }

  // RevenueCat-driven rows (native App Store / Play Store purchases) carry
  // their own status vocabulary (in_grace_period, in_billing_retry_period,
  // on_hold, paused, revoked, canceled, ...) that doesn't map cleanly onto
  // Razorpay's. Rather than hand-mapping every one — semantics differ
  // subtly per platform and can't be verified against a live payload yet —
  // trust `expires_at`, the column meant to be authoritative regardless of
  // platform once every writer populates it.
  if (subscription.platform === 'apple' || subscription.platform === 'google') {
    const expiresAt = subscription.expires_at ? new Date(subscription.expires_at) : null
    const isActive = subscription.status === 'active' || (expiresAt && expiresAt > new Date(todayStr))
    if (!isActive) {
      return { status: 'expired', daysLeft: 0, chargeDate: subscription.expires_at, cancelAtPeriodEnd: false, paymentFailed: subscription.status === 'on_hold', everBilled: true }
    }
    return {
      status: 'subscribed',
      daysLeft: 0,
      chargeDate: subscription.expires_at,
      cancelAtPeriodEnd: subscription.auto_renew === false,
      paymentFailed: ['in_grace_period', 'in_billing_retry_period'].includes(subscription.status),
      everBilled: true,
    }
  }

  if (subscription.status === 'active') {
    return {
      status: 'subscribed',
      daysLeft: 0,
      chargeDate: subscription.current_end,
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      paymentFailed: false,
      everBilled: true,
    }
  }
  if (['halted', 'pending'].includes(subscription.status)) {
    return { status: 'expired', daysLeft: 0, chargeDate: subscription.current_end, cancelAtPeriodEnd: false, paymentFailed: true, everBilled: !!subscription.current_start }
  }
  if (['cancelled', 'expired', 'completed'].includes(subscription.status)) {
    // Cancelled before the mandate was ever actually billed (current_start
    // never got set) — this was a trial-phase cancellation. Keep Plus access
    // until the original trial end date instead of cutting it off early.
    if (!subscription.current_start && subscription.trial_start) {
      const trial = getTrialInfo(subscription.trial_start, todayStr)
      if (trial.status === 'active') {
        return { status: 'trial', daysLeft: trial.daysLeft, chargeDate: trial.chargeDate, cancelAtPeriodEnd: true, paymentFailed: false, everBilled: false }
      }
    }
    return { status: 'expired', daysLeft: 0, chargeDate: subscription.current_end, cancelAtPeriodEnd: false, paymentFailed: false, everBilled: !!subscription.current_start }
  }
  if (subscription.status === 'created') {
    // Checkout was never completed — no mandate exists, so there's nothing to
    // charge and nothing to cancel. Treat it the same as a brand-new user.
    return { status: 'not_started', daysLeft: TRIAL_DAYS, chargeDate: null, cancelAtPeriodEnd: false, paymentFailed: false, everBilled: false }
  }

  // authenticated — mandate is set up, trial window is running.
  //
  // Except: a `free_trial_`-prefixed razorpay_subscription_id means this row
  // was auto-granted at signup by a DB trigger, with no real payment mandate
  // behind it (the web app's own free-trial-without-a-card flow). The mobile
  // app deliberately does not honor that here — native purchases (Apple/
  // Google) are the only way to start a trial or subscribe on mobile,
  // matching how the App Store/Play Store collect a payment method upfront
  // for an introductory-offer trial. Treated as if no subscription exists.
  if (subscription.platform === 'razorpay' && subscription.razorpay_subscription_id?.startsWith('free_trial_')) {
    return { status: 'not_started', daysLeft: TRIAL_DAYS, chargeDate: null, cancelAtPeriodEnd: false, paymentFailed: false, everBilled: false }
  }

  const trial = getTrialInfo(subscription.trial_start, todayStr)
  if (trial.status === 'expired') {
    return { status: 'expired', daysLeft: 0, chargeDate: trial.chargeDate, cancelAtPeriodEnd: false, paymentFailed: false, everBilled: false }
  }
  return {
    status: 'trial',
    daysLeft: trial.daysLeft,
    chargeDate: trial.chargeDate,
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    paymentFailed: false,
    everBilled: false,
  }
}
