import { reportError } from './errors'
// ============================================================================
// Okana's insight engine
// ============================================================================
//
// Turns one user's recorded data into a short, true observation about their own
// money — "You spent 18% more than last month so far" — and picks one for today.
//
// WHAT IT IS
//   Rule-based, deterministic and offline. No server, no AI, no randomness: the
//   same data on the same day always gives the same answer, which is also what
//   makes it testable. Plain functions only; nothing in here touches React,
//   storage or the network.
//
// WHAT IT ISN'T
//   Not advice. Every insight is an OBSERVATION the numbers prove ("Saturdays are
//   your heaviest day"), never an instruction ("you should spend less"). If a
//   sentence can't be proved from the user's own data, it doesn't belong here.
//   The app has no categories and no recurring items, so every rule works from
//   amount, date, type and description alone. Do not add rules that need either.
//
// THREE LAYERS
//   1. computeFacts()   the data, turned into plain numbers, once.
//   2. RULES            one small object per kind of observation. A rule stays
//                       silent unless it has something true AND meaningful to say.
//   3. pickInsight()    runs the rules, drops the weak, ranks the rest, and picks
//                       one for today, remembering what it showed recently.
//
// INPUT
//   transactions  [{ type: 'expense' | 'income', amount, date: 'YYYY-MM-DD', description }]
//   budget        { amount: number | null }  — this month's budget, if one is set
//   goals         the derived goals from useSavings: savings goals and loans, with
//                 { kind: 'savings' | 'debt', name, target, saved, percent,
//                   debtType, emisPaid, tenureMonths, completedAt }
//   now           a Date (defaults to the current time) — injected so tests can
//                 pin "today"
//
// OUTPUT of an insight
//   { id, score, text, evidence }
//   `text` is the sentence to show. `evidence` is the numbers behind it, kept for
//   tests and for any future "why am I seeing this?" affordance.
//
// HOW TO ADD A RULE
//   Add an object to RULES below with a unique id and a build(facts) that returns
//   null (nothing to say) or { score, variants, evidence }. Give it a MIN_* gate so
//   a new user never sees a nonsense line, a significance threshold so noise is
//   ignored, and two or three phrasings (`variants`) so it doesn't read the same
//   every time. Then add a test with a made-up month that fires it and one that
//   doesn't.
//
// VOICE
//   Calm and neutral. Notice a change, don't scold it: "more", not "too much".
//   Short — one sentence. Amounts in rupees, grouped the Indian way.
//
// THE INSIGHTS (45). The id is the rule's name here and in the selector's memory.
// Each rule below has its own comment saying what it observes and when it fires.
//
//   Spending
//     month_vs_last       this month against last, to the same day
//     record_month        last month was the costliest or cheapest yet
//     biggest_expense     the largest single purchase this month
//     weekday_pattern     the weekday money goes fastest
//     payday_effect       how much is spent in the week after salary
//     no_spend_days       days with nothing spent
//     week_vs_last        the last 7 days against the 7 before
//     biggest_day         the heaviest day of the month so far
//     year_vs_last_year   this month against the same month a year ago
//     average_day         what a day costs on average
//   Budget and forecast
//     budget_pace         the budget against the calendar
//     month_forecast      where the month ends at this pace
//     set_budget          a new month with no budget set
//   Salary and income
//     kept_share          the share of the year's income kept
//     saving_rate         the share of this month's income kept
//     income_change       income against the month before
//   Savings
//     goal_progress       a goal that is well under way
//     goal_pace           when a goal finishes at the current pace
//     goal_almost         a goal within a tenth of done
//     goal_milestone      a goal that just passed 25, 50 or 75%
//     deposit_missed      a goal that was fed monthly, and wasn't this month
//     savings_withdrawal  money taken out of savings
//     goal_idle           a goal with no deposit for two months
//     goal_whatif         what a little more a month would save
//     saving_streak       months in a row with a deposit
//     total_saved         everything saved so far
//     emergency_cover     how many months the savings would last
//   Debt
//     debt_progress       EMIs paid so far
//     debt_clear_first    which of several loans to finish first
//     loan_cost           what a loan costs beyond what was borrowed
//     emi_soon            an EMI about to fall due
//     debt_load           the share of income that goes to EMIs
//     debt_free_date      when the last loan ends
//     emi_freed           an EMI about to free up
//   Milestones
//     entries_milestone   a round number of entries logged
//     tracking_days       how long the user has been tracking
//     saved_milestone     savings that just passed a round amount
//   Calendar and general facts (no personal data; the last three sit at the score floor)
//     sunday_check        a look at the week, on Sundays
//     new_financial_year  April
//     financial_year_end  the run-up to 31 March
//     festival_season     early October to mid-November
//     subscription_check  the start of each quarter
//     health_insurance    plain fact
//     term_insurance      plain fact
//     card_interest       plain fact
// ============================================================================

// ---------------------------------------------------------------------------
// Thresholds. Every number a rule gates on lives here, so tuning the engine's
// taste never means hunting through rule bodies.
// ---------------------------------------------------------------------------
export const T = {
  // How much a month must have changed against the other before it is worth
  // saying. Below this it is normal wobble.
  MONTH_CHANGE_PCT: 10,
  // Don't compare a month against one that spent less than this — a percentage
  // of almost nothing is meaningless.
  MONTH_COMPARE_MIN_BASE: 1000,
  // "to date" comparisons need at least this many days of the month behind them.
  TO_DATE_MIN_DAY: 7,
  // Biggest / lowest month need at least this many completed months to be a claim.
  RECORD_MIN_MONTHS: 3,
  // The biggest single expense must be at least this share of the month's spend
  // to be worth naming, and the month needs at least this many expenses.
  BIGGEST_EXPENSE_MIN_SHARE: 0.15,
  BIGGEST_EXPENSE_MIN_COUNT: 5,
  // Weekday pattern: needs this many weeks of history, and the heaviest weekday's
  // average must beat the average of the other days by this factor.
  WEEKDAY_MIN_WEEKS: 6,
  WEEKDAY_WINDOW_WEEKS: 12,
  WEEKDAY_MIN_RATIO: 1.5,
  // Budget pace: how many percentage points ahead of (or behind) the calendar the
  // budget has to be before it's worth mentioning, and how far into the month.
  BUDGET_MIN_DAY: 5,
  BUDGET_AHEAD_POINTS: 15,
  BUDGET_BEHIND_POINTS: 20,
  // Payday effect: the share of the month's spend that lands in the 7 days after
  // the biggest income of the month.
  PAYDAY_WINDOW_DAYS: 7,
  PAYDAY_MIN_SHARE: 0.4,
  PAYDAY_MIN_SPEND: 3000,
  // No-spend days: needs this many days gone, and this many empty ones.
  NO_SPEND_MIN_DAY: 10,
  NO_SPEND_MIN_DAYS: 3,
  // Share of income kept: needs this many completed months of the year.
  KEPT_MIN_MONTHS: 2,
  KEPT_MIN_POINTS: 5,
  // Goals and loans.
  GOAL_MIN_PERCENT: 25,
  // Goal pace: the pace is read from the last PACE_WINDOW_DAYS days of contributions,
  // needs money put in during at least PACE_MIN_MONTHS different calendar months (so
  // one lump sum is never mistaken for a habit), and is not stated if finishing would
  // take more than PACE_MAX_MONTHS_AWAY months.
  PACE_WINDOW_DAYS: 90,
  PACE_MIN_MONTHS: 2,
  PACE_MAX_MONTHS_AWAY: 60,
  // Emergency cover: months of spending the user's savings would last. Speaks up while
  // it is below this many, and names a target range of EMERGENCY_TARGET_MONTHS.
  EMERGENCY_MIN_MONTHS: 3,
  EMERGENCY_TARGET_MONTHS: [3, 6],
  // A loan is worth saying costs more than was borrowed once the extra is at least
  // this share of what was borrowed.
  LOAN_EXTRA_MIN_SHARE: 0.05,
  // The last-7-days comparison needs this many days with something logged in each week.
  WEEK_MIN_LOGGED_DAYS: 4,
  WEEK_CHANGE_PCT: 10,
  WEEK_MIN_BASE: 1000,
  // The month-end forecast: from this day of the month, until this many days remain.
  FORECAST_MIN_DAY: 7,
  FORECAST_MIN_DAYS_LEFT: 2,
  // A "small spend" is at most this much (rupees); worth saying once there are this many
  // and they make up this share of the month's spending.
  // Savings rate this month: needs this far into the month.
  SAVING_RATE_MIN_DAY: 10,
  // EMIs against income: worth saying from this share of the year's average income.
  DEBT_LOAD_MIN_PCT: 20,
  // An EMI coming up within this many days.
  EMI_SOON_DAYS: 5,
  // A goal this close to done (share of the target left), and the milestones it can cross.
  GOAL_ALMOST_LEFT_SHARE: 0.1,
  GOAL_MILESTONES: [25, 50, 75],
  MILESTONE_WINDOW_DAYS: 7,
  // How long it has been since a deposit to a goal that was getting one every month.
  DEPOSIT_MISSED_MIN_DAY: 12,
  // Income now against the month before: the change worth saying.
  INCOME_CHANGE_PCT: 8,
  // Money taken out of savings this month, at least this much, is worth saying.
  WITHDRAWAL_MIN: 1000,
  // A savings goal with no deposit for this many days has gone quiet.
  GOAL_IDLE_DAYS: 60,
  // A saving streak is worth saying from this many months in a row.
  SAVING_STREAK_MIN: 3,
  // Total saved is a milestone from this amount.
  TOTAL_SAVED_MIN: 10000,
  // A loan that frees up its EMI within this many months.
  EMI_FREED_MAX_MONTHS: 6,
  // Heaviest day: from this day of the month, when it is at least this many times a
  // usual spending day and at least this much.
  BIGGEST_DAY_MIN_DAY: 10,
  BIGGEST_DAY_RATIO: 1.8,
  BIGGEST_DAY_MIN: 1000,
  // This month against the same month a year ago.
  YEAR_CHANGE_PCT: 10,
  // Entry-count milestones, tracking-length milestones (days), and amounts saved. Each is
  // said only for MILESTONE_WINDOW_DAYS after it is reached, so it never goes stale.
  ENTRY_MILESTONES: [50, 100, 250, 500, 1000, 2500, 5000],
  TRACKING_MILESTONES: [30, 100, 180, 365, 730, 1095],
  SAVED_MILESTONES: [10000, 25000, 50000, 100000, 250000, 500000, 1000000],
  SAVED_WINDOW_DAYS: 14,
  // The financial year ends on 31 March; the reminder starts this many days before.
  FY_REMINDER_DAYS: 60,
  // How long an insight rests after being shown before it may come back.
  COOLDOWN_DAYS: 7,
  // Data confidence. The engine can only see what was logged, and someone who logs
  // now and then looks the same as someone who spends now and then. So a month is
  // only compared once it holds at least this many distinct days with a transaction
  // (a part-month, compared to date, needs fewer), and below that the engine stays
  // quiet rather than draw a conclusion from gaps.
  MIN_LOGGED_DAYS_FULL: 8,
  MIN_LOGGED_DAYS_TO_DATE: 5,
  // The lowest score worth showing. Below it the engine says nothing: no insight is
  // better than a filler one, and daily rotation must never promote a weak one.
  MIN_SHOW_SCORE: 45,
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st
const ordinal = (n) => {
  const t = n % 100
  if (t >= 11 && t <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
}

const pad = (n) => String(n).padStart(2, '0')
const monthKey = (year, month) => `${year}-${pad(month + 1)}` // month is 0-based
const keyOf = (dateStr) => dateStr.slice(0, 7)
const keyToIndex = (key) => Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1)
const indexToKey = (idx) => monthKey(Math.floor(idx / 12), idx % 12)
const monthNameOf = (key) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const dayOf = (dateStr) => Number(dateStr.slice(8, 10))
// Local calendar date, never UTC (see utils/format.js's toDateStr for why).
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// A 'YYYY-MM-DD' string as a local-midnight Date, avoiding the UTC-parse trap.
const dateFromStr = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
const pctChange = (cur, prev) => Math.round(((cur - prev) / prev) * 100)

// Whole days since a fixed point, in LOCAL time — what "today" means for rotation.
export function dayNumber(now = new Date()) {
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000)
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0)

