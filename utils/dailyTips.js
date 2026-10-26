// The quote under the insight on the Insights page: a few words that fit what the
// insight just said and leave the person a little more motivated. The day of the year
// picks which one of the insight's list shows.
//
// Rules for adding one: very short; the plainest, most common words, the way you would
// say it to a friend; about the things that matter most here: setting a budget, saving
// more, total saved, an emergency fund, health insurance, a debt free life, financial
// freedom and early retirement. Nothing about investing, products or markets, and no
// author named.
const QUOTES = {
  // Set a budget
  set_budget: [
    'Make a budget. Be in charge of your money.',
    'A budget tells your money where to go.',
    'No budget? Money just disappears.',
    'Plan your money before it plans you.',
    'A budget is not a cage. It is a map.',
    'Start small. Just pick a number.',
    'Give every rupee a job.',
    'A plan today saves you stress later.',
    'You cannot save what you never planned.',
    'Set it once. Stop worrying every day.',
    'Those who plan their money keep more of it.',
    'A budget gives you freedom, not limits.',
    'Know your number. Stay below it.',
    'A small budget is better than none.',
    'Today is a good day to start.',
    'Take your money life seriously.',
    'A money plan is not a dream. Write it down.',
  ],
  budget_over: ['Over budget? Slow down for a few days.'],
  budget_ahead: ['Spend slower. The month is long.', 'Small cuts now save the month.'],
  budget_behind: ['You are doing well. Save the extra.', 'Under budget. Move the extra to savings.'],

  // Save more
  saving_streak: [
    'Do not break the chain.',
    'Saving every month beats saving big once.',
    'Saving a little, every month, beats everything.',
  ],
  deposit_missed: ['Missed a month? Start again today.', 'Even a small deposit keeps the habit.'],
  first_day: ['What gets measured gets managed.'],
  month_less: ['A lighter month. Your future self says thanks.'],
  month_more: ["Every rupee you don't spend is a rupee that works for you."],
  biggest_expense: ['Think twice before a big buy.', 'Fix it before you replace it.'],
  average_day: ['Small daily spends add up fast.'],
  week_more: ['A costly week? Make the next one light.'],
  week_less: ['A light week. Well done.'],

  // Total saved
  goal_almost: ['Almost there. Do not stop now.', 'One more push.'],
  goal_milestone: ['Well done. Keep going.', 'Each step makes the next one easier.'],
  goal_idle: [
    'Your goal is waiting. Add a little today.',
    'Start again with any amount.',
    'Every excuse today costs you tomorrow.',
  ],

  // Emergency fund
  savings_withdrawal: ['Spent your savings? Refill them first.', 'Pay yourself back before the next want.'],

  // Health insurance

  // Debt-free life
  debt_free_date: ['Real freedom is not having debt in life.'],
  debt_progress: [
    'One step at a time.',
    'Each payment makes you lighter.',
    'You are getting closer. Keep going.',
    'Slow progress is still progress. Keep going.',
    'Every EMI paid is a win.',
  ],
  debt_clear_first: [
    'Clear debt first. Then you are free.',
    'Debt costs you every day.',
    'The sooner you pay, the less you owe.',
    'Pay the costly one first.',
    'Owe less. Own more.',
  ],
  loan_cost: ['A loan costs more than its price.', 'If you need an EMI, wait.'],
  debt_load: [
    'Too many EMIs leave no room to live.',
    'Keep your EMIs small.',
    'Own things that pay you. Skip things that cost you.',
  ],
  debt_load_high: ['A big debt keeps you stuck in your job.', 'Pay down debt. Gain choices.'],

  // Financial freedom and early retirement
  income_up: [
    'More pay? Save more, do not spend more.',
    'A raise is a chance to be free sooner.',
    'Save the raise before you spend it.',
    'Earn more, keep more.',
    'Let your savings grow before your spending does.',
    'Freedom is earning more than you spend.',
  ],
  saved_milestone: [
    'Save today. Retire early tomorrow.',
    'Early retirement starts with small savings.',
    'Every rupee saved is a day of freedom later.',
    'You are closer to freedom now.',
    'Do not work forever. Save now.',
    'The 9 to 5 gets easier to leave with every rupee.',
    'Retire early by living simple today.',
    'Imagine waking up with no job to rush to.',
    'Do not spend your whole life at a 9 to 5. Plan to retire early.',
  ],
  goal_progress: [
    'Financial freedom is owning your time.',
    'Save now so you do not need to work later.',
    'Do not trade your whole life for a salary.',
    'Freedom is having enough, not having more.',
    'Every goal brings you closer to freedom.',
    'Dream big. Save small. Start today.',
    'Freedom is the choice to say no.',
    'You are building a life you own.',
    'Wealth begins with steady choices.',
  ],
  income_down: ['Tough month. Keep saving, even a little.', 'Cut wants first. Keep the habit.'],
}

// The quote for an insight's `quoteKey`, or null when it has none.
export function quoteFor(key, day = 0) {
  const list = QUOTES[key]
  return list ? list[((day % list.length) + list.length) % list.length] : null
}
