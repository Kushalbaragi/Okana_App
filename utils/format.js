const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrencyFull(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(amount) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDate(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

export function dateBoxParts(dateStr) {
  const d = new Date(dateStr)
  return { day: d.getDate(), month: MONTHS_ABBR[d.getMonth()].toUpperCase() }
}

export function formatDateFull(dateStr) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const SPEND_SHADES = {
  neutral: { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)' },
  green:   { bg: 'rgba(34,197,94,0.18)',  color: '#4ade80' },
  red: [
    null,
    { bg: 'rgba(239,68,68,0.16)', color: '#fca5a5' },
    { bg: 'rgba(239,68,68,0.32)', color: '#f87171' },
    { bg: 'rgba(239,68,68,0.55)', color: '#fecaca' },
  ],
}

export function getDailyExpenseTotals(transactions) {
  const map = {}
  transactions.forEach(tx => {
    if (tx.type !== 'expense') return
    map[tx.date] = (map[tx.date] || 0) + tx.amount
  })
  return map
}

export function getIntensityThresholds(dailyTotals) {
  const values = Object.values(dailyTotals).sort((a, b) => a - b)
  if (!values.length) return { low: 0, high: 0 }
  return {
    low:  values[Math.floor((values.length - 1) * 0.33)],
    high: values[Math.floor((values.length - 1) * 0.66)],
  }
}

function spendIntensity(amount, thresholds) {
  if (!amount) return 0
  if (amount <= thresholds.low) return 1
  if (amount <= thresholds.high) return 2
  return 3
}

export function getEarliestDate(transactions) {
  if (!transactions.length) return null
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date)
}

export function spendShadeFor(dateStr, { dailyTotals, thresholds, earliest, todayStr }) {
  const isFuture = dateStr > todayStr
  const noData = earliest && dateStr < earliest
  if (isFuture || noData) return { ...SPEND_SHADES.neutral, isKnown: false }
  const amt = dailyTotals[dateStr] || 0
  const intensity = spendIntensity(amt, thresholds)
  const shade = intensity === 0 ? SPEND_SHADES.green : SPEND_SHADES.red[intensity]
  return { ...shade, isKnown: true }
}

export function currentMonthYear() {
  const now = new Date()
  return { month: now.getMonth(), year: now.getFullYear() }
}

export function monthLabel(month, year) {
  return `${MONTHS[month]} ${year}`
}

export function getMonthlyTotals(transactions, year) {
  const income = new Array(12).fill(0)
  const expense = new Array(12).fill(0)
  transactions.forEach(tx => {
    const d = new Date(tx.date)
    if (d.getFullYear() !== year) return
    const m = d.getMonth()
    if (tx.type === 'income') income[m] += tx.amount
    else expense[m] += tx.amount
  })
  return { income, expense }
}

export function getMonthTotal(transactions, type, month, year) {
  return transactions
    .filter(tx => {
      const d = new Date(tx.date)
      return tx.type === type && d.getMonth() === month && d.getFullYear() === year
    })
    .reduce((sum, tx) => sum + tx.amount, 0)
}

export function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Daily totals for a given month
export function getDailyTotals(transactions, month, year) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const income  = new Array(daysInMonth).fill(0)
  const expense = new Array(daysInMonth).fill(0)
  const labels  = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
  transactions.forEach(tx => {
    const d = new Date(tx.date)
    if (d.getMonth() !== month || d.getFullYear() !== year) return
    const idx = d.getDate() - 1
    if (tx.type === 'income') income[idx] += tx.amount
    else expense[idx] += tx.amount
  })
  return { income, expense, labels }
}

// Yearly data from first transaction year to now (All Time)
export function getLifetimeYearly(transactions) {
  if (!transactions.length) return { income: [], expense: [], labels: [], years: [] }
  const currYear = new Date().getFullYear()
  const earliest = transactions.reduce((min, tx) => {
    const y = new Date(tx.date).getFullYear(); return y < min ? y : min
  }, currYear)
  const years   = Array.from({ length: currYear - earliest + 1 }, (_, i) => earliest + i)
  const income  = new Array(years.length).fill(0)
  const expense = new Array(years.length).fill(0)
  transactions.forEach(tx => {
    const idx = years.indexOf(new Date(tx.date).getFullYear())
    if (idx !== -1) {
      if (tx.type === 'income') income[idx] += tx.amount
      else expense[idx] += tx.amount
    }
  })
  return { income, expense, labels: years.map(String), years }
}

export function budgetStatusColor(percent) {
  if (percent >= 100) return { fill: 'rgba(248,113,113,0.7)', text: '#f87171' }
  if (percent >= 90)  return { fill: 'rgba(234,179,8,0.7)',   text: '#eab308' }
  return { fill: 'rgba(74,222,128,0.6)', text: '#4ade80' }
}

export function getDelta(transactions, type, month, year) {
  const current = getMonthTotal(transactions, type, month, year)
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const prev = getMonthTotal(transactions, type, prevMonth, prevYear)
  return { current, prev, diff: current - prev }
}
