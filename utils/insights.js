import { formatCurrency, formatCurrencyFull, getMonthTotal, getDailyTotals, getEarliestDate, today } from './format'

function shiftDate(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumInRange(transactions, type, startStr, endStr) {
  return transactions
    .filter(tx => tx.type === type && tx.date >= startStr && tx.date <= endStr)
    .reduce((s, tx) => s + tx.amount, 0)
}

export function getTrendInsight(transactions, todayStr) {
  const weekStart     = shiftDate(todayStr, -6)
  const prevWeekEnd   = shiftDate(todayStr, -7)
  const prevWeekStart = shiftDate(todayStr, -13)

  const thisWeek = sumInRange(transactions, 'expense', weekStart, todayStr)
  const lastWeek = sumInRange(transactions, 'expense', prevWeekStart, prevWeekEnd)

  if (lastWeek <= 0) return null
  const pctChange = ((thisWeek - lastWeek) / lastWeek) * 100
  if (Math.abs(pctChange) < 10) return null

  const up = pctChange > 0
  return {
    key: 'trend',
    tone: up ? 'neutral' : 'positive',
    emoji: up ? '📈' : '📉',
    headline: up ? `Spending up ${Math.round(pctChange)}%` : `Spending down ${Math.round(Math.abs(pctChange))}%`,
    message: up
      ? `You've spent ${formatCurrency(thisWeek)} this week — ${Math.round(pctChange)}% more than last week.`
      : `You've spent ${formatCurrency(thisWeek)} this week — ${Math.round(Math.abs(pctChange))}% less than last week. Nice.`,
  }
}

export function getSavingsRateInsight(transactions, todayStr) {
  const d = new Date(todayStr)
  const month = d.getMonth(), year = d.getFullYear()
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear  = month === 0 ? year - 1 : year

  const incomeThis  = getMonthTotal(transactions, 'income', month, year)
  const expenseThis = getMonthTotal(transactions, 'expense', month, year)
  if (incomeThis <= 0) return null
  const rateThis = ((incomeThis - expenseThis) / incomeThis) * 100

  const incomePrev  = getMonthTotal(transactions, 'income', prevMonth, prevYear)
  const expensePrev = getMonthTotal(transactions, 'expense', prevMonth, prevYear)

  if (incomePrev <= 0) {
    if (rateThis < 5) return null
    return {
      key: 'savings',
      tone: 'positive',
      emoji: '💰',
      headline: `Saving ${Math.round(rateThis)}%`,
      message: `You're saving ${Math.round(rateThis)}% of your income this month.`,
    }
  }

  const ratePrev = ((incomePrev - expensePrev) / incomePrev) * 100
  const delta = rateThis - ratePrev
  if (Math.abs(delta) < 3) return null

  const up = delta > 0
  return {
    key: 'savings',
    tone: up ? 'positive' : 'neutral',
    emoji: up ? '💰' : '📊',
    headline: `Saving ${Math.round(rateThis)}%`,
    message: up
      ? `You saved ${Math.round(rateThis)}% of your income this month — up from ${Math.round(ratePrev)}% last month.`
      : `You've saved ${Math.round(rateThis)}% of your income this month, down from ${Math.round(ratePrev)}% last month.`,
  }
}

export function getYesterdayInsight(transactions, todayStr) {
  const yesterdayStr = shiftDate(todayStr, -1)
  const earliest = getEarliestDate(transactions)
  if (!earliest || earliest > yesterdayStr) return null

  const yesterdayTotal = sumInRange(transactions, 'expense', yesterdayStr, yesterdayStr)

  if (yesterdayTotal <= 0) {
    return {
      key: 'yesterday',
      tone: 'positive',
      emoji: '🎉',
      headline: 'No spending yesterday!',
      message: `You didn't spend anything yesterday — nice work keeping it in check!`,
    }
  }

  const d = new Date(yesterdayStr)
  const { expense } = getDailyTotals(transactions, d.getMonth(), d.getFullYear())
  const spentDays = expense.filter(v => v > 0)
  const maxSpend  = Math.max(...spentDays)
  const minSpend  = Math.min(...spentDays)

  if (spentDays.length > 1 && yesterdayTotal === maxSpend) {
    return {
      key: 'yesterday',
      tone: 'nudge',
      emoji: '📈',
      headline: 'Highest spending day this month',
      message: `You spent ${formatCurrency(yesterdayTotal)} yesterday — your highest single day this month.`,
    }
  }
  if (spentDays.length > 1 && yesterdayTotal === minSpend) {
    return {
      key: 'yesterday',
      tone: 'positive',
      emoji: '📉',
      headline: 'Lowest spending day this month',
      message: `You spent ${formatCurrency(yesterdayTotal)} yesterday — your lowest single day this month.`,
    }
  }

  return {
    key: 'yesterday',
    tone: 'neutral',
    emoji: '🧾',
    headline: `Yesterday's spend`,
    message: `You spent ${formatCurrency(yesterdayTotal)} yesterday.`,
  }
}

export function getAnomalyInsight(transactions, todayStr) {
  const recentCutoff = shiftDate(todayStr, -1)
  const recentBig = transactions
    .filter(tx => tx.type === 'expense' && tx.date >= recentCutoff && tx.date <= todayStr)
    .sort((a, b) => b.amount - a.amount)[0]
  if (!recentBig) return null

  const windowStart = shiftDate(todayStr, -60)
  const history = transactions.filter(
    tx => tx.type === 'expense' && tx.date >= windowStart && tx.date < recentBig.date,
  )
  if (history.length < 5) return null

  const maxHistory = Math.max(...history.map(tx => tx.amount))
  if (recentBig.amount <= maxHistory) return null

  return {
    key: 'anomaly',
    tone: 'neutral',
    emoji: '👀',
    headline: 'Biggest expense in a while',
    message: `${recentBig.description || 'That expense'} (${formatCurrencyFull(recentBig.amount)}) is your largest in the last 60 days.`,
  }
}

export function getNeglectInsight(transactions, todayStr) {
  if (!transactions.length) return null
  const lastDate = transactions.reduce((max, tx) => (tx.date > max ? tx.date : max), transactions[0].date)
  const daysSince = Math.round((new Date(todayStr) - new Date(lastDate)) / 86400000)
  if (daysSince < 4) return null
  return {
    key: 'neglect',
    tone: 'nudge',
    emoji: '👋',
    headline: `It's been ${daysSince} days`,
    message: `You haven't logged anything in ${daysSince} days — still tracking?`,
  }
}

export function getDailyInsight(transactions, todayStr = today()) {
  const neglect = getNeglectInsight(transactions, todayStr)
  if (neglect) return neglect

  const yesterday = getYesterdayInsight(transactions, todayStr)
  if (yesterday) return yesterday

  const anomaly = getAnomalyInsight(transactions, todayStr)
  if (anomaly) return anomaly

  const savings = getSavingsRateInsight(transactions, todayStr)
  if (savings) return savings

  const trend = getTrendInsight(transactions, todayStr)
  if (trend) return trend

  return null
}
