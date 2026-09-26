import { parseISO, getDaysInMonth } from 'date-fns'
import { darkText, lightText } from './colors'

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
export function shiftDate(dateStr, days) {
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

// `spend` used to be 3 fixed buckets by RANK (which third of the month's
// days a day's amount fell into) — that made two very different amounts,
// say ₹50 and ₹1,400, land in the same bucket and render identically
// whenever a couple of outlier days pulled the rank thresholds up. It's a
// continuous scale now (see spendShadeForAmount below): every distinct
// amount gets its own point between MIN/MAX rather than one of 3 shared
// shades, so no two differently-sized spend days can accidentally match.
const SPEND_SHADES = {
  neutral: { bg: 'rgba(255,255,255,0.04)', color: darkText.disabled },
  // A day that hasn't happened yet — dimmer than `neutral`, on purpose:
  // neutral covers "no data to judge from" (before the account's earliest
  // activity), which is a real, known cell just with nothing to shade;
  // future is "irrelevant until it arrives," so it recedes further.
  future:  { bg: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.18)' },
  green:   { bg: 'rgba(34,197,94,0.18)',  color: '#4ade80' },
  // The two ends of the continuous spend scale — MIN is what the smallest
  // nonzero spend day looks like, MAX is what the month's single biggest
  // spend day looks like; everything else is interpolated between them.
  // Pushed further apart than the first pass — MIN dimmer, MAX brighter
  // and with a much stronger background fill — so low and high spend days
  // read as clearly different at a glance instead of blending together.
  spendBgTint: [239, 68, 68],
  spendMin: { bgAlpha: 0.12, color: [252, 165, 165] },  // #fca5a5, faint red
  spendMax: { bgAlpha: 0.55, color: [254, 226, 226] },  // #fee2e2, bold fill
}

// Same shape as SPEND_SHADES, tuned for a light background — the dark set's
// pale near-white text tones were chosen for contrast against a dark cell
// fill and read as barely-there on white. Only used when spendShadeFor is
// explicitly asked for it (the light-theme experiment on the Calendar
// screen); every other caller keeps the dark set unchanged.
const SPEND_SHADES_LIGHT = {
  neutral: { bg: 'rgba(0,0,0,0.04)', color: lightText.disabled },
  future:  { bg: 'rgba(0,0,0,0.02)', color: 'rgba(0,0,0,0.18)' },
  green:   { bg: 'rgba(34,197,94,0.16)', color: '#15803d' },
  spendBgTint: [239, 68, 68],
  spendMin: { bgAlpha: 0.10, color: [185, 28, 28] },   // #b91c1c
  spendMax: { bgAlpha: 0.45, color: [127, 29, 29] },   // #7f1d1d, bold fill
}

export function getDailyExpenseTotals(transactions) {
  const map = {}
  transactions.forEach(tx => {
    if (tx.type !== 'expense') return
    map[tx.date] = (map[tx.date] || 0) + tx.amount
  })
  return map
}

// Just the month's single biggest spend day — the one number the
// continuous scale needs to place every other day's amount relative to.
export function getIntensityThresholds(dailyTotals) {
  const values = Object.values(dailyTotals)
  return { max: values.length ? Math.max(...values) : 0 }
}

// sqrt, not linear — spend days are usually skewed (lots of small ones,
// a few big outliers), and a linear ratio against the single biggest day
// crushes every ordinary day down near the dim end while only the outlier
// itself stands out. sqrt spreads the low-to-mid range back out so a ₹50
// and a ₹400 day still look visibly different from each other, not just
// from the ₹1,400 day.
function spendShadeForAmount(amount, max, shades) {
  if (!amount) return shades.green
  const ratio = max > 0 ? Math.sqrt(Math.min(1, amount / max)) : 1
  const { bgAlpha: minA, color: minC } = shades.spendMin
  const { bgAlpha: maxA, color: maxC } = shades.spendMax
  const alpha = minA + (maxA - minA) * ratio
  const r = Math.round(minC[0] + (maxC[0] - minC[0]) * ratio)
  const g = Math.round(minC[1] + (maxC[1] - minC[1]) * ratio)
  const b = Math.round(minC[2] + (maxC[2] - minC[2]) * ratio)
  const bgRgb = shades.spendBgTint.join(',')
  return { bg: `rgba(${bgRgb},${alpha.toFixed(3)})`, color: `rgb(${r},${g},${b})` }
}

export function getEarliestDate(transactions) {
  if (!transactions.length) return null
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date)
}

