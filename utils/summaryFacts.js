import { formatCurrency } from './format'

// Everything the monthly summary says is worked out here, from the person's own data,
// in one pass: the facts about the month being looked back on, which the slides and the
// closing message (summaryMessages.js) then read. Pure, so it can be tried with made-up
// months. Nothing here claims what someone saved: only what was tracked in the app.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const monthName = (m) => MONTHS[((m % 12) + 12) % 12]

export const money = (n) => formatCurrency(Math.round(n))

// "₹1.5 lakh" from a lakh up, the plain rupee amount below it.
export function lakh(n) {
  if (n < 100000) return money(n)
  return `₹${(n / 100000).toFixed(1).replace(/\.0$/, '')} lakh`
}

const round = (n, step) => Math.round(n / step) * step

// A suggestion rounded to something a person would actually say: ₹500 steps, never below.
export const nice = (n, step = 500) => Math.max(step, round(n, step))

const titleCase = (s) => s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

const parts = (date) => ({ y: +date.slice(0, 4), m: +date.slice(5, 7) - 1, d: +date.slice(8, 10) })

const prevOf = (m, y) => (m === 0 ? { m: 11, y: y - 1 } : { m: m - 1, y })

function monthLabelAfter(months, now) {
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1)
  return `${monthName(d.getMonth())} ${d.getFullYear()}`
}

// Payments someone has already committed to: a loan (its name, or the word EMI), a bill
// (rent, fees, insurance...), or anything paid last month under the same description at
// about the same amount. None of those is a purchase to think twice about.
const BILL = /\b(emi|loan|rent|fee|fees|tuition|insurance|premium|bill|electricity|maintenance|sip)\b/
function committedMatcher(debts, lastMonth) {
  const names = debts.map(g => (g.name || '').trim().toLowerCase()).filter(Boolean)
  return (desc, amount) => {
    const d = (desc || '').toLowerCase()
    if (BILL.test(d) || names.some(n => d.includes(n))) return true
    return lastMonth.some(p => p.desc === d && Math.abs(p.amount - amount) <= amount * 0.2)
  }
}

