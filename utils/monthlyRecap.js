import { getMonthTotal, getDailyTotals, formatCurrency } from './format'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function prevMonthYear(month, year) {
  return month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year }
}

function pctChange(diff, base) {
  return base > 0 ? Math.round((diff / base) * 100) : null
}

function yearWiseSlide(transactions, month, year) {
  const total = getMonthTotal(transactions, 'expense', month, year)
  const lastYearTotal = getMonthTotal(transactions, 'expense', month, year - 1)
  const diff = total - lastYearTotal
  const p = pctChange(diff, lastYearTotal)

  let message
  if (lastYearTotal <= 0) {
    message = `No ${MONTH_NAMES[month]} ${year - 1} data to compare — this is your first tracked ${MONTH_NAMES[month]}.`
  } else if (diff > 0) {
    message = `That's ${formatCurrency(diff)} more than ${MONTH_NAMES[month]} ${year - 1}${p != null ? ` — ${p}% higher` : ''}.`
  } else if (diff < 0) {
    message = `That's ${formatCurrency(Math.abs(diff))} less than ${MONTH_NAMES[month]} ${year - 1}${p != null ? ` — ${Math.abs(p)}% lower` : ''}.`
  } else {
    message = `Same as ${MONTH_NAMES[month]} ${year - 1} — ${formatCurrency(total)}.`
  }

  return {
    key: 'year',
    kicker: 'YEAR OVER YEAR',
    emoji: '📆',
    tone: lastYearTotal <= 0 ? 'neutral' : diff > 0 ? 'nudge' : diff < 0 ? 'positive' : 'neutral',
    value: formatCurrency(total),
    headline: `vs ${MONTH_NAMES[month]} ${year - 1}`,
    message,
  }
}

function monthWiseSlide(transactions, month, year) {
  const total = getMonthTotal(transactions, 'expense', month, year)
  const { month: pm, year: py } = prevMonthYear(month, year)
  const prevTotal = getMonthTotal(transactions, 'expense', pm, py)
  const diff = total - prevTotal
  const p = pctChange(diff, prevTotal)

  let message
  if (prevTotal <= 0) {
    message = `You spent ${formatCurrency(total)} in ${MONTH_NAMES[month]} — your first tracked month of expenses.`
  } else if (diff > 0) {
    message = `That's ${formatCurrency(diff)} more than ${MONTH_NAMES[pm]}${p != null ? ` — ${p}% higher` : ''}.`
  } else if (diff < 0) {
    message = `That's ${formatCurrency(Math.abs(diff))} less than ${MONTH_NAMES[pm]}${p != null ? ` — ${Math.abs(p)}% lower` : ''}. Nice.`
  } else {
    message = `Exactly the same as ${MONTH_NAMES[pm]} — ${formatCurrency(total)}.`
  }

  return {
    key: 'month',
    kicker: 'MONTH RECAP',
    emoji: '🗓️',
    tone: prevTotal <= 0 ? 'neutral' : diff > 0 ? 'nudge' : diff < 0 ? 'positive' : 'neutral',
    value: formatCurrency(total),
    headline: `${MONTH_NAMES[month]} spending`,
    message,
  }
}

function mostSpentDaySlide(transactions, month, year) {
  const { expense, labels } = getDailyTotals(transactions, month, year)
  let maxIdx = -1, maxVal = 0
  expense.forEach((v, i) => { if (v > maxVal) { maxVal = v; maxIdx = i } })

  if (maxIdx === -1) {
    return {
      key: 'most-day',
      kicker: 'BIGGEST DAY',
      emoji: '📍',
      tone: 'neutral',
      value: '—',
      headline: 'No expenses logged',
      message: `You didn't log any expenses in ${MONTH_NAMES[month]}.`,
    }
  }

  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(maxIdx + 1).padStart(2, '0')}`
  const topTx = transactions
    .filter(tx => tx.type === 'expense' && tx.date === dateStr)
    .sort((a, b) => b.amount - a.amount)[0]
  const topDesc = topTx?.description || 'that expense'

  return {
    key: 'most-day',
    kicker: 'BIGGEST DAY',
    emoji: '💸',
    tone: 'nudge',
    value: formatCurrency(maxVal),
    headline: `${labels[maxIdx]} ${MONTH_NAMES[month]}`,
    message: `You spent the highest on ${MONTH_NAMES[month]} ${labels[maxIdx]} — ${formatCurrency(maxVal)} for "${topDesc}".`,
  }
}

function incomeGrowthSlide(transactions, month, year) {
  const incomeThis = getMonthTotal(transactions, 'income', month, year)
  const { month: pm, year: py } = prevMonthYear(month, year)
  const incomePrev = getMonthTotal(transactions, 'income', pm, py)
  const diff = incomeThis - incomePrev
  const p = pctChange(diff, incomePrev)

  let message, tone
  if (incomePrev <= 0) {
    if (incomeThis > 0) {
      message = `You earned ${formatCurrency(incomeThis)} in ${MONTH_NAMES[month]}.`
      tone = 'positive'
    } else {
      message = `No income logged in ${MONTH_NAMES[month]}.`
      tone = 'neutral'
    }
  } else if (diff > 0) {
    message = `Your income grew by ${formatCurrency(diff)}${p != null ? ` (${p}%)` : ''} compared to ${MONTH_NAMES[pm]}.`
    tone = 'positive'
  } else if (diff < 0) {
    message = `Your income dropped by ${formatCurrency(Math.abs(diff))}${p != null ? ` (${Math.abs(p)}%)` : ''} compared to ${MONTH_NAMES[pm]}.`
    tone = 'nudge'
  } else {
    message = `Your income stayed flat at ${formatCurrency(incomeThis)}.`
    tone = 'neutral'
  }

  return {
    key: 'income',
    kicker: 'INCOME GROWTH',
    emoji: diff >= 0 ? '💰' : '📉',
    tone,
    value: formatCurrency(incomeThis),
    headline: `${MONTH_NAMES[month]} income`,
    message,
  }
}

export function getMonthlyRecapSlides(transactions, month, year) {
  return [
    yearWiseSlide(transactions, month, year),
    monthWiseSlide(transactions, month, year),
    mostSpentDaySlide(transactions, month, year),
    incomeGrowthSlide(transactions, month, year),
  ]
}

export function hasAnyRecapData(transactions, month, year) {
  return transactions.some(tx => {
    const d = new Date(tx.date)
    return d.getMonth() === month && d.getFullYear() === year
  })
}
