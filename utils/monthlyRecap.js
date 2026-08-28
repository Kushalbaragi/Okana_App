import {
  getDailyTotals, getMonthlyTotals, getMonthTotal,
  getDailyExpenseTotals, getIntensityThresholds, getEarliestDate, spendShadeFor, today, toDateStr,
} from './format'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function prevMonthYear(month, year) {
  return month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year }
}

function dailyChartSlide(transactions, month, year) {
  const { expense, labels } = getDailyTotals(transactions, month, year)

  let highestIndex = -1, highestAmount = 0
  expense.forEach((v, i) => { if (v > highestAmount) { highestAmount = v; highestIndex = i } })

  let highestDescription = ''
  if (highestIndex >= 0) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(highestIndex + 1).padStart(2, '0')}`
    const topTx = transactions
      .filter(tx => tx.type === 'expense' && tx.date === dateStr)
      .sort((a, b) => b.amount - a.amount)[0]
    highestDescription = topTx?.description || 'that expense'
  }

  return {
    type: 'daily-chart',
    month, year,
    values: expense,
    labels,
    highestIndex,
    highestAmount,
    highestDay: highestIndex + 1,
    highestDescription,
    noSpendDays: expense.filter(v => v === 0).length,
  }
}

function pctChange(diff, base) {
  return base > 0 ? Math.round((diff / base) * 100) : null
}

function monthlyChartSlide(transactions, month, year) {
  const { income, expense } = getMonthlyTotals(transactions, year)
  const currentExpense = expense[month]
  const currentIncome = income[month]
  const lastYearExpense = getMonthTotal(transactions, 'expense', month, year - 1)
  const lastYearIncome = getMonthTotal(transactions, 'income', month, year - 1)
  const expenseDiff = currentExpense - lastYearExpense
  const incomeDiff = currentIncome - lastYearIncome

  const { month: pm, year: py } = prevMonthYear(month, year)
  const prevMonthExpense = getMonthTotal(transactions, 'expense', pm, py)

  return {
    type: 'monthly-chart',
    month, year,
    expenseValues: expense,
    currentExpense,
    currentIncome,
    lastYearExpense,
    lastYearIncome,
    expenseDiff,
    incomeDiff,
    expensePct: pctChange(expenseDiff, lastYearExpense),
    incomePct: pctChange(incomeDiff, lastYearIncome),
    prevMonth: pm,
    prevYear: py,
    prevMonthExpense,
    prevMonthDiff: currentExpense - prevMonthExpense,
  }
}

function overviewSlide(transactions, month, year) {
  const { income, expense } = getMonthlyTotals(transactions, year)
  const currentIncome = income[month]
  const currentExpense = expense[month]

  return {
    type: 'overview',
    month, year,
    incomeValues: income,
    expenseValues: expense,
    currentIncome,
    currentExpense,
    monthSavings: currentIncome - currentExpense,
  }
}

// Budget isn't derived from `transactions` (it lives in its own Supabase
// table), so it's the one slide that needs its numbers handed in rather
// than computed here — `budgetInfo` is `{ amount, spent }` for the month
// being reviewed, or omitted/null if no budget was set that month, in
// which case this slide is skipped entirely.
function budgetSlide(month, year, budgetInfo) {
  if (budgetInfo?.amount == null) return null
  const { amount, spent } = budgetInfo
  return {
    type: 'budget',
    month, year,
    budgetAmount: amount,
    budgetSpent: spent,
    percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
  }
}

// Per-day spend-shade coloring, same intensity buckets (computed from the
// user's whole history, not just this month) SpendCalendarModal uses —
// precomputed here so the slide component just renders, rather than
// needing the raw transaction list itself.
function calendarSlide(transactions, month, year) {
  const { expense } = getDailyTotals(transactions, month, year)
  const daysInMonth = expense.length
  const noSpendDays = expense.filter(v => v === 0).length
  const spentDays = daysInMonth - noSpendDays

  const { month: pm, year: py } = prevMonthYear(month, year)
  const { expense: prevExpense } = getDailyTotals(transactions, pm, py)
  const prevNoSpendDays = prevExpense.filter(v => v === 0).length

  const dailyTotals = getDailyExpenseTotals(transactions)
  const thresholds = getIntensityThresholds(dailyTotals)
  const earliest = getEarliestDate(transactions)
  const todayStr = today()

  const rawFirstDay = new Date(year, month, 1).getDay()
  const firstDay = rawFirstDay === 0 ? 6 : rawFirstDay - 1

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const str = toDateStr(new Date(year, month, d))
    const shade = spendShadeFor(str, { dailyTotals, thresholds, earliest, todayStr })
    return { day: d, bg: shade.bg, color: shade.color }
  })

  return {
    type: 'calendar',
    month, year,
    firstDay,
    days,
    daysInMonth,
    spentDays,
    noSpendDays,
    prevMonth: pm,
    prevYear: py,
    prevNoSpendDays,
  }
}

// Being rebuilt slide by slide — more slide types get added here one at a
// time as they're built.
//
// `hasBudgetThisMonth` is deliberately about the real *current* month
// (regardless of which month/year is being reviewed) — it only controls
// whether the closing slide's "Set This Month's Budget" CTA makes sense to
// show at all.
export function getMonthlyRecapSlides(transactions, month, year, budgetInfo, hasBudgetThisMonth) {
  const slides = [
    { type: 'title', month, year },
    dailyChartSlide(transactions, month, year),
    monthlyChartSlide(transactions, month, year),
    overviewSlide(transactions, month, year),
  ]
  const budget = budgetSlide(month, year, budgetInfo)
  if (budget) slides.push(budget)
  slides.push(calendarSlide(transactions, month, year))
  slides.push({ type: 'closing', hasBudgetThisMonth: !!hasBudgetThisMonth })
  return slides
}

export function hasAnyRecapData(transactions, month, year) {
  return transactions.some(tx => {
    const d = new Date(tx.date)
    return d.getMonth() === month && d.getFullYear() === year
  })
}