export function computeSummaryFacts({ transactions, month, year, budgetInfo, hasBudgetNow, goals = [], debts = [], now = new Date() }) {
  const key = (m, y) => y * 12 + m

  // One pass: every month's spent and income, plus this month's expenses in detail.
  const totals = new Map()
  let firstDate = null
  const anyEntryDays = new Set()
  const expenses = []
  const incomes = []
  let txCount = 0
  for (const tx of transactions) {
    const { y, m, d } = parts(tx.date)
    if (!firstDate || tx.date < firstDate) firstDate = tx.date
    const k = key(m, y)
    const t = totals.get(k) || { spent: 0, income: 0 }
    if (tx.type === 'income') t.income += tx.amount
    else t.spent += tx.amount
    totals.set(k, t)
    if (y === year && m === month) {
      txCount += 1
      anyEntryDays.add(d)
      const row = { desc: (tx.description || '').trim(), amount: tx.amount, day: d, date: tx.date }
      if (tx.type === 'income') incomes.push(row)
      else expenses.push(row)
    }
  }
  const spentOf = (m, y) => totals.get(key(m, y))?.spent || 0
  const incomeOf = (m, y) => totals.get(key(m, y))?.income || 0

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const spent = spentOf(month, year)
  const income = incomeOf(month, year)
  const prev = prevOf(month, year)
  const prevSpent = spentOf(prev.m, prev.y)
  const prevIncome = incomeOf(prev.m, prev.y)

  // The months before this one, newest first, with spending in them.
  const earlier = []
  for (let i = 1, p = prev; i <= 6; i++, p = prevOf(p.m, p.y)) earlier.push({ ...p, spent: spentOf(p.m, p.y), income: incomeOf(p.m, p.y) })
  const last3 = earlier.slice(0, 3).filter(e => e.spent > 0)
  const avg3 = last3.length ? last3.reduce((s, e) => s + e.spent, 0) / last3.length : 0
  const p2 = earlier[1]
  const series3 = { a: p2.spent, b: prevSpent, c: spent } // oldest to newest
  const rising3 = series3.a > 0 && series3.b > series3.a && series3.c > series3.b
  const falling3 = series3.c > 0 && series3.a > series3.b && series3.b > series3.c
  const over90Months = [{ spent, income }, ...earlier.slice(0, 3)].filter(e => e.income > 0 && e.spent >= 0.9 * e.income).length

  // Lowest earlier month this year, for "you have done better than this".
  let lowest = null
  for (let m = 0; m < month; m++) {
    const s = spentOf(m, year)
    if (s > 0 && (!lowest || s < lowest.amount)) lowest = { name: monthName(m), amount: s }
  }

  const lastMonthBuys = []
  for (const tx of transactions) {
    if (tx.type === 'income') continue
    const p = parts(tx.date)
    if (p.m === prev.m && p.y === prev.y) lastMonthBuys.push({ desc: (tx.description || '').trim().toLowerCase(), amount: tx.amount })
  }
  const isCommitted = committedMatcher(debts, lastMonthBuys)
  const byDay = new Array(daysInMonth).fill(0)
  expenses.forEach(e => { byDay[e.day - 1] += e.amount })
  // Only days since the person began adding things count as days with no spending: before that
  // there was nothing being tracked, so a quiet day and an untracked one look the same.
  const first = firstDate ? parts(firstDate) : null
  const trackedFrom = !first || key(first.m, first.y) < key(month, year) ? 1 : key(first.m, first.y) === key(month, year) ? first.d : daysInMonth + 1
  const noSpendDays = byDay.slice(trackedFrom - 1).filter(v => v === 0).length
  const prevTracked = firstDate && key(first.m, first.y) < key(prev.m, prev.y)
  const prevDays = new Date(prev.y, prev.m + 1, 0).getDate()
  const prevByDay = new Array(prevDays).fill(0)
  for (const tx of transactions) {
    if (tx.type === 'income') continue
    const p = parts(tx.date)
    if (p.m === prev.m && p.y === prev.y) prevByDay[p.d - 1] += tx.amount
  }
  const prevNoSpendDays = prevTracked && spentOf(prev.m, prev.y) > 0 ? prevByDay.filter(v => v === 0).length : null

  // Purchases, leaving out loans, bills and repeat payments.
  const buys = expenses.filter(e => !isCommitted(e.desc, e.amount))
  const bigLine = Math.max(5000, spent * 0.2)
  const bigBuys = buys.filter(e => e.amount >= bigLine).sort((a, b) => b.amount - a.amount)
  const over5k = buys.filter(e => e.amount >= 5000).sort((a, b) => b.amount - a.amount)
  const biggest = buys.slice().sort((a, b) => b.amount - a.amount)[0] || null

  // The description someone keeps coming back to.
  const groups = new Map()
  for (const e of buys) {
    if (!e.desc) continue
    const g = groups.get(e.desc.toLowerCase()) || { desc: e.desc, count: 0, total: 0 }
    g.count += 1
    g.total += e.amount
    groups.set(e.desc.toLowerCase(), g)
  }
  const repeat = [...groups.values()].sort((a, b) => b.count - a.count)[0]
  const repeatBuy = repeat && repeat.count >= 6 && repeat.total >= 1500 ? {
    name: titleCase(repeat.desc), count: repeat.count, total: repeat.total,
    cut: Math.max(2, Math.round(repeat.count * 0.4)), each: repeat.total / repeat.count,
  } : null

  const small = buys.filter(e => e.amount < 300)
  const smallTotal = small.reduce((s, e) => s + e.amount, 0)
  const smallBuys = small.length >= 40 ? { count: small.length, total: smallTotal, limit: nice(smallTotal / daysInMonth * 0.7, 50) } : null

  // The weekday that costs the most, per day it happened.
  const dowSum = new Array(7).fill(0)
  const dowCount = new Array(7).fill(0)
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay()
    dowSum[dow] += byDay[d - 1]
    dowCount[dow] += 1
  }
  const dowAvg = dowSum.map((s, i) => (dowCount[i] ? s / dowCount[i] : 0))
  const topDow = dowAvg.indexOf(Math.max(...dowAvg))
  const dayAvg = spent / daysInMonth
  // Patterns (a costly weekday, payday, the end of the month) need enough entries to be
  // patterns and not just where a few entries happened to fall.
  const enough = expenses.length >= 10
  const costliestDay = enough && spent > 0 && dowAvg[topDow] >= dayAvg * 1.4 && dowAvg[topDow] >= 500
    ? { name: WEEKDAYS[topDow], avg: dowAvg[topDow] } : null

  // What went out in the week after the biggest income of the month.
  let payday = null
  if (enough && incomes.length && spent > 0) {
    const pay = incomes.slice().sort((a, b) => b.amount - a.amount)[0]
    const week = expenses.filter(e => e.day >= pay.day && e.day < pay.day + 7).reduce((s, e) => s + e.amount, 0)
    const pct = Math.round((week / spent) * 100)
    if (pct >= 35) payday = { pct, move: nice(pay.amount * 0.1) }
  }

  const lateSpend = expenses.filter(e => e.day >= 25).reduce((s, e) => s + e.amount, 0)
  const late = enough && daysInMonth >= 28 && spent > 0 && lateSpend / spent >= 0.35 ? { amount: lateSpend } : null

  // Budget.
  // A budget only counts when it is a real amount: a missing or zero one means none was set.
  const hasBudget = Number(budgetInfo?.amount) > 0
  const budgetAmount = hasBudget ? Number(budgetInfo.amount) : null
  // The spending the budget is measured against: the figure given, or else the month's own.
  const budgetSpent = hasBudget ? (Number.isFinite(Number(budgetInfo.spent)) && budgetInfo.spent != null ? Number(budgetInfo.spent) : spent) : null
  const overBy = hasBudget && budgetSpent > budgetAmount ? budgetSpent - budgetAmount : 0
  const underBy = hasBudget && budgetSpent < budgetAmount ? budgetAmount - budgetSpent : 0
  const by15 = expenses.filter(e => e.day <= 15).reduce((s, e) => s + e.amount, 0)
  const usedBy15 = hasBudget && budgetAmount > 0 ? Math.round((by15 / budgetAmount) * 100) : null

  // Goals: the active savings goals, the closest to done first.
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const addedIn = (g) => (g.entries || [])
    .filter(e => String(e.date).startsWith(monthStr))
    .reduce((s, e) => s + (e.type === 'add' ? e.amount : -e.amount), 0)
  const activeGoals = goals
    .filter(g => !g.completedAt && g.target > 0)
    .filter(g => (g.name || '').trim())
    .map(g => ({ id: g.id, name: g.name.trim(), saved: g.saved || 0, target: g.target, percent: Math.max(0, Math.min(100, Math.round(Number.isFinite(g.percent) ? g.percent : ((g.saved || 0) / g.target) * 100))), left: Math.max(0, g.target - (g.saved || 0)), added: addedIn(g) }))
    .sort((a, b) => b.percent - a.percent)
  const goal = activeGoals.find(g => g.percent < 100) || null
  const goalPlan = (g, months) => {
    const monthly = nice(g.left / months)
    return { monthly, finish: monthLabelAfter(Math.max(1, Math.ceil(g.left / monthly)), now) }
  }
  const emergencyGoal = activeGoals.find(g => /emergency/i.test(g.name)) || null
  const emergencyMonths = emergencyGoal && (avg3 || spent) ? emergencyGoal.saved / (avg3 || spent) : null

  // Loans.
  const loans = debts.filter(g => g.debtType === 'emi' && !g.completedAt && g.emiAmount > 0)
  const emiTotal = loans.reduce((s, g) => s + g.emiAmount, 0)
  const emiShare = income > 0 && emiTotal > 0 ? Math.round((emiTotal / income) * 100) : null
  const endingLoan = loans.filter(g => g.emisRemaining > 0 && g.emisRemaining <= 4).sort((a, b) => a.emisRemaining - b.emisRemaining)[0] || null
  const emisPaid = loans.filter(g => (g.entries || []).some(e => e.type === 'add' && String(e.date).startsWith(monthStr))).map(g => g.name).filter(Boolean)
  const endedLoan = debts.find(g => g.completedAt && g.emiAmount > 0 && String(g.completedAt).startsWith(monthStr)) || null
  const soon = loans
    .filter(g => g.nextEmiDate)
    .map(g => ({ g, days: Math.round((new Date(g.nextEmiDate) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000) }))
    .filter(x => Number.isFinite(x.days) && x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)[0] || null
  const finishDates = loans.map(g => g.estimatedFinishDate).filter(d => typeof d === 'string' && /^\d{4}-\d{2}/.test(d)).sort()
  const debtFree = finishDates.length ? finishDates[finishDates.length - 1] : null

  return {
    month, year, monthLabel: monthName(month), prevLabel: monthName(prev.m),
    nextLabel: monthName(month + 1),
    daysInMonth, txCount,
    spent, income, prevSpent, prevIncome, avg3, rising3, falling3, over90Months, lowest,
    series3,
    noSpendDays, prevNoSpendDays, noEntryDays: daysInMonth - anyEntryDays.size, trackedDays: enough ? Math.max(0, daysInMonth - trackedFrom + 1) : 0,
    bigBuys, over5k, biggest, repeatBuy, smallBuys, costliestDay, payday, late,
    hasBudget, budgetAmount, budgetSpent, overBy, underBy, usedBy15, hasBudgetNow: !!hasBudgetNow,
    suggestedBudget: nice(avg3 || spent, 1000),
    dailyLimit: hasBudget && budgetAmount > 0 ? nice(budgetAmount / daysInMonth, 50) : null,
    goals: activeGoals, goal, goalPlan, emergencyGoal, emergencyMonths,
    loans, emiTotal, emiShare, emisPaid, endingLoan, endedLoan, soon, debtFree,
    incomeDrop: prevIncome > 0 && income > 0 && prevIncome - income >= prevIncome * 0.05 ? prevIncome - income : 0,
    titleCase,
  }
}
