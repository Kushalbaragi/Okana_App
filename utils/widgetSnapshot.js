import { differenceInCalendarDays, parseISO } from 'date-fns'
import { toDateStr } from './format'
import { MONTH_NAMES } from './monthlyRecap'

// What the home screen widgets show, in one small JSON object. The app builds it
// (buildWidgetSnapshot) and hands it to the widgets (see widgetBridge.js); the
// widgets only ever read it. Amounts are plain numbers — each widget formats
// them itself.
//
//   signedIn   false once the user logs out, so a widget never shows the last
//              account's numbers
//   monthKey   'YYYY-MM' of the month `spent`/`budget` belong to
//   spent      expenses this month
//   budget     this month's budget, or null when none is set
//   daysEnd    the date (YYYY-MM-DD) of the last entry in `days`
//   days       expenses per day, oldest first, the last WIDGET_DAYS days
//   goals      active goals, closest to done first
export const WIDGET_DAYS = 30
export const WIDGET_MAX_GOALS = 8

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export const EMPTY_WIDGET_SNAPSHOT = { v: 1, signedIn: false }

export function buildWidgetSnapshot({ transactions, spent, budget, goals, now = new Date() }) {
  const days = new Array(WIDGET_DAYS).fill(0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const first = new Date(end)
  first.setDate(first.getDate() - (WIDGET_DAYS - 1))
  const firstStr = toDateStr(first)
  const endStr = toDateStr(end)

  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.date < firstStr || tx.date > endStr) continue
    // Whole days between this transaction and the first day of the window.
    days[differenceInCalendarDays(parseISO(tx.date), first)] += tx.amount
  }

  return {
    v: 1,
    signedIn: true,
    monthKey: monthKeyOf(now),
    spent,
    budget: budget ?? null,
    daysEnd: endStr,
    days,
    goals: goals.slice(0, WIDGET_MAX_GOALS).map(g => ({ name: g.name, saved: g.saved, target: g.target })),
  }
}

// The snapshot as it should read *now*. A widget can be drawn hours or days after
// the app last wrote it, so a new day shifts the daily bars along (the days since
// the app last ran had no entries it could know about, so they show as empty) and
// a new month starts the month total over at nothing, with no budget until the
// app sets one. Returns null when there is nothing to show (never written, or
// signed out).
export function resolveWidgetSnapshot(snapshot, now = new Date()) {
  if (!snapshot || !snapshot.signedIn) return null

  const shift = Math.max(0, differenceInCalendarDays(now, parseISO(snapshot.daysEnd)))
  const days = shift === 0
    ? snapshot.days
    : snapshot.days.slice(Math.min(shift, WIDGET_DAYS)).concat(new Array(Math.min(shift, WIDGET_DAYS)).fill(0))

  const sameMonth = snapshot.monthKey === monthKeyOf(now)
  return {
    ...snapshot,
    days,
    daysEnd: toDateStr(now),
    monthLabel: MONTH_NAMES[now.getMonth()],
    spent: sameMonth ? snapshot.spent : 0,
    budget: sameMonth ? snapshot.budget : null,
  }
}
