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
// but need different messaging (see getPendingSubscriptionPopup below).
export function getSubscriptionDisplayStatus(subscription, todayStr) {
  if (!subscription) {
    return { status: 'not_started', daysLeft: TRIAL_DAYS, chargeDate: null, cancelAtPeriodEnd: false, paymentFailed: false, everBilled: false }
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

  // authenticated — mandate is set up, trial window is running
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

// Selects the one subscription-lifecycle popup (if any) due right now, and a
// storage key that makes showing it a one-time event. Each event type
// dedupes against a different scope, matching how often it can legitimately
// recur over a subscription's life:
//   - payment failure can recur (each renewal attempt) → keyed by updated_at,
//     so a fresh failure gets a fresh notice but re-opening the app during
//     the same unresolved failure doesn't re-show it
//   - trial-ending-tomorrow / success / ended are each a once-per-subscription
//     event → keyed by the Razorpay subscription id
export function getPendingSubscriptionPopup(subscription, trialInfo, userId) {
  if (!subscription || !userId) return null
  const subId = subscription.razorpay_subscription_id

  if (trialInfo.paymentFailed) {
    return { type: 'payment-failed', key: `okana_popup_payment_failed_${userId}_${subscription.updated_at}` }
  }
  if (trialInfo.status === 'subscribed' && !trialInfo.cancelAtPeriodEnd) {
    return { type: 'success', key: `okana_popup_success_${userId}_${subId}` }
  }
  if (trialInfo.status === 'trial' && !trialInfo.cancelAtPeriodEnd && trialInfo.daysLeft === 1) {
    return { type: 'trial-tomorrow', key: `okana_popup_trial_tomorrow_${userId}_${subId}` }
  }
  if (trialInfo.status === 'expired' && !trialInfo.everBilled) {
    return { type: 'trial-ended', key: `okana_popup_trial_ended_${userId}_${subId}` }
  }
  if (trialInfo.status === 'expired' && trialInfo.everBilled) {
    return { type: 'sub-ended', key: `okana_popup_sub_ended_${userId}_${subId}` }
  }
  return null
}
