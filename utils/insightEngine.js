import { reportError } from './errors'
import { LEARN_CARDS } from './learnCards'
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
// THE INSIGHTS (21). The id is the rule's name here and in the selector's memory.
// Each rule below has its own comment saying what it observes and when it fires.
//
//   Getting started
//     first_day           a new account with nothing logged yet
//   Spending
//     month_vs_last       this month against last, to the same day
//     biggest_expense     the largest single purchase this month
//     week_vs_last        the last 7 days against the 7 before
//     average_day         what a day costs on average
//   Budget and forecast
//     budget_pace         the budget against the calendar
//     set_budget          a new month with no budget set
//   Salary and income
//     income_change       income against the month before
//   Savings
//     goal_progress       a goal that is well under way
//     goal_almost         a goal within a tenth of done
//     goal_milestone      a goal that just passed 25, 50 or 75%
//     deposit_missed      a goal that was fed monthly, and wasn't this month
//     savings_withdrawal  money taken out of savings
//     goal_idle           a goal with no deposit for two months
//     saving_streak       months in a row with a deposit
//   Debt
//     debt_progress       EMIs paid so far
//     debt_clear_first    which of several loans to finish first
//     loan_cost           what a loan costs beyond what was borrowed
//     debt_load           the share of income that goes to EMIs
//     debt_free_date      when the last loan ends
//   Milestones
//     saved_milestone     savings that just passed a round amount
//
// LEARN CARDS (utils/learnCards.js) are the one thing here that is not an observation:
// short lessons with a picture, ranked beside the rules so they take the page when the
// user's own numbers have nothing notable to say, and fit-to-the-user ones rank higher.
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
  // The biggest single expense must be at least this share of the month's spend
  // to be worth naming, and the month needs at least this many expenses.
  BIGGEST_EXPENSE_MIN_SHARE: 0.15,
  BIGGEST_EXPENSE_MIN_COUNT: 5,
  // Lines on the biggest_expense receipt.
  RECEIPT_ROWS: 5,
  // Loans on the debt_clear_first bars.
  LOAN_BARS_MAX: 5,
  // Budget pace: how many percentage points ahead of (or behind) the calendar the
  // budget has to be before it's worth mentioning, and how far into the month.
  BUDGET_MIN_DAY: 5,
  BUDGET_AHEAD_POINTS: 15,
  BUDGET_BEHIND_POINTS: 20,
  // Goals and loans.
  GOAL_MIN_PERCENT: 25,
  // A loan is worth saying costs more than was borrowed once the extra is at least
  // this share of what was borrowed.
  LOAN_EXTRA_MIN_SHARE: 0.05,
  // The last-7-days comparison needs this many days with something logged in each week.
  WEEK_MIN_LOGGED_DAYS: 4,
  WEEK_CHANGE_PCT: 10,
  WEEK_MIN_BASE: 1000,
  // A "small spend" is at most this much (rupees); worth saying once there are this many
  // and they make up this share of the month's spending.
  // EMIs against income: worth saying from this share of the year's average income.
  DEBT_LOAD_MIN_PCT: 20,
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
  // Calendar pages on the saving_streak picture, at most (two rows of three).
  STREAK_PAGES_MAX: 6,
  SAVED_MILESTONES: [10000, 25000, 50000, 100000, 250000, 500000, 1000000],
  SAVED_WINDOW_DAYS: 14,
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
  // Learn cards. A lesson worth knowing beats the weak observations (about 45 to 57)
  // but not a notable one; a lesson that fits the user's own data beats the ordinary
  // ones (to about 66). They rest longer than a rule, as a lesson is not news.
  LEARN_SCORE: 58,
  LEARN_TRIGGERED_SCORE: 67,
  LEARN_COOLDOWN_DAYS: 21,
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

