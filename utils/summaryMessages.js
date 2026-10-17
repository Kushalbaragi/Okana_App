import { money, lakh, nice } from './summaryFacts'

// The closing message of the monthly summary: one message that says what happened this month,
// in the person's own numbers and words, and what to do about it. Each rule below has a
// `when` (is it true this month?), a `priority` (lower is more urgent) and the `text`.
// Plain words, because they are read once, quickly, on the way out.

const goalLine = (f) => f.goal && `${f.goal.name}`

const RULES = [
  // Big purchases
  {
    id: 'big_buy', priority: 10,
    when: f => f.bigBuys.length > 0 && f.over5k.length < 3,
    text: f => `You spent ${money(f.bigBuys[0].amount)} on "${f.titleCase(f.bigBuys[0].desc || 'one purchase')}" in one go. Before the next big buy, wait 28 days. Most wants fade.`,
  },
  {
    id: 'many_big_buys', priority: 12,
    when: f => f.over5k.length >= 3,
    text: f => `You made ${f.over5k.length} purchases over ₹5,000: ${f.over5k.slice(0, 3).map(e => f.titleCase(e.desc || 'Purchase')).join(', ')}. Wait 28 days before the next one.`,
  },

  // Budget
  {
    id: 'over_budget', priority: 20,
    when: f => f.overBy > 0,
    text: f => `You were ${money(f.overBy)} over your ${money(f.budgetAmount)} budget. In ${f.nextLabel}, think twice before each purchase and keep your spending in check.`,
  },
  {
    id: 'budget_pace', priority: 45,
    when: f => f.hasBudget && f.overBy === 0 && f.usedBy15 != null && f.usedBy15 >= 70,
    text: f => `By the 15th you had used ${f.usedBy15}% of your budget. Watch the first two weeks of ${f.nextLabel}. That is where it goes.`,
  },
  {
    id: 'under_budget', priority: 60,
    when: f => f.underBy >= 500 && !!f.goal,
    text: f => `You kept ${money(f.underBy)} of your budget. Move it to ${goalLine(f)} today, or it will get spent.`,
  },
  {
    id: 'no_budget', priority: 30,
    when: f => !f.hasBudgetNow && f.avg3 > 0,
    text: f => `You have no budget for ${f.nextLabel}. Set it at ${money(f.suggestedBudget)}. That is what you spent on average in the last 3 months.`,
  },

  // Compared with before
  {
    id: 'spent_more', priority: 40,
    when: f => f.prevSpent > 0 && f.spent >= f.prevSpent * 1.05,
    text: f => `You spent ${money(f.spent - f.prevSpent)} more than ${f.prevLabel}. Open your list and cut the two biggest items first.`,
  },
  {
    id: 'rising_3', priority: 35,
    when: f => f.rising3,
    text: f => `Your spending went up 3 months in a row: ${money(f.series3.a)}, ${money(f.series3.b)}, ${money(f.series3.c)}. Cut ${money(nice((f.series3.c - f.series3.a) / 2))} next month.`,
  },
  {
    id: 'lowest_month', priority: 70,
    when: f => f.lowest && f.spent > f.lowest.amount * 1.15,
    text: f => `Your lowest month this year was ${f.lowest.name}, at ${money(f.lowest.amount)}. ${f.monthLabel} was ${money(f.spent)}. Aim for ${money(nice((f.spent + f.lowest.amount) / 2, 1000))} in ${f.nextLabel}.`,
  },
  {
    id: 'no_nospend', priority: 75,
    when: f => f.spent > 0 && f.trackedDays >= 20 && f.noSpendDays === 0,
    text: () => 'There was no day without spending this month. Pick 2 days next month where you spend nothing.',
  },
  {
    id: 'spent_less', priority: 64,
    when: f => f.prevSpent > 0 && f.spent <= f.prevSpent * 0.95,
    text: f => `You spent ${money(f.prevSpent - f.spent)} less than ${f.prevLabel}. Put ${money(nice((f.prevSpent - f.spent) * 0.3))} of that into savings now so it stays saved.`,
  },
  {
    id: 'falling_3', priority: 63,
    when: f => f.falling3,
    text: f => `You spent less for 3 months in a row. Raise your savings goal by ${money(nice((f.series3.a - f.series3.c) / 3, 500))} a month while it is easy.`,
  },

  // Habits
  {
    id: 'repeat_buy', priority: 55,
    when: f => !!f.repeatBuy,
    text: f => `You spent on "${f.repeatBuy.name}" ${f.repeatBuy.count} times, ${money(f.repeatBuy.total)} in all. Cut ${f.repeatBuy.cut} of them next month and you save about ${money(f.repeatBuy.each * f.repeatBuy.cut)}.`,
  },
  {
    id: 'small_buys', priority: 58,
    when: f => !!f.smallBuys,
    text: f => `You made ${f.smallBuys.count} small purchases under ₹300, ${money(f.smallBuys.total)} in all. Set a daily limit of ${money(f.smallBuys.limit)} for small things.`,
  },
  {
    id: 'costliest_day', priority: 65,
    when: f => !!f.costliestDay,
    text: f => `${f.costliestDay.name} is your costliest day, about ${money(f.costliestDay.avg)} each. Decide what you will spend the night before.`,
  },
  {
    id: 'payday_week', priority: 50,
    when: f => !!f.payday,
    text: f => `${f.payday.pct}% of your money went out in the week after payday. Move ${money(f.payday.move)} to savings the day your salary comes.`,
  },
  {
    id: 'late_month', priority: 62,
    when: f => !!f.late,
    text: f => `${money(f.late.amount)} of your spending was after the 24th. Set a weekly limit for the last week of ${f.nextLabel}.`,
  },

  // Savings goals
  {
    id: 'goal_untouched', priority: 42,
    when: f => !!f.goal && f.goal.added <= 0 && f.goal.left > 0,
    text: f => {
      const p = f.goalPlan(f.goal, 6)
      return `${f.goal.name} got nothing in ${f.monthLabel}. ${money(p.monthly)} a month finishes it by ${p.finish}. Add it the day your salary comes.`
    },
  },
  {
    id: 'goal_slow', priority: 68,
    when: f => !!f.goal && f.goal.added > 0 && f.goal.percent < 90,
    text: f => {
      const p = f.goalPlan(f.goal, 4)
      return `${f.goal.name} is ${f.goal.percent}% done. ${money(p.monthly)} a month finishes it by ${p.finish}. Set that up now.`
    },
  },
  {
    id: 'no_goals', priority: 28,
    when: f => f.goals.length === 0 && f.spent > 0,
    text: f => `You have no savings goal. Start an emergency fund of 3 months of spending, about ${lakh(Math.round((f.avg3 || f.spent) * 3 / 5000) * 5000)}. Begin with ${money(nice((f.avg3 || f.spent) * 0.04))} a month.`,
  },
  {
    id: 'emergency_low', priority: 27,
    when: f => !!f.emergencyGoal && f.emergencyMonths != null && f.emergencyMonths < 3,
    text: f => {
      const need = (f.avg3 || f.spent) * 3 - f.emergencyGoal.saved
      return `Your emergency fund holds ${money(f.emergencyGoal.saved)}, which is ${f.emergencyMonths.toFixed(1)} months of spending. Aim for 3 months. Add ${money(nice(need / 6))} a month.`
    },
  },

  // Income
  {
    id: 'spent_all', priority: 22,
    when: f => f.income > 0 && f.spent >= f.income * 0.97,
    text: f => `You spent ${money(f.spent)} and earned ${money(f.income)}. Nothing was left over. Cut ${money(nice(f.income * 0.07))} next month, or find extra income.`,
  },
  {
    id: 'spend_90_months', priority: 24,
    when: f => f.over90Months >= 3,
    text: f => `For ${f.over90Months} months you spent over 90% of what you earn. Raising income is the faster fix. Find one way to earn ${money(nice(f.income * 0.07 || 5000, 1000))} more.`,
  },
  {
    id: 'income_drop', priority: 26,
    when: f => f.incomeDrop > 0,
    text: f => `Your income fell ${money(f.incomeDrop)} from ${f.prevLabel}. Cut the same amount from ${f.nextLabel}'s spending before the month starts.`,
  },

  // Loans and EMIs
  {
    id: 'emi_share', priority: 34,
    when: f => f.emiShare != null && f.emiShare > 40,
    text: f => `EMIs took ${f.emiShare}% of your income. Do not take a new loan until that is below 35%.`,
  },
  {
    id: 'loan_ending', priority: 52,
    when: f => !!f.endingLoan && !!f.goal,
    text: f => `${f.endingLoan.name} has ${f.endingLoan.emisRemaining} EMI${f.endingLoan.emisRemaining === 1 ? '' : 's'} left. When it ends, send that ${money(f.endingLoan.emiAmount)} to ${goalLine(f)}, not back to spending.`,
  },
  {
    id: 'loan_ended', priority: 23,
    when: f => !!f.endedLoan,
    text: f => `Your ${f.endedLoan.name} loan ended. You now have ${money(f.endedLoan.emiAmount)} a month free. Move it to savings today before it is spent.`,
  },
  {
    id: 'emi_soon', priority: 48,
    when: f => !!f.soon,
    text: f => `Your next EMI of ${money(f.soon.g.emiAmount)} for ${f.soon.g.name} is due ${f.soon.days === 0 ? 'today' : f.soon.days === 1 ? 'tomorrow' : `in ${f.soon.days} days`}. Keep the money aside now. Do not use it before then.`,
  },

  // Tracking
  {
    id: 'few_entries', priority: 78,
    when: f => f.txCount > 0 && f.txCount < 15,
    text: f => `You logged only ${f.txCount} transactions in ${f.monthLabel}. Log everything for one week to see where your money goes.`,
  },
  {
    id: 'missing_days', priority: 80,
    when: f => f.txCount >= 15 && f.noEntryDays >= 10 && f.txCount < 25,
    text: f => `You added nothing on ${f.noEntryDays} days. Missing days hide spending. Add each day's spending at night.`,
  },

  // Always possible, so the summary never ends on nothing.
  {
    id: 'biggest_item', priority: 999,
    when: f => !!f.biggest,
    text: f => `Your biggest spend in ${f.monthLabel} was "${f.titleCase(f.biggest.desc || 'one purchase')}" at ${money(f.biggest.amount)}. Ask yourself if it was worth it, and plan the next one.`,
  },
  {
    id: 'keep_tracking', priority: 1000,
    when: () => true,
    text: f => `Keep adding what you spend in ${f.nextLabel}, every day. What you can see, you can change.`,
  },
]

