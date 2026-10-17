import { parseISO, getDaysInMonth } from 'date-fns'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// No thousands separators — the transaction ledger's own rows use this
// (see TransactionItem) so a fixed-width amount column doesn't have to
// account for commas shifting where the digits themselves start; the
// month header above them keeps the grouped formatCurrency.
export function formatCurrencyPlain(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: false,
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

export function today() {
  // Local calendar date, not UTC — toISOString() converts to UTC first,
  // which rolls back to "yesterday" for any timezone ahead of UTC (e.g.
  // IST) during the hours after local midnight but before UTC midnight.
  return toDateStr(new Date())
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// parseISO, not `new Date(dateStr)` — every dateStr in this app is a plain
// "YYYY-MM-DD" (see toDateStr above), and the native Date constructor parses
// a date-only string as UTC midnight, not local midnight (per the ECMAScript
// spec — this is a long-standing, easy-to-miss JS footgun). For a timezone
// ahead of UTC that happens to still land on the same calendar day once
// getDate()/getMonth() convert it back to local time, so it can look correct
// while developing/testing in one timezone and silently be a day off in
// another. parseISO treats a date-only string as local midnight instead,
// matching how toDateStr/today() above already construct these strings.
function shiftDate(dateStr, days) {
  const d = parseISO(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

export function dateBoxParts(dateStr) {
  const d = parseISO(dateStr)
  return { day: d.getDate(), month: MONTHS[d.getMonth()].toUpperCase() }
}

// Where a chart's real data begins: the index of the first bar that falls on or
// after the account's first transaction, or null when that is not in the period
// being shown (the account already existed for all of it, or has no data there
// yet). The days of a month before the first transaction, or the months of a year
// before it, are not "no spend" but "before there was anything to spend from", so
// an average must not count them. Month view is indexed by day, year view by month.
export function firstBarWithData({ timeRange, earliestDateStr, year, currYear, currMonth }) {
  if (!earliestDateStr) return null
  const d = parseISO(earliestDateStr)
  if (timeRange === 'month') return d.getFullYear() === currYear && d.getMonth() === currMonth ? d.getDate() - 1 : null
  if (timeRange === 'year') return d.getFullYear() === year ? d.getMonth() : null
  return null
}

// "Today", "Yesterday", or "12 Sep 2026" — how a date reads on the button that
// opens the calendar in the add-transaction and savings sheets.
export function formatDayLabel(dateStr) {
  const todayStr = today()
  if (dateStr === todayStr) return 'Today'
  if (dateStr === shiftDate(todayStr, -1)) return 'Yesterday'
  return formatDateFull(dateStr)
}

export function formatDateFull(dateStr) {
  const d = parseISO(dateStr)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function getEarliestDate(transactions) {
  if (!transactions.length) return null
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date)
}

export function currentMonthYear() {
  const now = new Date()
  return { month: now.getMonth(), year: now.getFullYear() }
}

export function getMonthlyTotals(transactions, year) {
  const income = new Array(12).fill(0)
  const expense = new Array(12).fill(0)
  transactions.forEach(tx => {
    const d = parseISO(tx.date)
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
      const d = parseISO(tx.date)
      return tx.type === type && d.getMonth() === month && d.getFullYear() === year
    })
    .reduce((sum, tx) => sum + tx.amount, 0)
}

// Daily totals for a given month
export function getDailyTotals(transactions, month, year) {
  const daysInMonth = getDaysInMonth(new Date(year, month))
  const income  = new Array(daysInMonth).fill(0)
  const expense = new Array(daysInMonth).fill(0)
  const labels  = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
  transactions.forEach(tx => {
    const d = parseISO(tx.date)
    if (d.getMonth() !== month || d.getFullYear() !== year) return
    const idx = d.getDate() - 1
    if (tx.type === 'income') income[idx] += tx.amount
    else expense[idx] += tx.amount
  })
  return { income, expense, labels }
}

// Yearly data from first transaction year to now (All Time)
// `earliestDateStr` is optional — a caller that's already computed the
// account's earliest transaction date (e.g. via getEarliestDate, for its
// own separate reason) can pass it through to skip re-deriving the same thing.
// One entry per calendar year the account has data in, from the first to this
// year (or a later one, if something is dated ahead) — no empty years added.
export function getLifetimeYearly(transactions, earliestDateStr) {
  const currYear = new Date().getFullYear()
  // A new account has no history yet: just this year.
  if (!transactions.length) {
    return { income: [0], expense: [0], labels: [String(currYear)], years: [currYear] }
  }
  let first = earliestDateStr ? parseISO(earliestDateStr).getFullYear() : currYear
  let last = currYear
  transactions.forEach(tx => {
    const y = parseISO(tx.date).getFullYear()
    if (!earliestDateStr && y < first) first = y
    if (y > last) last = y
  })
  const years   = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const income  = new Array(years.length).fill(0)
  const expense = new Array(years.length).fill(0)
  transactions.forEach(tx => {
    const idx = years.indexOf(parseISO(tx.date).getFullYear())
    if (idx !== -1) {
      if (tx.type === 'income') income[idx] += tx.amount
      else expense[idx] += tx.amount
    }
  })
  return { income, expense, labels: years.map(String), years }
}