// The user's first name goes into a line only when that line is a moment worth speaking
// to them about: good news, a goal close to done, a budget that's been passed. `when`
// says whether this one is; if not, or if there's no name, the plain sentence is used.
// A routine observation never gets a name.
const withName = (f, when, plain, named) => (f.name && when ? [`${f.name}, ${named}`] : [plain])

// ===========================================================================
// LAYER 1 — FACTS
// ===========================================================================
// Everything the rules need, computed once from the raw data. Rules read facts and
// never touch transactions directly, so a number is worked out in exactly one
// place.
export function computeFacts({ transactions = [], budget = null, goals = [], name = '', now = new Date() } = {}) {
  const todayStr = toDateStr(now)
  const year = now.getFullYear()
  const month = now.getMonth()
  const curKey = monthKey(year, month)
  const curIdx = keyToIndex(curKey)
  const dayOfMonth = now.getDate()
  const monthLength = daysInMonth(year, month)

  const expenses = transactions.filter(t => t.type === 'expense' && t.amount > 0 && t.date <= todayStr)
  const incomes = transactions.filter(t => t.type === 'income' && t.amount > 0 && t.date <= todayStr)

  // Per-month totals, keyed 'YYYY-MM'.
  const spendByMonth = {}
  const incomeByMonth = {}
  const countByMonth = {}
  for (const t of expenses) {
    const k = keyOf(t.date)
    spendByMonth[k] = (spendByMonth[k] || 0) + t.amount
    countByMonth[k] = (countByMonth[k] || 0) + 1
  }
  for (const t of incomes) {
    const k = keyOf(t.date)
    incomeByMonth[k] = (incomeByMonth[k] || 0) + t.amount
  }

  // The first month the user has any activity in, and the completed months since:
  // a month counts only once it is over, so a half-finished one never skews an
  // average or a record.
  const allKeys = [...new Set([...Object.keys(spendByMonth), ...Object.keys(incomeByMonth)])].sort()
  const firstIdx = allKeys.length ? keyToIndex(allKeys[0]) : null
  const completedKeys = []
  if (firstIdx != null) {
    for (let i = firstIdx; i < curIdx; i++) completedKeys.push(indexToKey(i))
  }
  const lastKey = completedKeys.length ? completedKeys[completedKeys.length - 1] : null
  const priorKey = completedKeys.length > 1 ? completedKeys[completedKeys.length - 2] : null

  const spendIn = (k) => spendByMonth[k] || 0
  const spendThisMonth = spendIn(curKey)

  // Distinct days with any transaction, per month — how much of each month the user
  // actually logged. `upTo` limits it to days 1..upTo for to-date comparisons.
  const loggedDays = (k, upTo = 31) =>
    new Set(transactions.filter(t => t.date <= todayStr && keyOf(t.date) === k && dayOf(t.date) <= upTo).map(t => t.date)).size

  // Spend on days 1..day of a given month — the fair comparison for a month that
  // is still in progress.
  const spendToDay = (k, day) =>
    sum(expenses.filter(t => keyOf(t.date) === k && dayOf(t.date) <= day).map(t => t.amount))
  const prevOfCurKey = indexToKey(curIdx - 1)

  // How to compare this month against the last one. Early in the month there is
  // too little of it to compare with a whole month, so fall back to the last two
  // completed months.
  let compare = null
  if (
    dayOfMonth >= T.TO_DATE_MIN_DAY && completedKeys.includes(prevOfCurKey) &&
    loggedDays(curKey) >= T.MIN_LOGGED_DAYS_TO_DATE && loggedDays(prevOfCurKey, dayOfMonth) >= T.MIN_LOGGED_DAYS_TO_DATE
  ) {
    compare = {
      kind: 'to-date',
      cur: spendThisMonth,
      prev: spendToDay(prevOfCurKey, dayOfMonth),
      curLabel: monthNameOf(curKey),
      prevLabel: monthNameOf(prevOfCurKey),
    }
  } else if (lastKey && priorKey && loggedDays(lastKey) >= T.MIN_LOGGED_DAYS_FULL && loggedDays(priorKey) >= T.MIN_LOGGED_DAYS_FULL) {
    compare = {
      kind: 'full',
      cur: spendIn(lastKey),
      prev: spendIn(priorKey),
      curLabel: monthNameOf(lastKey),
      prevLabel: monthNameOf(priorKey),
    }
  }

  // This month's expenses, for the "biggest", "repeat" and "no-spend" rules.
  const monthExpenses = expenses.filter(t => keyOf(t.date) === curKey)
  let biggestExpense = null
  for (const t of monthExpenses) if (!biggestExpense || t.amount > biggestExpense.amount) biggestExpense = t

  // Days this month with no spending, counting from the first day the user had any
  // activity in the month so a mid-month signup isn't given blank days.
  const spendDays = new Set(monthExpenses.map(t => t.date))
  const firstActivityThisMonth = [...monthExpenses, ...incomes.filter(t => keyOf(t.date) === curKey)]
    .map(t => dayOf(t.date)).sort((a, b) => a - b)[0] ?? null
  let noSpendDays = 0
  if (firstActivityThisMonth != null) {
    for (let d = firstActivityThisMonth; d <= dayOfMonth; d++) {
      if (!spendDays.has(`${curKey}-${pad(d)}`)) noSpendDays++
    }
  }

  // Weekday pattern over the last N weeks: the user's total on each weekday, and
  // how many of each weekday the window held. History length is measured from the
  // first transaction so a new account can't produce a "pattern".
  const earliest = allKeys.length
    ? [...transactions].map(t => t.date).filter(d => d <= todayStr).sort()[0]
    : null
  const historyDays = earliest ? Math.floor((dateFromStr(todayStr) - dateFromStr(earliest)) / 86400000) + 1 : 0
  const windowDays = T.WEEKDAY_WINDOW_WEEKS * 7
  const windowStart = new Date(dateFromStr(todayStr).getTime() - (windowDays - 1) * 86400000)
  const windowStartStr = toDateStr(windowStart)
  // A day's total is capped at the 90th-percentile day, so one big purchase (a phone,
  // a bike) can't make its weekday look like a habit. The cap only applies with
  // enough spending days to know what a normal one is.
  const dayTotals = {}
  for (const t of expenses) if (t.date >= windowStartStr) dayTotals[t.date] = (dayTotals[t.date] || 0) + t.amount
  const dayValues = Object.values(dayTotals).sort((a, b) => a - b)
  const dayCap = dayValues.length >= 10 ? dayValues[Math.floor(0.9 * (dayValues.length - 1))] : Infinity
  const weekdayTotals = new Array(7).fill(0)
  for (const [date, total] of Object.entries(dayTotals)) weekdayTotals[dateFromStr(date).getDay()] += Math.min(total, dayCap)
  const weekdayCounts = new Array(7).fill(0)
  for (let i = 0; i < Math.min(windowDays, historyDays); i++) {
    weekdayCounts[new Date(dateFromStr(todayStr).getTime() - i * 86400000).getDay()]++
  }
  const weekdayAverages = weekdayTotals.map((tot, i) => (weekdayCounts[i] ? tot / weekdayCounts[i] : 0))

  // Payday effect: the biggest income this month, and how much of the month's
  // spend landed in the week that followed it.
  const monthIncomes = incomes.filter(t => keyOf(t.date) === curKey)
  let payday = null
  for (const t of monthIncomes) if (!payday || t.amount > payday.amount) payday = t
  let paydayWeekSpend = 0
  if (payday) {
    const start = dayOf(payday.date)
    paydayWeekSpend = sum(monthExpenses.filter(t => dayOf(t.date) >= start && dayOf(t.date) < start + T.PAYDAY_WINDOW_DAYS).map(t => t.amount))
  }

  // Budget pace: how much of the budget is used against how much of the month has
  // gone. Only with a budget set.
  const budgetAmount = budget && budget.amount > 0 ? budget.amount : null
  const budgetUsedPct = budgetAmount ? Math.round((spendThisMonth / budgetAmount) * 100) : null
  const monthElapsedPct = Math.round((dayOfMonth / monthLength) * 100)

  // This year's completed months: income, spend, and the share of income kept.
  const yearCompleted = completedKeys.filter(k => k.startsWith(String(year)))
  // An unlogged paycheque looks the same as no paycheque, so a "kept" share is only
  // trusted when every completed month of the year has income in it.
  const yearIncomeComplete = yearCompleted.length > 0 && yearCompleted.every(k => (incomeByMonth[k] || 0) > 0)
  const yearIncome = sum(yearCompleted.map(k => incomeByMonth[k] || 0))
  const yearSpend = sum(yearCompleted.map(k => spendByMonth[k] || 0))
  const keptPct = yearIncome > 0 ? Math.round(((yearIncome - yearSpend) / yearIncome) * 100) : null

  // This year's monthly averages, for the Summary page: the average over this year's
  // completed months that actually have spending (or income) logged in them, so a
  // month with nothing logged doesn't drag a figure down. Null until a month has one.
  const avgOver = (keys, by) => {
    const vals = keys.map(k => by[k] || 0).filter(v => v > 0)
    return vals.length ? sum(vals) / vals.length : null
  }
  const yearAvgSpend = avgOver(yearCompleted, spendByMonth)
  const yearAvgIncome = avgOver(yearCompleted, incomeByMonth)

  // Record months: the last completed month against every other completed month.
  const completedSpend = completedKeys
    .filter(k => loggedDays(k) >= T.MIN_LOGGED_DAYS_FULL)
    .map(k => ({ key: k, spend: spendIn(k) }))
  const lastWellLogged = !!lastKey && completedSpend.some(m => m.key === lastKey)
  const lastSpend = lastWellLogged ? spendIn(lastKey) : null
  const maxOthers = completedSpend.filter(m => m.key !== lastKey).reduce((a, m) => Math.max(a, m.spend), 0)
  const minOthers = completedSpend.filter(m => m.key !== lastKey).reduce((a, m) => Math.min(a, m.spend), Infinity)

  // Goal pace. For each savings goal, and each loan with no fixed schedule, how much
  // is actually being put in per month lately, and how long what's left would take at
  // that pace. A loan on an EMI schedule is skipped: its end date is already known.
  const paceWindowStart = toDateStr(new Date(dateFromStr(todayStr).getTime() - (T.PACE_WINDOW_DAYS - 1) * 86400000))
  const goalPaces = []
  for (const g of goals || []) {
    const isDebt = g.kind === 'debt'
    if (g.completedAt || g.reached || !(g.remaining > 0)) continue
    if (isDebt && g.debtType === 'emi') continue
    const recent = (g.entries || []).filter(e => e.date >= paceWindowStart && e.date <= todayStr)
    const net = sum(recent.map(e => (e.type === 'add' ? e.amount : -e.amount)))
    const monthsWithMoneyIn = new Set(recent.filter(e => e.type === 'add').map(e => keyOf(e.date))).size
    if (net <= 0 || monthsWithMoneyIn < T.PACE_MIN_MONTHS) continue
    const perMonth = net / (T.PACE_WINDOW_DAYS / 30)
    goalPaces.push({ name: g.name, isDebt, perMonth, monthsLeft: Math.ceil(g.remaining / perMonth), remaining: g.remaining })
  }

  // Recent days, for the daily rules. `dayStr(n)` is n days before today.
  const dayStr = (n) => toDateStr(new Date(dateFromStr(todayStr).getTime() - n * 86400000))
  const spendBetween = (a, b) => sum(expenses.filter(t => t.date >= a && t.date <= b).map(t => t.amount))
  const daysLoggedBetween = (a, b) => new Set(transactions.filter(t => t.date >= a && t.date <= b).map(t => t.date)).size
  const weekSpend = spendBetween(dayStr(6), todayStr)
  const weekPrevSpend = spendBetween(dayStr(13), dayStr(7))
  const weekLogged = daysLoggedBetween(dayStr(6), todayStr)
  const weekPrevLogged = daysLoggedBetween(dayStr(13), dayStr(7))

  const incomeThisMonth = sum(monthIncomes.map(t => t.amount))
  // Where the month would end if the days so far were typical.
  const projectedSpend = dayOfMonth >= T.FORECAST_MIN_DAY && loggedDays(curKey) >= T.MIN_LOGGED_DAYS_TO_DATE
    ? (spendThisMonth / dayOfMonth) * monthLength
    : null
  // Income against the month before, and what was left over, for the salary rules.
  const incomeLast = lastKey ? incomeByMonth[lastKey] || 0 : 0
  const incomePrior = priorKey ? incomeByMonth[priorKey] || 0 : 0
  const priorWellLogged = !!priorKey && loggedDays(priorKey) >= T.MIN_LOGGED_DAYS_FULL
  const savingsGoals = (goals || []).filter(g => g.kind !== 'debt')
  const depositMonths = new Set()
  let withdrawnThisMonth = 0
  let withdrawalCount = 0
  let addedThisYear = 0
  for (const g of savingsGoals) {
    for (const e of g.entries || []) {
      if (e.date > todayStr) continue
      if (e.type === 'add') {
        depositMonths.add(keyOf(e.date))
        if (e.date.startsWith(String(year))) addedThisYear += e.amount
      } else {
        if (keyOf(e.date) === curKey) { withdrawnThisMonth += e.amount; withdrawalCount++ }
        if (e.date.startsWith(String(year))) addedThisYear -= e.amount
      }
    }
  }
  // Months in a row, ending now, in which any savings goal got a deposit. This month
  // counts if it already has one; otherwise the run ends with last month.
  let savingStreak = 0
  for (let i = depositMonths.has(curKey) ? curIdx : curIdx - 1; depositMonths.has(indexToKey(i)); i--) savingStreak++
  const streakStartKey = savingStreak ? indexToKey((depositMonths.has(curKey) ? curIdx : curIdx - 1) - savingStreak + 1) : null

  // Patterns across days, weeks and years, for the spending-pattern rules.
  const monthDayTotals = {}
  for (const t of monthExpenses) monthDayTotals[t.date] = (monthDayTotals[t.date] || 0) + t.amount
  const monthDayEntries = Object.entries(monthDayTotals)
  const biggestDay = monthDayEntries.length
    ? monthDayEntries.reduce((best, [date, total]) => (!best || total > best.total ? { date, total } : best), null)
    : null
  const spendingDayAvg = monthDayEntries.length ? spendThisMonth / monthDayEntries.length : null
  const spendingDays = monthDayEntries.length

  // The same month a year ago, to the same day.
  const yearAgoKey = monthKey(year - 1, month)
  const yearAgoToDate = spendToDay(yearAgoKey, dayOfMonth)
  const yearAgoLogged = loggedDays(yearAgoKey, dayOfMonth)

  // An average day, this month and last.
  const avgDaySpend = dayOfMonth >= 5 ? spendThisMonth / dayOfMonth : null
  const lastAvgDaySpend = lastWellLogged && lastKey ? spendIn(lastKey) / daysInMonth(Number(lastKey.slice(0, 4)), Number(lastKey.slice(5, 7)) - 1) : null

  // Milestones: how much has been logged, for how long, and what's been saved lately.
  const totalEntries = expenses.length + incomes.length
  const entriesBeforeWindow = expenses.filter(t => t.date <= dayStr(T.MILESTONE_WINDOW_DAYS)).length + incomes.filter(t => t.date <= dayStr(T.MILESTONE_WINDOW_DAYS)).length
  const daysSinceFirst = historyDays > 0 ? historyDays - 1 : 0
  const savedWindowStart = dayStr(T.SAVED_WINDOW_DAYS)
  const savedRecentNet = sum(savingsGoals.flatMap(g => (g.entries || []).filter(e => e.date >= savedWindowStart && e.date <= todayStr).map(e => (e.type === 'add' ? e.amount : -e.amount))))

  // What the user's savings could cover, and their loans still being paid, for the
  // emergency-cover and debt rules. Spending is the year's monthly average, or failing
  // that the last well-logged month, so one odd month doesn't set the target.
  const monthlySpend = yearAvgSpend ?? lastSpend
  const savedTotal = sum((goals || []).filter(g => g.kind !== 'debt').map(g => g.saved || 0))
  const openDebts = (goals || []).filter(g => g.kind === 'debt' && !g.completedAt && !g.reached && g.remaining > 0)
  const monthlyEmi = sum(openDebts.filter(g => g.debtType === 'emi' && g.emiAmount > 0).map(g => g.emiAmount))

  return {
    name: String(name || '').trim().split(/\s+/)[0],
    now, todayStr, year, month, dayOfMonth, monthLength, curKey,
    spendThisMonth, countThisMonth: countByMonth[curKey] || 0,
    completedKeys, lastKey, priorKey, lastSpend, maxOthers, minOthers, wellLoggedMonths: completedSpend.length,
    compare,
    biggestExpense, noSpendDays,
    historyDays, weekdayAverages, weekdayCounts,
    payday, paydayWeekSpend,
    budgetAmount, budgetUsedPct, monthElapsedPct,
    yearCompletedCount: yearCompleted.length, yearIncomeComplete, yearAvgSpend, yearAvgIncome, yearIncome, yearSpend, keptPct,
    goals: goals || [],
    goalPaces, monthlySpend, savedTotal, openDebts, monthlyEmi,
    weekSpend, weekPrevSpend, weekLogged, weekPrevLogged,
    incomeThisMonth, projectedSpend,
    incomeLast, incomePrior, priorWellLogged, lastWellLogged, priorKey,
    withdrawnThisMonth, withdrawalCount, addedThisYear, savingStreak, streakStartKey,
    biggestDay, spendingDayAvg, spendingDays,
    yearAgoKey, yearAgoToDate, yearAgoLogged,
    avgDaySpend, lastAvgDaySpend,
    totalEntries, entriesBeforeWindow, daysSinceFirst, firstDate: earliest, savedRecentNet,
  }
}

