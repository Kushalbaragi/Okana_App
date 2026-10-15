// The quote under the insight on the Summary page: a short, familiar saying that fits what
// the insight just said. Not a daily rotation, and not generic: each insight has its own,
// so the line always has something to do with the user's own situation.
//
// Rules for adding one: a saying people already know, in plain words; nothing about
// investing, products or markets; no author named (these are proverbs, not citations).
const QUOTES = {
  month_less: ['A rupee saved is a rupee earned.'],
  month_more: ['Little expenses add up to big ones.'],
  record_high: ['Look after the paise and the rupees will look after themselves.'],
  record_low: ['Slow and steady wins the race.'],
  biggest_expense: ['Look before you leap.'],
  weekday_pattern: ['What gets measured gets managed.'],
  budget_over: ['A small leak can sink a great ship.'],
  budget_ahead: ['Better safe than sorry.'],
  budget_behind: ['Slow and steady wins the race.'],
  payday_effect: ['Save first, spend what is left.'],
  no_spend_days: ['Waste not, want not.'],
  kept_up: ['Small steps every day add up.'],
  kept_down: ['Cut your coat according to your cloth.'],
  goal_progress: ['Well begun is half done.'],
  debt_progress: ['One step at a time.'],
  goal_pace: ["Rome wasn't built in a day."],
  emergency_cover: ['Save for a rainy day.'],
  debt_clear_first: ['A journey of a thousand miles begins with a single step.'],
  loan_cost: ['Borrowing is easy. Repaying is the real work.'],
  month_forecast: ['Forewarned is forearmed.'],
  week_more: ['Little expenses add up to big ones.'],
  week_less: ['Consistency is the key.'],
  emi_soon: ['A stitch in time saves nine.'],
  debt_load: ["Don't bite off more than you can chew."],
  debt_load_high: ["Don't bite off more than you can chew."],
  saving_rate: ['Pay yourself first.'],
  goal_almost: ['Finish what you start.'],
  goal_milestone: ['Well begun is half done.'],
  deposit_missed: ['Little and often fills the purse.'],
  income_up: ['Rising income is a chance to save more.'],
  income_down: ['Every month is a fresh start.'],
  savings_withdrawal: ['Save for a rainy day.'],
  goal_idle: ['Better late than never.'],
  goal_whatif: ['A little extra goes a long way.'],
  saving_streak: ['Slow and steady wins the race.'],
  total_saved: ['A penny saved is a penny earned.'],
  debt_free_date: ['There is light at the end of the tunnel.'],
  emi_freed: ['Every cloud has a silver lining.'],
  biggest_day: ['Easy come, easy go.'],
  year_vs_last_year: ['Time and tide wait for no man.'],
  average_day: ['One day at a time.'],
  entries_milestone: ['Rome was not built in a day.'],
  tracking_days: ['Practice makes perfect.'],
  saved_milestone: ['Great oaks from little acorns grow.'],
  set_budget: ['Failing to plan is planning to fail.'],
  sunday_check: ['A stitch in time saves nine.'],
  new_financial_year: ['A new year, a fresh start.'],
  financial_year_end: ['Better late than never.'],
  festival_season: ['Plan ahead and celebrate without worry.'],
  subscription_check: ['Out of sight, out of mind.'],
  card_interest: ['Debt is a heavy load to carry.'],
  health_insurance: ['Health is wealth.'],
  term_insurance: ['Hope for the best, prepare for the worst.'],
}

// The quote for an insight's `quoteKey`, or null when it has none.
export function quoteFor(key, day = 0) {
  const list = QUOTES[key]
  return list ? list[((day % list.length) + list.length) % list.length] : null
}
