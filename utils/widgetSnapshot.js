import { MONTH_NAMES } from './monthlyRecap'

// What the home screen widget shows, in one small JSON object. The app builds it
// (buildWidgetSnapshot) and hands it to the widget (see widgetBridge.js); the
// widget only ever reads it. Amounts are plain numbers — the widget formats them
// itself.
//
//   signedIn   false once the user logs out, so the widget never shows the last
//              account's numbers
//   monthKey   'YYYY-MM' of the month the rest belongs to
//   spent      expenses this month
//   month      expenses per day of this month, day 1 first, one entry per day of
//              the month (days still to come are 0)
//   lastMonthSpent  all of last month's expenses, or null when there were none —
//              the widget compares this month against it
const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export const EMPTY_WIDGET_SNAPSHOT = { v: 1, signedIn: false }

export function buildWidgetSnapshot({ transactions, spent, now = new Date() }) {
  const monthKey = monthKeyOf(now)
  const month = new Array(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).fill(0)
  const lastMonthKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  let lastMonthSpent = 0

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const txMonth = tx.date.slice(0, 7)
    if (txMonth === monthKey) month[Number(tx.date.slice(8, 10)) - 1] += tx.amount
    else if (txMonth === lastMonthKey) lastMonthSpent += tx.amount
  }

  return {
    v: 1,
    signedIn: true,
    monthKey,
    spent,
    month,
    lastMonthSpent: lastMonthSpent > 0 ? lastMonthSpent : null,
  }
}

// The snapshot as it should read *now*. The widget can be drawn hours or days
// after the app last wrote it, so a new month starts over at nothing, with no
// comparison until the app runs again. Returns null when there is nothing to show
// (never written, or signed out).
export function resolveWidgetSnapshot(snapshot, now = new Date()) {
  if (!snapshot || !snapshot.signedIn) return null

  const sameMonth = snapshot.monthKey === monthKeyOf(now)
  // One entry per day of the current month; a month that started while the app
  // stayed closed has nothing in it yet.
  const stored = sameMonth ? (snapshot.month || []) : []
  const month = Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, i) => stored[i] || 0)
  return {
    ...snapshot,
    monthLabel: MONTH_NAMES[now.getMonth()],
    spent: sameMonth ? snapshot.spent : 0,
    month,
    today: now.getDate(),
    // Last month changes when the month does, and only the app knows it.
    lastMonthSpent: sameMonth ? (snapshot.lastMonthSpent ?? null) : null,
  }
}