export function spendShadeFor(dateStr, { dailyTotals, thresholds, earliest, todayStr, light = false }) {
  const shades = light ? SPEND_SHADES_LIGHT : SPEND_SHADES
  const isFuture = dateStr > todayStr
  const isToday = dateStr === todayStr
  // No transactions at all yet — every day, including today, has nothing
  // to compare against, so none of them should read as "no spend" green.
  // Today alone stays "known" (tappable) so a brand new account isn't
  // completely inert before its first transaction; every other day stays
  // neutral (or future, past today) and untappable until one actually
  // exists.
  if (!earliest) return { ...(isFuture ? shades.future : shades.neutral), isKnown: isToday }
  // `future` and `neutral` both render untappable and unshaded, but stay
  // distinct shades — future recedes further, since it's not just "no
  // data to judge" (a real day, before the account existed) but "hasn't
  // happened yet," which deserves to visually fade out more.
  if (isFuture) return { ...shades.future, isKnown: false }
  const noData = dateStr < earliest
  if (noData) return { ...shades.neutral, isKnown: false }
  const amt = dailyTotals[dateStr] || 0
  const shade = spendShadeForAmount(amt, thresholds.max, shades)
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
// own separate reason) can pass it through to skip a second full scan of
// `transactions` here purely to re-derive the same thing.
// A couple of years of real history reads as a handful of bars stranded
// with huge gaps between them (BarChart spaces bars evenly across the full
// chart width regardless of count) — this pads the range forward with
// future, as-yet-empty years, the same way the Year tab always shows all 12
// months of the calendar year rather than stopping at the current one.
const MIN_YEAR_SLOTS = 5

export function getLifetimeYearly(transactions, earliestDateStr) {
  const currYear = new Date().getFullYear()
  // A new account (or one with only this year's data) has just one year of
  // history — LineChart needs at least 2 points to draw a line, so the
  // range always spans at least currYear-1..currYear, padded with zeros.
  if (!transactions.length) {
    const earliest = currYear - 1
    const endYear  = Math.max(currYear, earliest + MIN_YEAR_SLOTS - 1)
    const years    = Array.from({ length: endYear - earliest + 1 }, (_, i) => earliest + i)
    return { income: new Array(years.length).fill(0), expense: new Array(years.length).fill(0), labels: years.map(String), years }
  }
  const earliest = earliestDateStr
    ? parseISO(earliestDateStr).getFullYear()
    : transactions.reduce((min, tx) => {
        const y = parseISO(tx.date).getFullYear(); return y < min ? y : min
      }, currYear - 1)
  // Extends into the future only far enough to reach MIN_YEAR_SLOTS total —
  // an account with more real history than that already fills the chart
  // on its own, so nothing past currYear gets added.
  const endYear = Math.max(currYear, earliest + MIN_YEAR_SLOTS - 1)
  const years   = Array.from({ length: endYear - earliest + 1 }, (_, i) => earliest + i)
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

// Monthly data from first transaction month to now — used for "All Time"
// while the user's history is still short, since yearly bars would be too
// coarse to be useful that early on. getLifetimeYearly takes over once
// there's enough history (see SummaryCard's LIFETIME_YEARLY_THRESHOLD).
// `earliestDateStr` — see the matching comment on getLifetimeYearly above.
export function getLifetimeMonthly(transactions, earliestDateStr) {
  const now = new Date()
  const currYear = now.getFullYear()
  const currMonth = now.getMonth()
  if (!transactions.length) {
    const prevMonth = currMonth === 0 ? 11 : currMonth - 1
    const prevYear = currMonth === 0 ? currYear - 1 : currYear
    return {
      income: [0, 0], expense: [0, 0],
      labels: [`${MONTHS[prevMonth]} ${String(prevYear).slice(2)}`, `${MONTHS[currMonth]} ${String(currYear).slice(2)}`],
      months: [{ year: prevYear, month: prevMonth }, { year: currYear, month: currMonth }],
    }
  }
  const earliest = earliestDateStr
    ? parseISO(earliestDateStr)
    : transactions.reduce((min, tx) => {
        const d = parseISO(tx.date); return d < min ? d : min
      }, now)
  const startYear  = earliest.getFullYear()
  const startMonth = earliest.getMonth()
  const totalMonths = (currYear - startYear) * 12 + (currMonth - startMonth) + 1
  const income  = new Array(totalMonths).fill(0)
  const expense = new Array(totalMonths).fill(0)
  // Parallel to labels — the actual {year, month} each bar represents, so
  // callers can filter/select by real calendar date instead of array index.
  const months  = Array.from({ length: totalMonths }, (_, i) => ({
    year: startYear + Math.floor((startMonth + i) / 12),
    month: (startMonth + i) % 12,
  }))
  const labels  = months.map(({ year, month }) => `${MONTHS[month]} ${String(year).slice(2)}`)
  transactions.forEach(tx => {
    const d = parseISO(tx.date)
    const idx = (d.getFullYear() - startYear) * 12 + (d.getMonth() - startMonth)
    if (idx >= 0 && idx < totalMonths) {
      if (tx.type === 'income') income[idx] += tx.amount
      else expense[idx] += tx.amount
    }
  })
  return { income, expense, labels, months }
}