// budget_pace's picture: the budget as a stack of coins, the used share red, and the
// overspend spilling off the top. Beside the text, with the share as its headline.
const budgetVisual = (used, tone) => ({ type: 'budgetCoins', used, headline: `${used}%`, tone, caption: 'of your budget used' })

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
  // The month's largest few, biggest first: the receipt the biggest_expense insight draws.
  const topExpenses = [...monthExpenses].sort((a, b) => b.amount - a.amount).slice(0, T.RECEIPT_ROWS)

  // Budget pace: how much of the budget is used against how much of the month has
  // gone. Only with a budget set.
  const budgetAmount = budget && budget.amount > 0 ? budget.amount : null
  const budgetUsedPct = budgetAmount ? Math.round((spendThisMonth / budgetAmount) * 100) : null
  const monthElapsedPct = Math.round((dayOfMonth / monthLength) * 100)

  // This year's completed months, for the monthly averages below.
  const yearCompleted = completedKeys.filter(k => k.startsWith(String(year)))

  // This year's monthly averages, for the Summary page: the average over this year's
  // completed months that actually have spending (or income) logged in them, so a
  // month with nothing logged doesn't drag a figure down. Null until a month has one.
  const avgOver = (keys, by) => {
    const vals = keys.map(k => by[k] || 0).filter(v => v > 0)
    return vals.length ? sum(vals) / vals.length : null
  }
  const yearAvgSpend = avgOver(yearCompleted, spendByMonth)
  const yearAvgIncome = avgOver(yearCompleted, incomeByMonth)

  // The last completed month, when it was logged well enough to trust.
  const completedSpend = completedKeys
    .filter(k => loggedDays(k) >= T.MIN_LOGGED_DAYS_FULL)
    .map(k => ({ key: k, spend: spendIn(k) }))
  const lastWellLogged = !!lastKey && completedSpend.some(m => m.key === lastKey)
  const lastSpend = lastWellLogged ? spendIn(lastKey) : null

  // Recent days, for the daily rules. `dayStr(n)` is n days before today.
  const dayStr = (n) => toDateStr(new Date(dateFromStr(todayStr).getTime() - n * 86400000))
  const spendBetween = (a, b) => sum(expenses.filter(t => t.date >= a && t.date <= b).map(t => t.amount))
  const daysLoggedBetween = (a, b) => new Set(transactions.filter(t => t.date >= a && t.date <= b).map(t => t.date)).size
  const weekSpend = spendBetween(dayStr(6), todayStr)
  const weekPrevSpend = spendBetween(dayStr(13), dayStr(7))
  const weekLogged = daysLoggedBetween(dayStr(6), todayStr)
  const weekPrevLogged = daysLoggedBetween(dayStr(13), dayStr(7))

  // Income against the month before, and what was left over, for the salary rules.
  const incomeLast = lastKey ? incomeByMonth[lastKey] || 0 : 0
  const incomePrior = priorKey ? incomeByMonth[priorKey] || 0 : 0
  const priorWellLogged = !!priorKey && loggedDays(priorKey) >= T.MIN_LOGGED_DAYS_FULL
  const savingsGoals = (goals || []).filter(g => g.kind !== 'debt')
  const depositMonths = new Set()
  let withdrawnThisMonth = 0
  let withdrawalCount = 0
  for (const g of savingsGoals) {
    for (const e of g.entries || []) {
      if (e.date > todayStr) continue
      if (e.type === 'add') {
        depositMonths.add(keyOf(e.date))
      } else {
        if (keyOf(e.date) === curKey) { withdrawnThisMonth += e.amount; withdrawalCount++ }
      }
    }
  }
  // Months in a row, ending now, in which any savings goal got a deposit. This month
  // counts if it already has one; otherwise the run ends with last month.
  let savingStreak = 0
  for (let i = depositMonths.has(curKey) ? curIdx : curIdx - 1; depositMonths.has(indexToKey(i)); i--) savingStreak++
  const streakStartKey = savingStreak ? indexToKey((depositMonths.has(curKey) ? curIdx : curIdx - 1) - savingStreak + 1) : null

  // An average day, this month and last.
  const avgDaySpend = dayOfMonth >= 5 ? spendThisMonth / dayOfMonth : null
  const lastAvgDaySpend = lastWellLogged && lastKey ? spendIn(lastKey) / daysInMonth(Number(lastKey.slice(0, 4)), Number(lastKey.slice(5, 7)) - 1) : null

  // How much has been logged, and what has been saved lately.
  const totalEntries = expenses.length + incomes.length
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
    now, todayStr, dayOfMonth, monthLength, curKey, curLabel: monthNameOf(curKey),
    spendThisMonth, countThisMonth: countByMonth[curKey] || 0,
    completedKeys, lastKey, priorKey, compare,
    biggestExpense, topExpenses,
    budgetAmount, budgetUsedPct, monthElapsedPct,
    yearAvgSpend, yearAvgIncome, monthlySpend,
    goals: goals || [],
    savedTotal, savedRecentNet, openDebts, monthlyEmi,
    weekSpend, weekPrevSpend, weekLogged, weekPrevLogged,
    incomeLast, incomePrior, priorWellLogged, lastWellLogged,
    withdrawnThisMonth, withdrawalCount, savingStreak, streakStartKey,
    avgDaySpend, lastAvgDaySpend, totalEntries,
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
  // 0. first_day — a new account with nothing logged yet.
  //    Observes: no expense or income at all.
  //    Fires: until the first entry, every day (no cooldown), and ahead of everything
  //    else, the learn cards included: before there is any data, the one useful thing
  //    to say is to start writing it down.
  // -------------------------------------------------------------------------
  {
    id: 'first_day',
    cooldown: 0,
    build(f) {
      if (f.totalEntries > 0) return null
      return {
        score: 99,
        variants: ['What gets tracked gets better'],
        description: "Add each spend as it happens. In a week, you'll see where your money goes.",
        // A ledger with today's first line written in, the rest still empty.
        visual: { type: 'ledger', headline: 'Day 1', tone: 'good', caption: 'What gets tracked gets better' },
        quoteKey: 'first_day',
        evidence: {},
      }
    },
  },

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
      // Two coin stacks, last month beside this one, drawn beside the description.
      const visual = {
        type: 'coinCompare',
        headline: `${more ? '+' : '\u2212'}${abs}%`,
        tone: more ? 'bad' : 'good',
        caption: `${more ? 'more' : 'less'} than ${c.prevLabel}`,
        prev: c.prev,
        cur: c.cur,
        prevLabel: c.prevLabel.slice(0, 3),
        curLabel: c.curLabel.slice(0, 3),
      }
      return { score: Math.min(90, 55 + abs / 2), variants, description, visual, quoteKey: more ? 'month_more' : 'month_less', evidence: { ...c, pct } }
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
      const pct = Math.round(share * 100)
      return {
        score: 45 + Math.min(35, share * 60),
        variants: [`Biggest spend: ${name}`],
        // No description: the receipt beside the headline already shows the rest.
        description: null,
        // The month as a receipt, this spend highlighted at the top, beside the text.
        visual: {
          type: 'receipt',
          headline: `${pct}%`,
          tone: 'bad',
          caption: `of ${f.curLabel} went on ${name}`,
          heading: f.curLabel.toUpperCase(),
          rows: f.topExpenses.map(t => ({ label: (t.description || '').trim() || 'Expense', amount: t.amount })),
        },
        evidence: { description: name, amount: b.amount, share: pct },
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
          description: `${money(f.spendThisMonth)} of ${money(f.budgetAmount)}${f.monthLength - f.dayOfMonth > 0 ? `, with ${f.monthLength - f.dayOfMonth} ${f.monthLength - f.dayOfMonth === 1 ? 'day' : 'days'} still left` : ''}.`,
          visual: budgetVisual(used, 'bad'),
          quoteKey: 'budget_over',
          evidence: { used, gone },
        }
      }
      if (used - gone >= T.BUDGET_AHEAD_POINTS) {
        return {
          score: 80,
          variants: [`${used}% of budget used`],
          description: `Only ${gone}% of the month has passed. At this speed, it may run out early.`,
          visual: budgetVisual(used, 'bad'),
          quoteKey: 'budget_ahead',
          evidence: { used, gone },
        }
      }
      if (gone - used >= T.BUDGET_BEHIND_POINTS) {
        return {
          score: 60,
          variants: [`${used}% of budget used`],
          description: `${gone}% of the month has passed, and you've spent ${money(f.spendThisMonth)}. You're doing fine.`,
          visual: budgetVisual(used, 'good'),
          quoteKey: 'budget_behind',
          evidence: { used, gone },
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
        description: `${money(g.saved)} saved of ${money(g.target)}.`,
        // A piggy bank filled to the goal's share, beside the text.
        visual: { type: 'piggy', percent: g.percent, label: g.name, headline: `${Math.round(g.percent)}%`, tone: 'good', caption: `of the way to ${g.name}` },
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
        description: `${d.tenureMonths - d.emisPaid} ${d.tenureMonths - d.emisPaid === 1 ? 'EMI' : 'EMIs'} left.`,
        // One circle per EMI, paid ones ticked, beside the text.
        visual: { type: 'emiTicks', paid: d.emisPaid, total: d.tenureMonths, headline: `${d.emisPaid} of ${d.tenureMonths}`, tone: 'good', caption: `EMIs paid on ${d.name}` },
        evidence: { loan: d.name, paid: d.emisPaid, tenure: d.tenureMonths },
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
      const sorted = [...f.openDebts].sort((a, b) => a.remaining - b.remaining)
      const first = sorted[0]
      const freed = first.debtType === 'emi' && first.emiAmount > 0 ? `${money(first.emiAmount)} a month` : 'that monthly money'
      return {
        score: 66,
        variants: [`Clear ${first.name} first`],
        description: `Then ${freed} is free for the next loan.`,
        // Every open loan by what's left, smallest (the one to clear) on top, beside the text.
        visual: {
          type: 'loanBars',
          headline: money(first.remaining),
          tone: 'bad',
          caption: `left on ${first.name}. Clear it first.`,
          rows: sorted.slice(0, T.LOAN_BARS_MAX).map(d => ({ label: d.name, remaining: d.remaining })),
        },
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
        description: `Borrowed ${money(l.target)}, repaying ${money(l.totalRepayment)} in all.`,
        // A price tag: what was borrowed crossed out, the real price under it.
        visual: { type: 'priceTag', was: money(l.target), now: money(l.totalRepayment), headline: money(l.extraToPay), tone: 'bad', caption: `extra on ${l.name}` },
        quoteKey: 'loan_cost',
        evidence: { loan: l.name, extra: l.extraToPay, borrowed: l.target },
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
        description: `${money(f.weekSpend)} in the last 7 days. ${money(f.weekPrevSpend)} the week before.`,
        // A balance scale, the heavier week lower, beside the text.
        visual: {
          type: 'scale',
          change: pct,
          prevLabel: money(f.weekPrevSpend),
          curLabel: money(f.weekSpend),
          headline: `${more ? '+' : '\u2212'}${abs}%`,
          tone: more ? 'bad' : 'good',
          caption: `${more ? 'more' : 'less'} than last week`,
        },
        quoteKey: more ? 'week_more' : 'week_less',
        evidence: { cur: f.weekSpend, prev: f.weekPrevSpend, pct },
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
        description: `You pay ${money(f.monthlyEmi)} a month in EMIs, against about ${money(f.yearAvgIncome)} earned.${pct >= 40 ? '' : ' Under 40% is usually manageable.'}`,
        quoteKey: pct >= 40 ? 'debt_load_high' : 'debt_load',
        // A stack of income coins, the EMI share of them red, beside the description.
        visual: { type: 'coins', percent: pct, headline: `${pct}%`, tone: 'bad', caption: 'of your income goes to EMIs' },
        evidence: { pct, emi: f.monthlyEmi, income: Math.round(f.yearAvgIncome) },
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
        description: `${money(g.saved)} saved of ${money(g.target)}.`,
        // goal_progress's piggy bank, now nearly full, with one more coin dropping in.
        visual: { type: 'piggy', percent: (g.saved / g.target) * 100, coin: true, label: g.name, headline: money(g.remaining), tone: 'good', caption: `left to finish ${g.name}` },
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
        description: `${money(best.g.saved)} saved of ${money(best.g.target)}.`,
        // A party popper for 25 and 50%, fireworks for 75%, beside the text.
        visual: { type: best.m >= 75 ? 'fireworks' : 'popper', headline: `${best.m}%`, tone: 'good', caption: `of ${best.g.name} reached` },
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
        if (!best || last.date > best.last.date) best = { g, last, months }
      }
      if (!best) return null
      // The last two finished months and this one, each ticked when money went in.
      const shown = [...lastThree.slice(-2), f.curKey]
      return {
        score: 66,
        variants: [`No deposit to ${best.g.name} this month`],
        description: `You add to it most months. Last was ${money(best.last.amount)}, on ${dayOf(best.last.date)} ${monthNameOf(keyOf(best.last.date))}.`,
        visual: {
          type: 'monthTicks',
          months: shown.map(k => ({ label: monthNameOf(k).slice(0, 3), done: best.months.has(k) })),
          headline: money(0),
          tone: 'bad',
          caption: `into ${best.g.name} this month`,
        },
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
        description: `${money(Math.abs(f.incomeLast - f.incomePrior))} ${up ? 'more' : 'less'} than ${monthNameOf(f.priorKey)}.`,
        // The two months as coin stacks, all green, each month's income under its stack.
        visual: {
          type: 'incomeCompare',
          prev: f.incomePrior,
          cur: f.incomeLast,
          prevLabel: monthNameOf(f.priorKey).slice(0, 3),
          curLabel: monthNameOf(f.lastKey).slice(0, 3),
          prevAmount: money(f.incomePrior),
          curAmount: money(f.incomeLast),
          headline: `${up ? '+' : '\u2212'}${Math.abs(pct)}%`,
          tone: up ? 'good' : 'bad',
          caption: `${up ? 'more' : 'less'} income than ${monthNameOf(f.priorKey)}`,
        },
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
        description: `${f.withdrawalCount} ${f.withdrawalCount === 1 ? 'withdrawal' : 'withdrawals'} this month. Savings now ${money(f.savedTotal)}.`,
        // An open safe with coins rolling out, beside the text.
        visual: { type: 'safe', headline: money(f.withdrawnThisMonth), tone: 'bad', caption: 'taken out of savings' },
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
        description: `Last deposit was in ${monthNameOf(keyOf(best.last.date)).slice(0, 3)} ${best.last.date.slice(0, 4)}, of ${money(best.last.amount)}.`,
        // A plant that hasn't been watered, beside the text. A nudge, so neither red nor green.
        visual: { type: 'wilt', label: best.g.name, headline: `${best.days} days`, tone: 'neutral', caption: `since your last deposit to ${best.g.name}` },
        quoteKey: 'goal_idle',
        evidence: { goal: best.g.name, days: best.days },
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
        // The streak's months as calendar pages, all ticked: the same pages as
        // deposit_missed. A long streak shows its latest STREAK_PAGES_MAX months.
        visual: {
          type: 'monthTicks',
          months: Array.from({ length: Math.min(f.savingStreak, T.STREAK_PAGES_MAX) }, (_, i) => {
            const k = indexToKey(keyToIndex(f.streakStartKey) + f.savingStreak - Math.min(f.savingStreak, T.STREAK_PAGES_MAX) + i)
            return { label: monthNameOf(k).slice(0, 3), done: true }
          }),
          headline: `${f.savingStreak} months`,
          tone: 'good',
          caption: 'of saving in a row',
        },
        quoteKey: 'saving_streak',
        evidence: { months: f.savingStreak },
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
        // A road ending at a "debt-free" arch, the last loan named under it.
        visual: {
          type: 'arch',
          label: last.name,
          headline: `${monthNameOf(keyOf(last.estimatedFinishDate)).slice(0, 3)} ${last.estimatedFinishDate.slice(0, 4)}`,
          tone: 'good',
          caption: "you'll be debt-free",
        },
        quoteKey: 'debt_free_date',
        evidence: { loan: last.name, date: last.estimatedFinishDate },
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
      return {
        score: 47,
        variants: [`About ${money(f.avgDaySpend)} a day`],
        description: f.lastAvgDaySpend > 0 ? `Last month: ${money(f.lastAvgDaySpend)} a day.` : null,
        // A taxi meter showing what a day costs, beside the text. A plain fact, so neutral.
        visual: {
          type: 'meter',
          reading: Math.round(f.avgDaySpend).toLocaleString('en-IN'),
          headline: money(f.avgDaySpend),
          tone: 'neutral',
          caption: 'average expense per day',
        },
        quoteKey: 'average_day',
        evidence: { perDay: Math.round(f.avgDaySpend) },
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
        description: `You now have ${money(f.savedTotal)} put away.`,
        // A treasure chest full of coins, beside the text.
        visual: { type: 'chest', headline: money(m), tone: 'good', caption: 'saved, across all your goals' },
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
        description: 'Set a number now and keep to it all month.',
        // A planner page promising "This month I will spend ₹ ___", the usual month
        // pencilled in faintly as a hint, and a button that opens the budget sheet.
        visual: {
          type: 'planner',
          heading: f.curLabel.toUpperCase(),
          hint: (Math.round(f.monthlySpend / 1000) * 1000).toLocaleString('en-IN'),
          headline: money(f.monthlySpend),
          tone: 'neutral',
          caption: 'is your usual month',
          cta: `Set ${f.curLabel} budget`,
        },
        quoteKey: 'set_budget',
        evidence: { monthlySpend: Math.round(f.monthlySpend) },
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
        visual: r.visual ?? null,
        evidence: r.evidence,
      })
    } catch (err) {
      // Skip this rule today; a rule that throws is a bug, so it is reported.
      reportError(err)
    }
  }
  for (const card of LEARN_CARDS) {
    try {
      const r = card.build(facts)
      if (!r) continue
      out.push({
        id: card.id,
        kind: 'learn',
        cooldown: T.LEARN_COOLDOWN_DAYS,
        score: r.triggered ? T.LEARN_TRIGGERED_SCORE : T.LEARN_SCORE,
        text: r.title,
        description: r.description ?? null,
        quoteKey: null,
        visual: r.visual ?? null,
        evidence: r.evidence ?? {},
      })
    } catch (err) {
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