// The messages that are true this month, most urgent first, ready to show.
export function messageCandidates(facts) {
  return RULES
    .filter(r => { try { return r.when(facts) } catch { return false } })
    .sort((a, b) => a.priority - b.priority)
    .map(r => { try { return { id: r.id, text: r.text(facts) } } catch { return null } })
    // A line that could not be written, or came out with a hole in it, is dropped.
    .filter(c => c && c.text && !/NaN|undefined|null|Infinity/.test(c.text))
}

export const EMPTY_SUMMARY_HISTORY = { shown: [], byMonth: {} }
const REMEMBER = 8

// Picks the one to show. The same month always gets the same message (opening the summary
// again shows what it showed before), a new month avoids the last 8 shown, and when
// everything that fits has been shown lately it takes the one shown longest ago.
export function pickSummaryMessage(candidates, history, monthId) {
  if (!candidates.length) return { message: null, history }
  const kept = history.byMonth?.[monthId]
  const same = kept && candidates.find(c => c.id === kept)
  if (same) return { message: same, history }

  const recent = history.shown.slice(-REMEMBER)
  const fresh = candidates.find(c => !recent.includes(c.id))
  const message = fresh || candidates.slice().sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))[0]
  return {
    message,
    history: {
      shown: [...history.shown.filter(id => id !== message.id), message.id].slice(-20),
      byMonth: { ...(history.byMonth || {}), [monthId]: message.id },
    },
  }
}