// ===========================================================================
// LAYER 2 — RULES
// ===========================================================================
// Each rule: { id, cooldown?, build(facts) -> null | { score, variants, evidence } }
//   id        stable name; the selector remembers it, so never rename one lightly
//   score     0-100, how worth saying this is right now. Roughly: 80+ is notable,
//             50-80 is interesting, below 40 is filler. Scores let a surprising
//             fact beat a mild one on the same day.
//   variants  two or three phrasings of the same fact; one is chosen by the day
//   evidence  the numbers behind it
//
// Order below is just the order they were written, not priority — score decides.
export const RULES = [
  // -------------------------------------------------------------------------
  // 1. month_vs_last — spending against the last month.
  //    Observes: this month so far vs the same days last month (once a week of the
  //    month has passed), or the last full month vs the one before it (early in a
  //    month, when there is too little of this one).
  //    Fires: the change is at least MONTH_CHANGE_PCT and the base isn't tiny.
  //    Why to-date: comparing a half month against a whole one would say "you spent
  //    far less" every day until the 30th, which is never true.
  // -------------------------------------------------------------------------
  {
    id: 'month_vs_last',
    build(f) {
      const c = f.compare
      if (!c || c.prev < T.MONTH_COMPARE_MIN_BASE) return null
      const pct = pctChange(c.cur, c.prev)
      if (Math.abs(pct) < T.MONTH_CHANGE_PCT) return null
      const more = pct > 0
      const abs = Math.abs(pct)
      const title = `${abs}% ${more ? 'more' : 'less'} than ${c.prevLabel}`
      const variants = withName(f, !more && abs >= 20, title, title)
      const description = c.kind === 'to-date'
        ? `You've spent ${money(c.cur)} so far this month. By this day in ${c.prevLabel}, it was ${money(c.prev)}.`
        : `${c.curLabel} came to ${money(c.cur)}. ${c.prevLabel} was ${money(c.prev)}.`
      return { score: Math.min(90, 55 + abs / 2), variants, description, quoteKey: more ? 'month_more' : 'month_less', evidence: { ...c, pct } }
    },
  },

  // -------------------------------------------------------------------------
  // 2. record_month — the last completed month was the biggest or smallest yet.
  //    Observes: last month's spend against every earlier completed month.
  //    Fires: at least RECORD_MIN_MONTHS completed months, and last month beat all
  //    of them. Needs real history before calling anything a "record".
  // -------------------------------------------------------------------------
  {
    id: 'record_month',
    build(f) {
      if (f.wellLoggedMonths < T.RECORD_MIN_MONTHS || f.lastSpend == null) return null
      const name = monthNameOf(f.lastKey)
      if (f.lastSpend > f.maxOthers && f.maxOthers > 0) {
        return {
          score: 78,
          variants: ['Your costliest month yet'],
          description: `${name} came to ${money(f.lastSpend)}. Your highest before was ${money(f.maxOthers)}.`,
          quoteKey: 'record_high',
          evidence: { month: f.lastKey, spend: f.lastSpend, kind: 'highest' },
        }
      }
      if (f.lastSpend < f.minOthers && f.lastSpend > 0) {
        return {
          score: 72,
          variants: withName(f, true, 'Your cheapest month yet', 'your cheapest month yet'),
          description: `${name} came to ${money(f.lastSpend)}. Your lowest before was ${money(f.minOthers)}.`,
          quoteKey: 'record_low',
          evidence: { month: f.lastKey, spend: f.lastSpend, kind: 'lowest' },
        }
      }
      return null
    },
  },

  // -------------------------------------------------------------------------
  // 3. biggest_expense — the single largest expense this month.
  //    Observes: the top transaction of the month, by amount.
  //    Fires: the month has at least BIGGEST_EXPENSE_MIN_COUNT expenses and that one
  //    is at least BIGGEST_EXPENSE_MIN_SHARE of the month's spend, so it genuinely
  //    stands out. Uses the user's own description as the name.
  // -------------------------------------------------------------------------
  {
    id: 'biggest_expense',
    build(f) {
      const b = f.biggestExpense
      if (!b || f.countThisMonth < T.BIGGEST_EXPENSE_MIN_COUNT || f.spendThisMonth <= 0) return null
      const share = b.amount / f.spendThisMonth
      if (share < T.BIGGEST_EXPENSE_MIN_SHARE) return null
      const name = (b.description || '').trim() || 'one expense'
      return {
        score: 45 + Math.min(35, share * 60),
        variants: [`Biggest spend: ${name}`],
        description: `You spent ${money(b.amount)} on it. That's ${Math.round(share * 100)}% of everything you spent this month.`,
        evidence: { description: name, amount: b.amount, share: Math.round(share * 100) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 5. weekday_pattern — the day of the week money goes fastest.
  //    Observes: average spend per weekday over the last WEEKDAY_WINDOW_WEEKS weeks.
  //    Fires: at least WEEKDAY_MIN_WEEKS weeks of history, and the heaviest
  //    weekday's average is at least WEEKDAY_MIN_RATIO times the average of the
  //    other six. Averages (not totals) so a weekday that simply occurred more
  //    often in the window isn't favoured. Each day's total is capped at the
  //    90th-percentile day first (see computeFacts), so a single large purchase
  //    can't pass itself off as a weekday habit.
  // -------------------------------------------------------------------------
  {
    id: 'weekday_pattern',
    build(f) {
      if (f.historyDays < T.WEEKDAY_MIN_WEEKS * 7) return null
      const avgs = f.weekdayAverages
      let top = 0
      for (let i = 1; i < 7; i++) if (avgs[i] > avgs[top]) top = i
      const others = avgs.filter((_, i) => i !== top)
      const otherAvg = sum(others) / others.length
      if (avgs[top] <= 0 || otherAvg <= 0) return null
      const ratio = avgs[top] / otherAvg
      if (ratio < T.WEEKDAY_MIN_RATIO) return null
      return {
        score: 48 + Math.min(25, (ratio - T.WEEKDAY_MIN_RATIO) * 20),
        variants: [`You spend most on ${WEEKDAY_NAMES[top]}`],
        description: `On a usual ${WEEKDAY_NAMES[top].slice(0, -1)}, about ${money(avgs[top])} goes out. That's more than any other day.`,
        evidence: { weekday: top, average: avgs[top], ratio: Math.round(ratio * 10) / 10 },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 6. budget_pace — the budget against the calendar.
  //    Observes: percent of the budget used vs percent of the month gone.
  //    Fires (ahead): used is at least BUDGET_AHEAD_POINTS points beyond the calendar
  //    — and a budget already passed is the strongest version of it.
  //    Fires (behind): used is at least BUDGET_BEHIND_POINTS points under the calendar
  //    — said kindly, as room, not as a reward.
  //    Only with a budget set, and not in the first BUDGET_MIN_DAY days.
  // -------------------------------------------------------------------------
  {
    id: 'budget_pace',
    build(f) {
      if (f.budgetUsedPct == null || f.dayOfMonth < T.BUDGET_MIN_DAY) return null
      const used = f.budgetUsedPct
      const gone = f.monthElapsedPct
      if (used >= 100) {
        return {
          score: 92,
          variants: withName(f, true, 'Budget is over', 'budget is over'),
          description: `You've spent ${money(f.spendThisMonth)} of your ${money(f.budgetAmount)} budget${f.monthLength - f.dayOfMonth > 0 ? `, with ${f.monthLength - f.dayOfMonth} ${f.monthLength - f.dayOfMonth === 1 ? 'day' : 'days'} of the month still left` : ''}.`,
          quoteKey: 'budget_over',
          evidence: { used, gone },
        }
      }
      if (used - gone >= T.BUDGET_AHEAD_POINTS) {
        return {
          score: 80,
          variants: [`${used}% of budget used`],
          description: `Only ${gone}% of the month has passed. At this speed, it may run out early.`,
          quoteKey: 'budget_ahead',
          evidence: { used, gone },
        }
      }
      if (gone - used >= T.BUDGET_BEHIND_POINTS) {
        return {
          score: 60,
          variants: [`${used}% of budget used`],
          description: `${gone}% of the month has passed, and you've spent ${money(f.spendThisMonth)}. You're doing fine.`,
          quoteKey: 'budget_behind',
          evidence: { used, gone },
        }
      }
      return null
    },
  },

  // -------------------------------------------------------------------------
  // 7. payday_effect — how fast a salary gets spent.
  //    Observes: the share of this month's spending that landed in the week after
  //    the month's biggest income.
  //    Fires: that share is at least PAYDAY_MIN_SHARE and the month has spent at
  //    least PAYDAY_MIN_SPEND, so it isn't a share of almost nothing. The one that
  //    speaks most directly to a salaried person.
  // -------------------------------------------------------------------------
  {
    id: 'payday_effect',
    build(f) {
      if (!f.payday || f.spendThisMonth < T.PAYDAY_MIN_SPEND) return null
      const share = f.paydayWeekSpend / f.spendThisMonth
      if (share < T.PAYDAY_MIN_SHARE) return null
      const pct = Math.round(share * 100)
      return {
        score: 62 + Math.min(18, (share - T.PAYDAY_MIN_SHARE) * 60),
        variants: ['Most spent after salary'],
        description: `${pct}% of this month's spending, ${money(f.paydayWeekSpend)}, was in the 7 days after your salary came in.`,
        evidence: { share: pct, amount: f.paydayWeekSpend, incomeDate: f.payday.date },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 8. no_spend_days — days with nothing spent.
  //    Observes: days this month, since the user's first activity in it, with no
  //    expense logged.
  //    Fires: at least NO_SPEND_MIN_DAY days into the month and at least
  //    NO_SPEND_MIN_DAYS empty days. Framed as a quiet fact, not a streak: streaks
  //    were tried and turned down.
  //    Worded "no spending logged", not "nothing spent": an unlogged day and a
  //    no-spend day look identical from here, so the sentence claims only what the
  //    data shows.
  // -------------------------------------------------------------------------
  {
    id: 'no_spend_days',
    build(f) {
      if (f.dayOfMonth < T.NO_SPEND_MIN_DAY || f.noSpendDays < T.NO_SPEND_MIN_DAYS) return null
      return {
        score: 40 + Math.min(20, f.noSpendDays * 2),
        variants: [`${f.noSpendDays} days with no spending`],
        description: `Out of ${f.dayOfMonth} days this month, you logged nothing on ${f.noSpendDays}.`,
        evidence: { days: f.noSpendDays },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 9. kept_share — how much of the year's income was kept.
  //    Observes: (income - spending) / income across this year's COMPLETED months.
  //    Fires: at least KEPT_MIN_MONTHS completed months, income logged in EVERY one
  //    of them (otherwise a month with an unlogged salary would read as overspending),
  //    and a share that is either
  //    at least KEPT_MIN_POINTS positive, or negative. A negative share is stated
  //    plainly and without alarm: it is information, not a verdict.
  // -------------------------------------------------------------------------
  {
    id: 'kept_share',
    build(f) {
      if (f.yearCompletedCount < T.KEPT_MIN_MONTHS || f.keptPct == null || !f.yearIncomeComplete) return null
      if (f.keptPct >= T.KEPT_MIN_POINTS) {
        return {
          score: 58,
          variants: withName(f, f.keptPct >= 20, `You've saved ${f.keptPct}%`, `you've saved ${f.keptPct}%`),
          description: `This year you earned ${money(f.yearIncome)} and spent ${money(f.yearSpend)}. The rest stayed with you.`,
          quoteKey: 'kept_up',
          evidence: { keptPct: f.keptPct },
        }
      }
      if (f.keptPct < 0) {
        return {
          score: 66,
          variants: ['Spending is above income'],
          description: `This year you earned ${money(f.yearIncome)} and spent ${money(f.yearSpend)}. That's ${Math.abs(f.keptPct)}% more going out than coming in.`,
          quoteKey: 'kept_down',
          evidence: { keptPct: f.keptPct },
        }
      }
      return null
    },
  },

  // -------------------------------------------------------------------------
  // 10. goal_progress — a savings goal that is under way.
  //    Observes: the active savings goal that is furthest along.
  //    Fires: at least GOAL_MIN_PERCENT done and not yet complete. Encouragement
  //    that comes from the user's own goal, not from a generic line.
  // -------------------------------------------------------------------------
  {
    id: 'goal_progress',
    build(f) {
      const g = f.goals
        .filter(x => x.kind !== 'debt' && !x.completedAt && x.target > 0 && x.percent >= T.GOAL_MIN_PERCENT && x.percent < 100)
        .sort((a, b) => b.percent - a.percent)[0]
      if (!g) return null
      return {
        score: 52 + Math.min(20, (g.percent - T.GOAL_MIN_PERCENT) / 4),
        variants: withName(f, g.percent >= 50, `${Math.round(g.percent)}% of the way to ${g.name}`, `${Math.round(g.percent)}% of the way to ${g.name}`),
        description: `You've saved ${money(g.saved)} of ${money(g.target)}.`,
        evidence: { goal: g.name, percent: Math.round(g.percent) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 11. debt_progress — a loan being paid down.
  //    Observes: an EMI loan with a known tenure and some EMIs paid.
  //    Fires: at least one EMI paid and not finished. Counts, not rupees, to match
  //    how the debt page itself shows progress.
  // -------------------------------------------------------------------------
  {
    id: 'debt_progress',
    build(f) {
      const d = f.goals
        .filter(x => x.kind === 'debt' && !x.completedAt && x.debtType === 'emi' && x.tenureMonths > 0 && x.emisPaid > 0 && x.emisPaid < x.tenureMonths)
        .sort((a, b) => b.emisPaid / b.tenureMonths - a.emisPaid / a.tenureMonths)[0]
      if (!d) return null
            return {
        score: 54,
        variants: withName(f, d.emisPaid / d.tenureMonths >= 0.5, `${d.emisPaid} of ${d.tenureMonths} EMIs paid`, `${d.emisPaid} of ${d.tenureMonths} EMIs paid`),
        description: `${d.tenureMonths - d.emisPaid} ${d.tenureMonths - d.emisPaid === 1 ? 'EMI' : 'EMIs'} left on ${d.name}.`,
        evidence: { loan: d.name, paid: d.emisPaid, tenure: d.tenureMonths },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 12. goal_pace — what the current pace adds up to.
  //    Observes: how much has actually gone into a savings goal (or a loan with no
  //    fixed schedule) per month over the last PACE_WINDOW_DAYS days, and how long
  //    what is left would take at that pace. This is the line that ties everyday
  //    habits to a goal the user cares about.
  //    Fires: money went in during at least PACE_MIN_MONTHS different months, the
  //    net is positive, and the finish is within PACE_MAX_MONTHS_AWAY months. Skips
  //    EMI loans (their end date is already known).
  //    Always "at your current pace" — an observation about now, never a promise or a
  //    target. The nearest finish is the one said, as it is the most encouraging and
  //    the most likely to be true.
  // -------------------------------------------------------------------------
  {
    id: 'goal_pace',
    build(f) {
      const p = f.goalPaces
        .filter(x => x.monthsLeft <= T.PACE_MAX_MONTHS_AWAY)
        .sort((a, b) => a.monthsLeft - b.monthsLeft)[0]
      if (!p) return null
      const away = p.monthsLeft <= 1 ? 'about a month' : `about ${p.monthsLeft} months`
      const rate = money(p.perMonth)
      const variants = p.isDebt
        ? withName(f, p.monthsLeft <= 6, `${p.name} paid off in ${away}`, `${p.name} paid off in ${away}`)
        : withName(f, p.monthsLeft <= 6, `${p.name} is ${away} away`, `${p.name} is ${away} away`)
      return {
        score: p.monthsLeft <= 3 ? 72 : p.monthsLeft <= 12 ? 64 : 56,
        variants,
        description: `You're putting in about ${rate} a month. ${money(p.remaining)} more to go.`,
        evidence: { goal: p.name, perMonth: Math.round(p.perMonth), monthsLeft: p.monthsLeft },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 13. emergency_cover — how long the savings would last.
  //    Observes: everything saved across the savings goals, against the user's usual
  //    month of spending. Needs a usual month to measure against (a completed month
  //    of spending), so a new account is never told a number made of nothing.
  //    Fires: the savings cover fewer than EMERGENCY_MIN_MONTHS months. Says what an
  //    emergency fund is for and what a sensible size looks like, in rupees.
  //    No category is needed: savings of any name count, since all of it is money that
  //    could be used in an emergency.
  // -------------------------------------------------------------------------
  {
    id: 'emergency_cover',
    build(f) {
      if (!(f.monthlySpend > 0)) return null
      const months = f.savedTotal / f.monthlySpend
      if (months >= T.EMERGENCY_MIN_MONTHS) return null
      const [lo, hi] = T.EMERGENCY_TARGET_MONTHS
      const range = `${money(f.monthlySpend * lo)} to ${money(f.monthlySpend * hi)}`
      const none = f.savedTotal <= 0
      const cover = months < 1 ? 'less than a month' : `about ${months.toFixed(1).replace(/\.0$/, '')} ${months < 1.95 ? 'month' : 'months'}`
      return {
        score: none ? 68 : 60,
        variants: [none ? 'No emergency fund yet' : `Savings cover ${cover}`],
        description: none
          ? `An emergency fund is money kept aside for sudden costs, like a hospital bill or a lost job. For you, ${lo} to ${hi} months of spending is ${range}.`
          : `Your savings of ${money(f.savedTotal)} would last ${cover}. An emergency fund is for sudden costs, and ${lo} to ${hi} months of spending, ${range}, is a safe size.`,
        quoteKey: 'emergency_cover',
        evidence: { months: Math.round(months * 10) / 10, saved: f.savedTotal, monthlySpend: Math.round(f.monthlySpend) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 14. debt_clear_first — which of several loans to finish first.
  //    Observes: the loan with the least left to pay, among two or more still open.
  //    Fires: two or more open loans. The smallest balance is the one that can be
  //    finished soonest, and finishing it frees its monthly EMI (when it has one) for
  //    the next. No interest rate is needed or assumed.
  // -------------------------------------------------------------------------
  {
    id: 'debt_clear_first',
    build(f) {
      if (f.openDebts.length < 2) return null
      const first = [...f.openDebts].sort((a, b) => a.remaining - b.remaining)[0]
      const freed = first.debtType === 'emi' && first.emiAmount > 0 ? `${money(first.emiAmount)} a month` : 'that monthly money'
      return {
        score: 66,
        variants: [`Clear ${first.name} first`],
        description: `It has the least left to pay, ${money(first.remaining)}. Once it's done, ${freed} is free for the next loan.`,
        quoteKey: 'debt_clear_first',
        evidence: { loan: first.name, remaining: first.remaining, loans: f.openDebts.length },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 15. loan_cost — what a loan costs beyond what was borrowed.
  //    Observes: an EMI loan whose total repayment is above the amount borrowed. The
  //    app doesn't know how the gap splits (interest, fees), so it only says "extra".
  //    Fires: the extra is at least LOAN_EXTRA_MIN_SHARE of the amount borrowed. Picks
  //    the loan with the most extra to pay.
  // -------------------------------------------------------------------------
  {
    id: 'loan_cost',
    build(f) {
      const l = f.openDebts
        .filter(d => d.debtType === 'emi' && d.extraToPay > 0 && d.target > 0 && d.extraToPay / d.target >= T.LOAN_EXTRA_MIN_SHARE)
        .sort((a, b) => b.extraToPay - a.extraToPay)[0]
      if (!l) return null
      return {
        score: 56,
        variants: [`${l.name} costs ${money(l.extraToPay)} extra`],
        description: `You borrowed ${money(l.target)} and will repay ${money(l.totalRepayment)} in all. That extra is the price of borrowing.`,
        quoteKey: 'loan_cost',
        evidence: { loan: l.name, extra: l.extraToPay, borrowed: l.target },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 16-17. health_insurance, term_insurance — plain facts worth knowing.
  //    Not from the user's data: the app can't tell whether they are covered, and
  //    saying it is important is fine either way. Scored just above the floor, so
  //    they only come up when nothing from the user's own money has anything fresh
  //    to say (see pickInsight: a resting insight lets the next one through).
  // -------------------------------------------------------------------------
  {
    id: 'health_insurance',
    build() {
      return {
        score: T.MIN_SHOW_SCORE + 1,
        variants: ['Health insurance matters'],
        description: 'One hospital stay can use up years of savings. Health insurance pays the bill, so your savings stay safe.',
        quoteKey: 'health_insurance',
        evidence: {},
      }
    },
  },
  {
    id: 'term_insurance',
    build() {
      return {
        score: T.MIN_SHOW_SCORE,
        variants: ['Term insurance protects your family'],
        description: "If your family depends on your income, term insurance gives them a lump sum if you're not there. It costs little for how much it covers.",
        quoteKey: 'term_insurance',
        evidence: {},
      }
    },
  },

  // -------------------------------------------------------------------------
  // 19. month_forecast — where the month would end at this pace.
  //    Observes: spending so far, spread over the days gone, carried to the month's
  //    end. Rounded to the nearest hundred, since it's a guess, not a figure.
  //    Fires: at least FORECAST_MIN_DAY days in, with enough days logged, and not in the
  //    last FORECAST_MIN_DAYS_LEFT days (when it's no longer a forecast). Louder when it
  //    lands past a set budget.
  // -------------------------------------------------------------------------
  {
    id: 'month_forecast',
    cooldown: 4,
    build(f) {
      if (f.projectedSpend == null || f.monthLength - f.dayOfMonth < T.FORECAST_MIN_DAYS_LEFT) return null
      const proj = Math.round(f.projectedSpend / 100) * 100
      const over = f.budgetAmount ? proj - f.budgetAmount : null
      let description = `You've spent ${money(f.spendThisMonth)} in ${f.dayOfMonth} days. At this pace, the month ends near ${money(proj)}.`
      if (over != null) {
        description = `${description} That's ${over > 0 ? `${money(over)} over` : `${money(-over)} under`} your budget.`
      }
      return {
        score: over != null && over > 0 ? 74 : 58,
        variants: [`On track to spend ${money(proj)}`],
        description,
        quoteKey: 'month_forecast',
        evidence: { projected: proj, over },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 21. week_vs_last — the last 7 days against the 7 before.
  //    Observes: spending over the last seven days, including today, against the seven
  //    days before them. Unlike a month, it can change every week.
  //    Fires: both weeks have at least WEEK_MIN_LOGGED_DAYS days logged, the earlier
  //    one isn't tiny, and the change is at least WEEK_CHANGE_PCT.
  // -------------------------------------------------------------------------
  {
    id: 'week_vs_last',
    cooldown: 6,
    build(f) {
      if (f.weekLogged < T.WEEK_MIN_LOGGED_DAYS || f.weekPrevLogged < T.WEEK_MIN_LOGGED_DAYS || f.weekPrevSpend < T.WEEK_MIN_BASE) return null
      const pct = pctChange(f.weekSpend, f.weekPrevSpend)
      const abs = Math.abs(pct)
      if (abs < T.WEEK_CHANGE_PCT) return null
      const more = pct > 0
      const title = `${abs}% ${more ? 'more' : 'less'} than last week`
      return {
        score: Math.min(80, 52 + abs / 3),
        variants: withName(f, !more && abs >= 25, title, title),
        description: `You spent ${money(f.weekSpend)} in the last 7 days. The 7 days before that: ${money(f.weekPrevSpend)}.`,
        quoteKey: more ? 'week_more' : 'week_less',
        evidence: { cur: f.weekSpend, prev: f.weekPrevSpend, pct },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 22. emi_soon — an EMI about to fall due.
  //    Observes: the open EMI loan with the nearest next-payment date, and how far off
  //    it is. A reminder from the user's own schedule, not a rule of thumb.
  //    Fires: within EMI_SOON_DAYS days (today included).
  // -------------------------------------------------------------------------
  {
    id: 'emi_soon',
    cooldown: 2,
    build(f) {
      const today = dateFromStr(f.todayStr)
      let best = null
      for (const d of f.openDebts) {
        if (d.debtType !== 'emi' || !d.nextEmiDate || !(d.emiAmount > 0)) continue
        const days = Math.round((dateFromStr(d.nextEmiDate) - today) / 86400000)
        if (days < 0 || days > T.EMI_SOON_DAYS) continue
        if (!best || days < best.days) best = { d, days }
      }
      if (!best) return null
      const when = best.days === 0 ? 'today' : best.days === 1 ? 'tomorrow' : `in ${best.days} days`
      return {
        score: 76 - best.days * 2,
        variants: [`EMI of ${money(best.d.emiAmount)} due ${when}`],
        description: `${best.d.name} has ${best.d.emisRemaining ?? 'a few'} ${best.d.emisRemaining === 1 ? 'EMI' : 'EMIs'} left, including this one.`,
        quoteKey: 'emi_soon',
        evidence: { loan: best.d.name, days: best.days, amount: best.d.emiAmount },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 23. debt_load — how much of income goes to EMIs.
  //    Observes: the monthly EMIs of every open loan against the year's average monthly
  //    income. Anything under about 40% is usually considered manageable, and the
  //    sentence says so when it is.
  //    Fires: EMIs are at least DEBT_LOAD_MIN_PCT of income. Needs a completed month of
  //    income to measure against.
  // -------------------------------------------------------------------------
  {
    id: 'debt_load',
    build(f) {
      if (!(f.monthlyEmi > 0) || !(f.yearAvgIncome > 0)) return null
      const pct = Math.round((f.monthlyEmi / f.yearAvgIncome) * 100)
      if (pct < T.DEBT_LOAD_MIN_PCT) return null
      return {
        score: pct >= 40 ? 72 : 55,
        variants: [`EMIs take ${pct}% of your income`],
        description: `You pay ${money(f.monthlyEmi)} a month in EMIs, against about ${money(f.yearAvgIncome)} earned. ${pct >= 40 ? 'Above 40% leaves little room for anything else.' : 'Under 40% is usually manageable.'}`,
        quoteKey: pct >= 40 ? 'debt_load_high' : 'debt_load',
        evidence: { pct, emi: f.monthlyEmi, income: Math.round(f.yearAvgIncome) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 24. saving_rate — how much of this month's income is still there.
  //    Observes: income this month less spending this month, as a share of the income.
  //    A common rule of thumb is to keep about 20%, and the sentence says where the
  //    user is against it, without grading it.
  //    Fires: some income is logged this month and we're at least SAVING_RATE_MIN_DAY
  //    days in. A month with no income logged says nothing: an unlogged salary isn't
  //    the same as no salary.
  // -------------------------------------------------------------------------
  {
    id: 'saving_rate',
    build(f) {
      if (!(f.incomeThisMonth > 0) || f.dayOfMonth < T.SAVING_RATE_MIN_DAY) return null
      const kept = Math.round(((f.incomeThisMonth - f.spendThisMonth) / f.incomeThisMonth) * 100)
      if (kept < 0) {
        return {
          score: 64,
          variants: ['Spending is above income this month'],
          description: `You've earned ${money(f.incomeThisMonth)} and spent ${money(f.spendThisMonth)} so far.`,
          quoteKey: 'kept_down',
          evidence: { kept },
        }
      }
      return {
        score: kept >= 20 ? 60 : 52,
        variants: [`${kept}% of income kept so far`],
        description: `You've earned ${money(f.incomeThisMonth)} and spent ${money(f.spendThisMonth)}. ${kept >= 20 ? "A common aim is to keep 20%, and you're past it." : 'A common aim is to keep 20%.'}`,
        quoteKey: 'saving_rate',
        evidence: { kept },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 26. goal_almost — a savings goal nearly done.
  //    Observes: the open goal with the least left, once it is within
  //    GOAL_ALMOST_LEFT_SHARE of its target.
  //    Fires: that close, and not yet reached. The closest finish line is the most
  //    encouraging thing the engine can say.
  // -------------------------------------------------------------------------
  {
    id: 'goal_almost',
    cooldown: 3,
    build(f) {
      const g = f.goals
        .filter(x => x.kind !== 'debt' && !x.completedAt && !x.reached && x.target > 0 && x.remaining > 0 && x.remaining / x.target <= T.GOAL_ALMOST_LEFT_SHARE)
        .sort((a, b) => a.remaining / a.target - b.remaining / b.target)[0]
      if (!g) return null
      return {
        score: 78,
        variants: withName(f, true, `${money(g.remaining)} left to finish ${g.name}`, `${money(g.remaining)} left to finish ${g.name}`),
        description: `You've saved ${money(g.saved)} of ${money(g.target)}.`,
        quoteKey: 'goal_almost',
        evidence: { goal: g.name, remaining: g.remaining },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 26b. goal_milestone — a savings goal that just passed a milestone.
  //    Observes: a goal whose saved share crossed 25, 50 or 75% through the deposits
  //    of the last MILESTONE_WINDOW_DAYS days (it was below before them, and isn't now).
  //    Derived from the entries, so it needs no extra memory, and fades by itself a
  //    week later.
  // -------------------------------------------------------------------------
  {
    id: 'goal_milestone',
    cooldown: 4,
    build(f) {
      const since = toDateStr(new Date(dateFromStr(f.todayStr).getTime() - T.MILESTONE_WINDOW_DAYS * 86400000))
      let best = null
      for (const g of f.goals) {
        if (g.kind === 'debt' || g.completedAt || !(g.target > 0)) continue
        const recent = (g.entries || []).filter(e => e.date >= since && e.date <= f.todayStr)
        if (!recent.length) continue
        const before = Math.max(0, g.saved - sum(recent.map(e => (e.type === 'add' ? e.amount : -e.amount))))
        const nowPct = (g.saved / g.target) * 100
        const beforePct = (before / g.target) * 100
        const crossed = T.GOAL_MILESTONES.filter(m => beforePct < m && nowPct >= m).pop()
        if (crossed && (!best || crossed > best.m)) best = { g, m: crossed }
      }
      if (!best) return null
      return {
        score: 74,
        variants: withName(f, true, `${best.g.name} crossed ${best.m}%`, `${best.g.name} crossed ${best.m}%`),
        description: `You've saved ${money(best.g.saved)} of ${money(best.g.target)}.`,
        quoteKey: 'goal_milestone',
        evidence: { goal: best.g.name, milestone: best.m },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 27. deposit_missed — a goal that was getting money every month, and isn't.
  //    Observes: a savings goal that had a deposit in at least two of the last three
  //    completed months and none yet this month.
  //    Fires: from DEPOSIT_MISSED_MIN_DAY of the month, so early days don't nag. Says
  //    what the last deposit was, and nothing about what to do.
  // -------------------------------------------------------------------------
  {
    id: 'deposit_missed',
    cooldown: 5,
    build(f) {
      if (f.dayOfMonth < T.DEPOSIT_MISSED_MIN_DAY) return null
      const lastThree = f.completedKeys.slice(-3)
      if (lastThree.length < 2) return null
      let best = null
      for (const g of f.goals) {
        if (g.kind === 'debt' || g.completedAt || g.reached) continue
        const adds = (g.entries || []).filter(e => e.type === 'add')
        if (adds.some(e => keyOf(e.date) === f.curKey)) continue
        const months = new Set(adds.map(e => keyOf(e.date)).filter(k => lastThree.includes(k)))
        if (months.size < 2) continue
        const last = [...adds].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
        if (!best || last.date > best.last.date) best = { g, last }
      }
      if (!best) return null
      return {
        score: 66,
        variants: [`No deposit to ${best.g.name} this month`],
        description: `You add to it most months. Your last deposit was ${money(best.last.amount)}, on ${dayOf(best.last.date)} ${monthNameOf(keyOf(best.last.date))}.`,
        quoteKey: 'deposit_missed',
        evidence: { goal: best.g.name, lastDeposit: best.last.date },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 29. income_change — income against the month before.
  //    Observes: the last completed month's income against the one before it.
  //    Fires: both months have income and enough days logged, and the change is at
  //    least INCOME_CHANGE_PCT. Said calmly either way: up or down is a fact.
  // -------------------------------------------------------------------------
  {
    id: 'income_change',
    cooldown: 14,
    build(f) {
      if (!f.lastKey || !f.priorKey || !f.lastWellLogged || !f.priorWellLogged) return null
      if (f.incomeLast <= 0 || f.incomePrior <= 0) return null
      const pct = pctChange(f.incomeLast, f.incomePrior)
      if (Math.abs(pct) < T.INCOME_CHANGE_PCT) return null
      const up = pct > 0
      return {
        score: 60,
        variants: [`Income ${up ? 'up' : 'down'} ${Math.abs(pct)}%`],
        description: `${monthNameOf(f.lastKey)} brought in ${money(f.incomeLast)}. ${monthNameOf(f.priorKey)}: ${money(f.incomePrior)}.`,
        quoteKey: up ? 'income_up' : 'income_down',
        evidence: { last: f.incomeLast, prior: f.incomePrior, pct },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 31. savings_withdrawal — money taken out of savings.
  //    Observes: withdrawals from savings goals this month, added up.
  //    Fires: at least WITHDRAWAL_MIN. Said as a fact, with the savings that are left.
  // -------------------------------------------------------------------------
  {
    id: 'savings_withdrawal',
    cooldown: 5,
    build(f) {
      if (f.withdrawnThisMonth < T.WITHDRAWAL_MIN) return null
      return {
        score: 63,
        variants: [`${money(f.withdrawnThisMonth)} taken out of savings`],
        description: `That's ${f.withdrawalCount} ${f.withdrawalCount === 1 ? 'withdrawal' : 'withdrawals'} this month. Your savings now stand at ${money(f.savedTotal)}.`,
        quoteKey: 'savings_withdrawal',
        evidence: { total: f.withdrawnThisMonth, count: f.withdrawalCount },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 32. goal_idle — a savings goal that has gone quiet.
  //    Observes: an unfinished goal with some money in it whose last deposit is at least
  //    GOAL_IDLE_DAYS days old. deposit_missed speaks of a goal that fed monthly; this
  //    is one that stopped a while ago.
  // -------------------------------------------------------------------------
  {
    id: 'goal_idle',
    cooldown: 10,
    build(f) {
      const today = dateFromStr(f.todayStr)
      let best = null
      for (const g of f.goals) {
        if (g.kind === 'debt' || g.completedAt || g.reached || !(g.saved > 0) || !(g.remaining > 0)) continue
        const adds = (g.entries || []).filter(e => e.type === 'add')
        if (!adds.length) continue
        const last = [...adds].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
        const days = Math.round((today - dateFromStr(last.date)) / 86400000)
        if (days < T.GOAL_IDLE_DAYS) continue
        if (!best || g.saved > best.g.saved) best = { g, last, days }
      }
      if (!best) return null
      return {
        score: 50,
        variants: [`No deposit to ${best.g.name} in ${best.days} days`],
        description: `Your last deposit was ${money(best.last.amount)}. ${money(best.g.remaining)} is left to finish.`,
        quoteKey: 'goal_idle',
        evidence: { goal: best.g.name, days: best.days },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 33. goal_whatif — what a little more each month would do.
  //    Observes: the nearest savings goal with a steady pace (see goalPaces), and how
  //    much sooner it would be done with about a tenth more a month, in round
  //    hundreds. An observation of arithmetic, not a target.
  //    Fires: the extra would save at least a month.
  // -------------------------------------------------------------------------
  {
    id: 'goal_whatif',
    cooldown: 8,
    build(f) {
      const p = f.goalPaces.filter(x => !x.isDebt && x.monthsLeft >= 3).sort((a, b) => a.monthsLeft - b.monthsLeft)[0]
      if (!p) return null
      const extra = Math.max(500, Math.round(p.perMonth * 0.1 / 500) * 500)
      const newMonths = Math.ceil(p.remaining / (p.perMonth + extra))
      const sooner = p.monthsLeft - newMonths
      if (sooner < 1) return null
      return {
        score: 57,
        variants: [`${money(extra)} more a month saves ${sooner} ${sooner === 1 ? 'month' : 'months'}`],
        description: `At ${money(p.perMonth)} a month, ${p.name} is ${p.monthsLeft} months away. With ${money(extra)} more, about ${newMonths}.`,
        quoteKey: 'goal_whatif',
        evidence: { goal: p.name, extra, sooner },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 34. saving_streak — months in a row with a deposit.
  //    Observes: how many consecutive months, ending now, had a deposit into any savings
  //    goal. This month counts if it already has one; if not, the run still stands
  //    through last month. Said as a fact about what's happened, never as something to
  //    protect: there is no "don't break it".
  // -------------------------------------------------------------------------
  {
    id: 'saving_streak',
    cooldown: 10,
    build(f) {
      if (f.savingStreak < T.SAVING_STREAK_MIN) return null
      return {
        score: 62,
        variants: withName(f, true, `${f.savingStreak} months of saving in a row`, `${f.savingStreak} months of saving in a row`),
        description: `You've added to your savings every month since ${monthNameOf(f.streakStartKey)}.`,
        quoteKey: 'saving_streak',
        evidence: { months: f.savingStreak },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 35. total_saved — everything saved so far.
  //    Observes: the sum across savings goals, and what was added this year.
  //    Fires: at least TOTAL_SAVED_MIN saved. A quiet milestone; low score, so it comes
  //    up on days with nothing more pressing.
  // -------------------------------------------------------------------------
  {
    id: 'total_saved',
    build(f) {
      if (f.savedTotal < T.TOTAL_SAVED_MIN) return null
      const n = f.goals.filter(g => g.kind !== 'debt' && g.saved > 0).length
      return {
        score: 48,
        variants: [`${money(f.savedTotal)} saved`],
        description: `Across ${n} ${n === 1 ? 'goal' : 'goals'}.${f.addedThisYear > 0 ? ` You've added ${money(f.addedThisYear)} this year.` : ''}`,
        quoteKey: 'total_saved',
        evidence: { total: f.savedTotal, thisYear: f.addedThisYear },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 36. debt_free_date — when the last loan ends.
  //    Observes: the latest finish date among the open loans, when every one of them
  //    is on an EMI schedule. A flexible loan has no end date, so the engine says
  //    nothing rather than guess.
  // -------------------------------------------------------------------------
  {
    id: 'debt_free_date',
    cooldown: 10,
    build(f) {
      if (!f.openDebts.length || f.openDebts.some(d => d.debtType !== 'emi' || !d.estimatedFinishDate)) return null
      const last = [...f.openDebts].sort((a, b) => (a.estimatedFinishDate < b.estimatedFinishDate ? 1 : -1))[0]
      if (last.estimatedFinishDate < f.todayStr) return null
      return {
        score: 66,
        variants: [`Debt-free by ${monthNameOf(keyOf(last.estimatedFinishDate)).slice(0, 3)} ${last.estimatedFinishDate.slice(0, 4)}`],
        description: `${last.name} is your last loan, and it ends then if you keep paying on schedule.`,
        quoteKey: 'debt_free_date',
        evidence: { loan: last.name, date: last.estimatedFinishDate },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 37. emi_freed — an EMI about to free up.
  //    Observes: the open EMI loan that ends soonest, and the monthly amount that
  //    becomes the user's again.
  //    Fires: within EMI_FREED_MAX_MONTHS months of its last EMI.
  // -------------------------------------------------------------------------
  {
    id: 'emi_freed',
    cooldown: 8,
    build(f) {
      const d = f.openDebts
        .filter(x => x.debtType === 'emi' && x.emiAmount > 0 && x.emisRemaining >= 1 && x.emisRemaining <= T.EMI_FREED_MAX_MONTHS)
        .sort((a, b) => a.emisRemaining - b.emisRemaining)[0]
      if (!d) return null
      return {
        score: 61,
        variants: [`${money(d.emiAmount)} a month frees up in ${d.emisRemaining} ${d.emisRemaining === 1 ? 'month' : 'months'}`],
        description: `${d.name} ends then. After that, that money is yours again.`,
        quoteKey: 'emi_freed',
        evidence: { loan: d.name, months: d.emisRemaining, amount: d.emiAmount },
      }
    },
  },
  // -------------------------------------------------------------------------
  // 38. biggest_day — the heaviest day of the month so far.
  //    Observes: the day this month with the most spent in total, against a usual day on
  //    which something was spent.
  //    Fires: ten days in, on at least five spending days, and that day is at least
  //    BIGGEST_DAY_RATIO times a usual one and at least BIGGEST_DAY_MIN. Different from
  //    biggest_expense, which is one purchase: this is everything on one day.
  // -------------------------------------------------------------------------
  {
    id: 'biggest_day',
    cooldown: 5,
    build(f) {
      const b = f.biggestDay
      if (!b || f.dayOfMonth < T.BIGGEST_DAY_MIN_DAY || f.spendingDays < 5 || b.total < T.BIGGEST_DAY_MIN) return null
      if (b.total < f.spendingDayAvg * T.BIGGEST_DAY_RATIO) return null
      const d = dayOf(b.date)
      const weekday = WEEKDAY_NAMES[dateFromStr(b.date).getDay()].slice(0, -1)
      return {
        score: 52 + Math.min(14, (b.total / f.spendingDayAvg - T.BIGGEST_DAY_RATIO) * 10),
        variants: [`Heaviest day was the ${ordinal(d)}`],
        description: `You spent ${money(b.total)} on ${weekday} the ${ordinal(d)}. A usual spending day this month is about ${money(f.spendingDayAvg)}.`,
        quoteKey: 'biggest_day',
        evidence: { date: b.date, total: b.total, usual: Math.round(f.spendingDayAvg) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 42. year_vs_last_year — this month against the same month a year ago.
  //    Observes: spending to date this month against the same days of the same month
  //    last year.
  //    Fires: a week in, last year's month was well logged to that day and isn't tiny,
  //    and the change is at least YEAR_CHANGE_PCT. Needs a year of history, so it only
  //    appears for people who have been here that long.
  // -------------------------------------------------------------------------
  {
    id: 'year_vs_last_year',
    cooldown: 14,
    build(f) {
      if (f.dayOfMonth < T.TO_DATE_MIN_DAY || f.yearAgoLogged < T.MIN_LOGGED_DAYS_TO_DATE || f.yearAgoToDate < T.MONTH_COMPARE_MIN_BASE) return null
      const pct = pctChange(f.spendThisMonth, f.yearAgoToDate)
      if (Math.abs(pct) < T.YEAR_CHANGE_PCT) return null
      const more = pct > 0
      const month = monthNameOf(f.yearAgoKey)
      return {
        score: 58,
        variants: [`${Math.abs(pct)}% ${more ? 'more' : 'less'} than last ${month}`],
        description: `You've spent ${money(f.spendThisMonth)} so far this month. By this day last ${month}, it was ${money(f.yearAgoToDate)}.`,
        quoteKey: 'year_vs_last_year',
        evidence: { cur: f.spendThisMonth, yearAgo: f.yearAgoToDate, pct },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 43. average_day — what a day costs.
  //    Observes: this month's spending over the days gone, and last month's the same way.
  //    Fires: five days in. A plain, always-true line, scored low so that anything
  //    more notable goes ahead of it.
  // -------------------------------------------------------------------------
  {
    id: 'average_day',
    build(f) {
      if (f.avgDaySpend == null || !(f.avgDaySpend > 0)) return null
      const last = f.lastAvgDaySpend > 0 ? ` Last month it was ${money(f.lastAvgDaySpend)} a day.` : ''
      return {
        score: 47,
        variants: [`About ${money(f.avgDaySpend)} a day`],
        description: `You've spent ${money(f.spendThisMonth)} in ${f.dayOfMonth} days this month.${last}`,
        quoteKey: 'average_day',
        evidence: { perDay: Math.round(f.avgDaySpend) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 45. entries_milestone — a round number of entries logged.
  //    Observes: how many entries (expenses and income) have been logged. Said when the
  //    count passed a round number within the last MILESTONE_WINDOW_DAYS days, worked out
  //    from the dates, so it needs no memory and fades on its own.
  // -------------------------------------------------------------------------
  {
    id: 'entries_milestone',
    cooldown: 7,
    build(f) {
      const m = T.ENTRY_MILESTONES.filter(x => f.entriesBeforeWindow < x && f.totalEntries >= x).pop()
      if (!m) return null
      return {
        score: 66,
        variants: withName(f, true, `${m} entries logged`, `${m} entries logged`),
        description: f.firstDate ? `You've been tracking your money since ${monthNameOf(keyOf(f.firstDate)).slice(0, 3)} ${f.firstDate.slice(0, 4)}.` : null,
        quoteKey: 'entries_milestone',
        evidence: { milestone: m },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 46. tracking_days — how long the user has been tracking.
  //    Observes: days since the first entry, said for a week after it reaches 30, 100,
  //    180 days, a year, two, three.
  // -------------------------------------------------------------------------
  {
    id: 'tracking_days',
    cooldown: 7,
    build(f) {
      const m = T.TRACKING_MILESTONES.filter(x => f.daysSinceFirst >= x && f.daysSinceFirst < x + T.MILESTONE_WINDOW_DAYS).pop()
      if (!m) return null
      const label = m >= 365 ? `${Math.round(m / 365)} ${m === 365 ? 'year' : 'years'}` : `${m} days`
      return {
        score: 64,
        variants: withName(f, true, `${label} of tracking`, `${label} of tracking`),
        description: `You've logged ${f.totalEntries} entries since the first one.`,
        quoteKey: 'tracking_days',
        evidence: { days: m },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 47. saved_milestone — savings that just passed a round amount.
  //    Observes: total saved across savings goals now, against what it was
  //    SAVED_WINDOW_DAYS days ago (today's total less the net of the entries since).
  //    Fires: it crossed ₹10,000, ₹25,000, ₹50,000, ₹1 lakh, and so on, within that window.
  // -------------------------------------------------------------------------
  {
    id: 'saved_milestone',
    cooldown: 14,
    build(f) {
      const before = f.savedTotal - f.savedRecentNet
      const m = T.SAVED_MILESTONES.filter(x => before < x && f.savedTotal >= x).pop()
      if (!m) return null
      return {
        score: 72,
        variants: withName(f, true, `${money(m)} saved`, `${money(m)} saved`),
        description: `Across all your goals, you now have ${money(f.savedTotal)}.`,
        quoteKey: 'saved_milestone',
        evidence: { milestone: m },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 49. set_budget — a new month with no budget.
  //    Observes: no budget is set, in the first days of a month, for someone with a
  //    usual month of spending to point to.
  //    Fires: first week of the month. Says what a budget gives, not that one is needed.
  // -------------------------------------------------------------------------
  {
    id: 'set_budget',
    cooldown: 10,
    build(f) {
      if (f.budgetAmount || f.dayOfMonth > 7 || !(f.monthlySpend > 0)) return null
      return {
        score: 63,
        variants: ["Set this month's budget"],
        description: `Your usual month is about ${money(f.monthlySpend)}. A budget gives you a number to spend each day.`,
        quoteKey: 'set_budget',
        evidence: { monthlySpend: Math.round(f.monthlySpend) },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 50. sunday_check — a look at the week, on Sundays.
  //    Observes: the last seven days' spending, on a Sunday. It is a weekly rhythm
  //    rather than a fact about the money, so it only ever comes up on that day.
  // -------------------------------------------------------------------------
  {
    id: 'sunday_check',
    cooldown: 6,
    build(f) {
      if (f.now.getDay() !== 0 || f.weekLogged < 2) return null
      return {
        score: 59,
        variants: ['Your week in one look'],
        description: `You spent ${money(f.weekSpend)} in the last 7 days. A few minutes on Sunday keeps month end calm.`,
        quoteKey: 'sunday_check',
        evidence: { week: f.weekSpend },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 51. new_financial_year — the start of the Indian financial year (April).
  // -------------------------------------------------------------------------
  {
    id: 'new_financial_year',
    cooldown: 30,
    build(f) {
      if (f.now.getMonth() !== 3 || f.dayOfMonth > 14) return null
      return {
        score: 60,
        variants: ['A new financial year begins'],
        description: 'April starts the financial year. It is a good time to set a budget and a savings goal for the year ahead.',
        quoteKey: 'new_financial_year',
        evidence: {},
      }
    },
  },

  // -------------------------------------------------------------------------
  // 52. financial_year_end — the end of the financial year (31 March).
  //    Fires: in the FY_REMINDER_DAYS days before it. Says what the date means, and
  //    leaves what to do about it to the user.
  // -------------------------------------------------------------------------
  {
    id: 'financial_year_end',
    cooldown: 14,
    build(f) {
      const y = f.now.getMonth() >= 3 ? f.year + 1 : f.year
      const days = Math.ceil((new Date(y, 2, 31) - dateFromStr(f.todayStr)) / 86400000)
      if (days < 0 || days > T.FY_REMINDER_DAYS) return null
      return {
        score: days <= 14 ? 66 : 56,
        variants: [`Financial year ends in ${days} ${days === 1 ? 'day' : 'days'}`],
        description: 'Tax-saving investments and payments have to be done before 31 March. Check what applies to you.',
        quoteKey: 'financial_year_end',
        evidence: { days },
      }
    },
  },

  // -------------------------------------------------------------------------
  // 53. festival_season — gifts, clothes, travel, sweets.
  //    Fires: from early October to mid-November, when the big festivals fall.
  // -------------------------------------------------------------------------
  {
    id: 'festival_season',
    cooldown: 12,
    build(f) {
      const m = f.now.getMonth()
      const d = f.dayOfMonth
      if (!((m === 9 && d >= 5) || (m === 10 && d <= 15))) return null
      return {
        score: 54,
        variants: ['Festival season is here'],
        description: 'Gifts, clothes, travel and sweets add up fast in festival weeks. Many people set an amount aside for it first.',
        quoteKey: 'festival_season',
        evidence: {},
      }
    },
  },

  // -------------------------------------------------------------------------
  // 54-55. subscription_check, card_interest — two more plain facts.
  //    Not from the user's data, like the insurance ones: scored at the floor, so they
  //    only come up when nothing from the user's own money is fresh.
  // -------------------------------------------------------------------------
  {
    id: 'subscription_check',
    cooldown: 80,
    build(f) {
      if (![0, 3, 6, 9].includes(f.now.getMonth()) || f.dayOfMonth > 5) return null
      return {
        score: T.MIN_SHOW_SCORE + 1,
        variants: ['Check your subscriptions'],
        description: 'Subscriptions are easy to forget. A look every few months finds the ones you no longer use.',
        quoteKey: 'subscription_check',
        evidence: {},
      }
    },
  },
  {
    id: 'card_interest',
    build() {
      return {
        score: T.MIN_SHOW_SCORE,
        variants: ['Card interest is costly'],
        description: 'Paying only the minimum on a credit card means interest on the rest, often over 3% a month.',
        quoteKey: 'card_interest',
        evidence: {},
      }
    },
  },
]

// ===========================================================================
// LAYER 3 — SELECTOR
// ===========================================================================
// Runs every rule against the facts and returns the candidates, best first. A rule
// that throws is skipped rather than allowed to take the others down: an insight is
// a nicety and must never break the screen it sits on.
export function runRules(facts, day = dayNumber(facts.now)) {
  const out = []
  for (const rule of RULES) {
    try {
      const r = rule.build(facts)
      if (!r || !r.variants?.length || r.score < T.MIN_SHOW_SCORE) continue
      out.push({
        id: rule.id,
        cooldown: rule.cooldown ?? T.COOLDOWN_DAYS,
        score: Math.round(r.score),
        // The title: the sentence without its full stop.
        text: r.variants[day % r.variants.length].replace(/\.$/, ''),
        description: r.description ?? null,
        quoteKey: r.quoteKey ?? rule.id,
        evidence: r.evidence,
      })
    } catch (err) {
      // Skip this rule today; a rule that throws is a bug, so it is reported.
      reportError(err)
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

// What the selector remembers, so it can rest an insight after showing it:
//   { shown: { [ruleId]: dayNumberLastShown }, today: { day, id } | null }
// The caller owns storage (AsyncStorage on the device); the engine only reads and
// returns it, which keeps it pure.
export const EMPTY_HISTORY = { shown: {}, today: null }

// Picks today's insight.
//   - Within a day the answer is stable: reopening the app shows the same one.
//   - Otherwise the highest-scoring candidate that isn't resting wins. If every
//     candidate is resting, the one rested longest is allowed back, so there is
//     something to show whenever there is anything true to say.
//   - Returns { insight, history }: `history` is the updated memory to store, or
//     null insight when there is nothing to say today.
export function pickInsight(facts, history = EMPTY_HISTORY, day = dayNumber(facts.now)) {
  const candidates = runRules(facts, day)
  if (!candidates.length) return { insight: null, history }

  const prev = history?.today
  if (prev && prev.day === day) {
    const same = candidates.find(c => c.id === prev.id)
    if (same) return { insight: same, history }
  }

  const shown = history?.shown || {}
  const fresh = candidates.filter(c => shown[c.id] == null || day - shown[c.id] >= c.cooldown)
  const pool = fresh.length ? fresh : [...candidates].sort((a, b) => (shown[a.id] ?? -Infinity) - (shown[b.id] ?? -Infinity))
  const insight = pool[0]

  return {
    insight,
    history: { shown: { ...shown, [insight.id]: day }, today: { day, id: insight.id } },
  }
}
