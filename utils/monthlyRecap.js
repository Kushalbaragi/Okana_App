import { parseISO } from 'date-fns'
import { computeSummaryFacts, money, monthName } from './summaryFacts'
import { messageCandidates } from './summaryMessages'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function prevMonthYear(month, year) {
  return month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year }
}

// "2029-03-05" -> "March 2029".
const dateLabel = (str) => `${monthName(Number(str.slice(5, 7)) - 1)} ${str.slice(0, 4)}`

// What went well: up to three plain facts that are true this month. Nothing about
// "savings" as such: only what the app tracked.
function winsOf(f) {
  const lines = []
  if (f.prevSpent > 0 && f.spent < f.prevSpent) lines.push(`Spent ${money(f.prevSpent - f.spent)} less than ${f.prevLabel}`)
  if (f.prevNoSpendDays != null && f.noSpendDays > f.prevNoSpendDays) lines.push(`${f.noSpendDays} no-spend days, up from ${f.prevNoSpendDays} in ${f.prevLabel}`)
  if (f.underBy > 0) lines.push(`Stayed ${money(f.underBy)} under your ${money(f.budgetAmount)} budget`)
  const added = f.goals.filter(g => g.added > 0).sort((a, b) => b.added - a.added)[0]
  if (added) lines.push(`Added ${money(added.added)} to ${added.name}`)
  if (f.endedLoan) lines.push(`Finished paying ${f.endedLoan.name}`)
  if (f.emisPaid.length) lines.push(f.emisPaid.length === 1 ? `Paid your ${f.emisPaid[0]} EMI` : `Paid ${f.emisPaid.length} EMIs on time`)
  if (!(f.prevNoSpendDays != null && f.noSpendDays > f.prevNoSpendDays) && f.trackedDays >= 20 && f.noSpendDays >= 3) lines.push(`${f.noSpendDays} days with no spending`)
  return lines.slice(0, 3)
}

// What to improve: up to three, the most important first. Each says what happened and,
// under it, what to do about it next month. `id` is the closing message that says the same
// thing, so the last slide can pick something else rather than repeat it.
function improvesOf(f) {
  const items = []
  const add = (id, text, tip) => items.push({ id, text, tip })
  if (f.overBy > 0) add('over_budget', `${money(f.overBy)} over your ${money(f.budgetAmount)} budget`, `Aim for ${money(f.dailyLimit)} a day in ${f.nextLabel}.`)
  if (f.prevSpent > 0 && f.spent >= f.prevSpent * 1.05) add('spent_more', `Spent ${money(f.spent - f.prevSpent)} more than ${f.prevLabel}`, 'Cut your two biggest buys first.')
  if (f.bigBuys[0]) add('big_buy', `${money(f.bigBuys[0].amount)} on "${f.titleCase(f.bigBuys[0].desc || 'one purchase')}" in one go`, 'Wait 28 days before the next big buy.')
  if (f.goal && f.goal.added <= 0) add('goal_untouched', `Nothing added to ${f.goal.name}`, `Add ${money(f.goalPlan(f.goal, 6).monthly)} the day your salary comes.`)
  if (f.payday) add('payday_week', `${f.payday.pct}% was spent in the week after payday`, `Move ${money(f.payday.move)} to savings on payday.`)
  if (f.costliestDay) add('costliest_day', `${f.costliestDay.name}s cost the most, about ${money(f.costliestDay.avg)} each`, `Plan your ${f.costliestDay.name} spending the night before.`)
  if (f.repeatBuy) add('repeat_buy', `"${f.repeatBuy.name}" ${f.repeatBuy.count} times, ${money(f.repeatBuy.total)} in all`, `Cut ${f.repeatBuy.cut} of them next month.`)
  if (f.emiShare != null && f.emiShare > 40) add('emi_share', `EMIs took ${f.emiShare}% of your income`, 'Do not take a new loan for now.')
  if (f.late) add('late_month', `${money(f.late.amount)} spent after the 24th`, 'Set a limit for the last week.')
  if (f.smallBuys) add('small_buys', `${f.smallBuys.count} small buys, ${money(f.smallBuys.total)} in all`, `Keep small buys under ${money(f.smallBuys.limit)} a day.`)
  return items.slice(0, 3)
}

// The bigger picture: EMIs against income, the closest goal, and the debt-free date.
function biggerOf(f) {
  const cards = []
  if (f.emiShare != null) cards.push({ label: 'EMIs took', value: `${f.emiShare}% of income`, percent: f.emiShare, tone: f.emiShare > 35 ? 'amber' : 'green' })
  if (f.goal) cards.push({ label: f.goal.name, value: `${f.goal.percent}% done`, percent: f.goal.percent, tone: 'green' })
  if (f.loans.length && f.debtFree) cards.push({ label: 'Debt free by', value: dateLabel(f.debtFree), note: `${f.loans.length} loan${f.loans.length === 1 ? '' : 's'} left` })
  return cards
}

// The slides of the monthly summary, in order, leaving out any that have nothing true to say:
//   intro    what this is: a moment to look back on the month
//   spent    how much, against last month and the budget
//   wins     what went well
//   improve  what to improve
//   bigger   EMIs, the closest goal, the debt-free date
//   message  one closing message (picked when it opens, see useSummaryMessage)
//
// `extra` is { goals, debts } from the savings data.
export function getMonthlyRecapSlides(transactions, month, year, budgetInfo, hasBudgetThisMonth, extra = {}) {
  const f = computeSummaryFacts({
    transactions, month, year, budgetInfo, hasBudgetNow: hasBudgetThisMonth,
    goals: extra.goals || [], debts: extra.debts || [],
  })

  // A summary of spending needs some spending to sum up.
  if (!(f.spent > 0)) return []

  const slides = [
    { type: 'intro', monthLabel: f.monthLabel, year },
    {
      type: 'spent', monthLabel: f.monthLabel, year,
      spent: f.spent, prevSpent: f.prevSpent, prevLabel: f.prevLabel,
      budgetAmount: f.budgetAmount, overBy: f.overBy, underBy: f.underBy,
    },
  ]
  const wins = winsOf(f)
  if (wins.length) slides.push({ type: 'wins', monthLabel: f.monthLabel, year, lines: wins })
  const improves = improvesOf(f)
  if (improves.length) slides.push({ type: 'improve', monthLabel: f.monthLabel, year, lines: improves })
  const cards = biggerOf(f)
  if (cards.length) slides.push({ type: 'bigger', monthLabel: f.monthLabel, year, cards })
  // The closing message prefers something slide 3 has not already said.
  const shown = new Set(improves.map(i => i.id))
  const allCandidates = messageCandidates(f)
  const candidates = [...allCandidates.filter(c => !shown.has(c.id)), ...allCandidates.filter(c => shown.has(c.id))]
  if (candidates.length) slides.push({ type: 'message', monthLabel: f.monthLabel, year, monthId: `${year}-${month}`, candidates })
  // Last, and only for someone with no budget for the month just begun.
  if (!hasBudgetThisMonth) slides.push({ type: 'budget', monthLabel: f.monthLabel, year })
  return slides
}

// Whether the month has any spending to sum up (income alone is not enough).
export function hasAnyRecapData(transactions, month, year) {
  return transactions.some(tx => {
    if (tx.type === 'income') return false
    const d = parseISO(tx.date)
    return d.getMonth() === month && d.getFullYear() === year
  })
}
