// ============================================================================
// Learn cards: what the insight engine shows when the user's own numbers have
// nothing notable to say, or when a short lesson fits their situation better.
// ============================================================================
//
// Unlike the rules in insightEngine.js, these are NOT observations. They teach
// something general ("what to check before you buy health cover"). Pure functions
// of the facts: no React, storage or network.
//
// Each card: { id, build(facts) -> null | { triggered, title, description, visual, evidence? } }
//   triggered   true when the card fits THIS user's data (no emergency fund, has a
//               loan...); false for a lesson that is simply worth knowing. The engine
//               turns it into a score, so a triggered card outranks an untriggered one.
//   visual      the picture drawn beside or above the text: { type, ...props }, where
//               `type` names a picture in components/InsightVisual.js (see renderPicture
//               in SummarySection.js). `checks`, `sum`, `note`, `table`, `cta` and `goal`
//               add the lines, button and pre-filled goal under the description.
//
// RULES FOR A CARD
//   - Teach HOW TO CHOOSE; never name a product or rank one. Recommending products
//     is regulated (SEBI for investments, IRDAI for insurance).
//   - Every number on a card is worked out here from the user's data or a stated
//     example, never typed in as if it were a fact about the market. Anything that
//     is an assumption or an example says so in the card's `note`.
//   - Rules that change (rates, limits) stay out of the card, or the note says
//     to check the latest.
//   - Calm, plain, short. Same voice as the rules.

const rupees = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

const trim = (x) => x.toFixed(1).replace(/\.0$/, '')

// ₹1.5 lakh, ₹20 lakh, ₹1.2 crore; under a lakh it is the plain amount.
export const short = (n) => {
  if (n >= 1e7) return `₹${trim(n / 1e7)} crore`
  if (n >= 1e5) return `₹${trim(n / 1e5)} lakh`
  return rupees(n)
}

// What `monthly` put away every month grows to after `years`, at `annualPct` a year,
// compounded monthly, each deposit made at the start of the month.
export const futureValue = (monthly, annualPct, years) => {
  const r = annualPct / 100 / 12
  const n = Math.round(years * 12)
  return monthly * (((1 + r) ** n - 1) / r) * (1 + r)
}

// A loan's total interest, length in months and balance after each month, with `extra`
// paid on top of the EMI every month.
export const loanCost = (principal, annualPct, months, extra = 0) => {
  const r = annualPct / 100 / 12
  const emi = (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1)
  let balance = principal
  let interest = 0
  let m = 0
  const balances = [principal]
  while (balance > 0.5 && m < months * 2) {
    const i = balance * r
    interest += i
    balance = balance + i - (emi + extra)
    m++
    balances.push(Math.max(0, balance))
  }
  return { emi, interest, months: m, balances }
}

// A growing balance, year by year from 0 to `years`.
const yearly = (monthly, annualPct, years) =>
  Array.from({ length: years + 1 }, (_, y) => (y === 0 ? 0 : futureValue(monthly, annualPct, y)))

const roundTo = (n, step) => Math.round(n / step) * step

// A monthly amount to illustrate with: a tenth of the user's average income, in steps
// of ₹500, or ₹2,000 when we don't know their income yet.
const sampleMonthly = (f) => (f.yearAvgIncome > 0 ? Math.max(500, roundTo(f.yearAvgIncome * 0.1, 500)) : 2000)

export const LEARN_CARDS = [
  // Savings against six months of spending. Fires when it falls short.
  {
    id: 'learn_emergency_fund',
    build(f) {
      if (!(f.monthlySpend > 0)) return null
      const target = f.monthlySpend * 6
      if (f.savedTotal >= target) return null
      const months = f.savedTotal / f.monthlySpend
      return {
        triggered: true,
        title: months < 1 ? 'Your savings cover less than a month' : `Your savings cover ${trim(months)} months`,
        description: 'A common target is six months of spending. If your job stops or a hospital bill arrives, that money keeps life going without a loan. Start small: even one month put aside is a strong first step.',
        // Six month boxes, filled as far as the savings reach, and under the description
        // the sum behind them in round figures: the usual month to the nearest ₹1,000.
        visual: {
          type: 'monthsCover',
          months,
          label: '6-month emergency fund',
          sum: (() => {
            const month = Math.round(f.monthlySpend / 1000) * 1000
            return [
              { label: 'Your usual month', value: rupees(month) },
              { label: '× 6 months', value: rupees(month * 6), strong: true, rule: true },
              { label: 'Saved so far', value: rupees(f.savedTotal), tone: 'good' },
              { label: 'Still to save', value: rupees(Math.max(0, month * 6 - f.savedTotal)), tone: 'bad', rule: true },
            ]
          })(),
        },
        evidence: { months: Math.round(months * 10) / 10 },
      }
    },
  },

  // The five money milestones, in order. For everyone.
  {
    id: 'learn_five_milestones',
    build() {
      return {
        triggered: false,
        title: 'Five money milestones',
        description: 'Reach these in order and your money stops being a worry. Each one makes the next easier.',
        // A five-step staircase to a flag, and the milestones numbered under it.
        visual: {
          type: 'stairs',
          label: 'One step at a time',
          numbered: true,
          checks: [
            { label: '6-month emergency fund', detail: 'Six months of spending, kept aside for surprises.' },
            { label: 'No loans', detail: 'Clear every loan and card balance.' },
            { label: 'Health insurance', detail: "So one hospital bill can't undo your savings." },
            { label: 'Term insurance', detail: 'So the people who depend on you are covered.' },
            { label: 'Early retirement savings', detail: 'Invest every month to get out of the 9-to-5 trap.' },
          ],
        },
        evidence: {},
      }
    },
  },

  // Don't use a credit card: it feels like free money and leads to loans. For everyone.
  {
    id: 'learn_no_credit_card',
    build() {
      return {
        triggered: false,
        title: 'Say No to Credit Card',
        description: 'A card feels like free money. You chase rewards, spend more than you planned, and lose track of where it goes. An unpaid bill is often the first step toward a loan.',
        // A card cut in half, and what to do whether you have one or not.
        visual: {
          type: 'cardCut',
          label: 'Cut it',
          plain: true,
          checks: [
            { label: 'Already have one?', detail: 'Clear the full bill, then block the card.' },
            { label: "Don't have one?", detail: "Don't start. Pay with money you have." },
          ],
        },
        evidence: {},
      }
    },
  },

  // Term cover as a multiple of the user's income.
  {
    id: 'learn_term_cover',
    build(f) {
      if (!(f.yearAvgIncome > 0)) return null
      const year = f.yearAvgIncome * 12
      return {
        triggered: false,
        title: 'Term cover is usually 10 to 15 years of income',
        description: `If anyone depends on you, such as a partner, children or parents, a term plan pays them if you're not there, so the home keeps running. For you, that's about ${short(year * 10)} to ${short(year * 15)}. Age, loans and who depends on you change the number. This isn't advice.`,
        // A family under a shield, and a line for those it doesn't apply to.
        visual: {
          type: 'familyShield',
          label: 'Cover for the people who depend on you',
          note: "If no one depends on you, you can skip this for now.",
        },
        evidence: { year: Math.round(year) },
      }
    },
  },

  // What to compare in health cover. No product is named and no figure is claimed.
  {
    id: 'learn_health_cover',
    build() {
      return {
        triggered: false,
        title: 'Check four things before you pick health cover',
        description: 'A single hospital stay can wipe out years of savings. Cover that looks cheap can pay out far less when you need it, so look past the price at these four.',
        // A clipboard with a heart and ticks, and the four checks under the description.
        visual: {
          type: 'clipboard',
          label: 'Your health cover checklist',
          checks: [
            { label: 'Claim settlement ratio', detail: 'The share of claims the insurer paid. Higher is better.' },
            { label: 'Room rent limit', detail: 'A cap here can shrink the whole claim.' },
            { label: 'Waiting periods', detail: 'Existing illnesses can take years to be covered.' },
            { label: 'Cashless hospitals', detail: 'Check that hospitals near you are on the list.' },
          ],
        },
        evidence: {},
      }
    },
  },

  // The 50/30/20 split of a salary, worked out on the user's own average income (or an
  // example salary until there is one). Fits best when they keep less than a fifth of it.
  {
    id: 'learn_50_30_20',
    build(f) {
      const own = f.yearAvgIncome > 0
      const income = own ? roundTo(f.yearAvgIncome, 1000) : 50000
      const keepsLittle = own && f.yearAvgSpend > 0 && f.yearAvgSpend > f.yearAvgIncome * 0.8
      return {
        triggered: keepsLittle,
        title: '50-30-20 budgeting rule',
        description: 'Split each salary three ways: half for needs, 30% for wants, and 20% saved before you spend.',
        // The salary as one bar cut 50/30/20, and the split in rupees under the description.
        visual: {
          type: 'splitBar',
          parts: [
            { label: 'Needs', pct: 50 },
            { label: 'Wants', pct: 30 },
            { label: 'Save', pct: 20, good: true },
          ],
          sum: [
            { label: own ? 'Your usual income' : 'A salary of', value: rupees(income), strong: true },
            { label: 'Needs · 50%', value: rupees(income * 0.5), rule: true },
            { label: 'Wants · 30%', value: rupees(income * 0.3) },
            { label: 'Save · 20%', value: rupees(income * 0.2), tone: 'good' },
          ],
          note: own
            ? 'Needs are rent, food, bills and EMIs. Wants are everything else. A guide, not a law: start where you can.'
            : 'An example salary. Log your income to see your own split.',
        },
        evidence: { income, own },
      }
    },
  },

  // A fixed ₹15,000 a month over twenty-five years, the same for everyone.
  {
    id: 'learn_small_savings',
    build() {
      const years = 25
      const rate = 10
      const monthly = 15000
      const final = futureValue(monthly, rate, years)
      const put = monthly * years * 12
      return {
        triggered: false,
        title: `${rupees(monthly)} a month can grow to ${short(final)}`,
        description: `You'd put in ${short(put)} over ${years} years. Time adds the rest: what you've earned starts earning too, and the last few years grow the most.`,
        // What goes in beside what it becomes, as two coin stacks, and the sum under the
        // description.
        visual: {
          type: 'growStacks',
          put,
          final,
          putLabel: short(put),
          finalLabel: short(final),
          sum: [
            { label: 'Each month', value: rupees(monthly) },
            { label: `Put in over ${years} years`, value: rupees(put), strong: true, rule: true },
            // Rounded to the nearest ₹1,000: it's an estimate, not a promise.
            { label: `Grows to, at ${rate}% a year`, value: rupees(Math.round(final / 1000) * 1000), tone: 'good' },
          ],
          note: `Shown at ${rate}% a year. Returns are not guaranteed, and inflation will change what it's really worth.`,
        },
        evidence: { monthly },
      }
    },
  },

  // A pause before a big purchase. Fits best right after one.
  {
    id: 'learn_before_you_buy',
    build(f) {
      const big = f.biggestExpense && f.monthlySpend > 0 && f.biggestExpense.amount >= f.monthlySpend * 0.2
      return {
        triggered: !!big,
        title: 'Ask three things before a big purchase',
        description: 'Most regrets come from buying fast, in the moment. A short pause costs nothing, and the want often fades on its own. Before anything big, run it past these three.',
        // A full cart on pause, and the three checks under the description.
        visual: {
          type: 'cartPause',
          label: 'Pause before you pay',
          checks: [
            { label: 'Wait 48 hours', detail: 'If you still want it, it is a real want.' },
            { label: 'Count the work', detail: 'How many days of pay does it cost?' },
            { label: 'Look for another way', detail: 'Could you borrow it, rent it or buy it used?' },
          ],
        },
        evidence: {},
      }
    },
  },

  // A second income, started small.
  {
    id: 'learn_side_income',
    build() {
      return {
        triggered: false,
        title: 'Build a second income next to your job',
        description: "Saving has a ceiling; earning more doesn't. Freelancing, teaching, coaching or making content can start with a few hours after work. Grow it alongside your salary, and one day it may be big enough to replace your 9-to-5.",
        // A laptop at night with coins stacking beside it, four steps, and a caveat.
        visual: {
          type: 'laptopNight',
          label: 'A few hours after work',
          checks: [
            { label: 'Pick a skill people pay for', detail: 'Writing, design, coding, tutoring, coaching or making videos: something you already do well.' },
            { label: 'Find your first three clients', detail: 'Before you build anything, ask three people if they would pay.' },
            { label: 'Give it a few hours a week', detail: 'Small enough to keep going next to your job, steady enough to grow.' },
            { label: 'Save what it earns', detail: 'Keep living on your salary and put every rupee it makes aside.' },
          ],
          note: "Earnings aren't guaranteed. Keep your job until the side income is steady.",
        },
        evidence: {},
      }
    },
  },

  // Early retirement on a salary: the 4% rule's target from the user's own spending,
  // and what investing every month for twenty years would take to reach it.
  {
    id: 'learn_freedom_number',
    build(f) {
      if (!(f.yearAvgSpend > 0)) return null
      // Round figures: the month to the nearest ₹10,000 (₹80,000, ₹90,000, ₹1 lakh),
      // the monthly investment to the nearest ₹1,000.
      const month = Math.max(10000, Math.round(f.yearAvgSpend / 10000) * 10000)
      const year = month * 12
      const target = year * 25
      const years = 20
      const rate = 10
      const monthly = Math.round(target / futureValue(1, rate, years) / 1000) * 1000
      return {
        triggered: false,
        title: 'Retire early on a salary',
        description: "We're not made to spend our whole life at a desk, staring at a screen. Retire in your 40s, while you still have the energy, not in your 60s. Invest a fixed amount every month; once you have 25 times a year's spending, the 4% rule says you can live off it.",
        // A sunset over the sea, and the sum from the user's own spending.
        visual: {
          type: 'sunset',
          label: 'Your time, back',
          sum: [
            { label: 'Your monthly spending', value: rupees(month) },
            { label: 'A year of it', value: rupees(year) },
            { label: '× 25, the 4% rule', value: rupees(target), strong: true, rule: true },
            { label: `Invest each month for ${years} years`, value: `≈ ${rupees(monthly)}`, tone: 'good', rule: true },
          ],
          note: `Shown at ${rate}% a year. Returns are not guaranteed. A rough guide, not a plan.`,
        },
        evidence: { year: Math.round(year) },
      }
    },
  },

  // Bargaining in everyday buying: the market, the shop, services, rent.
  {
    id: 'learn_negotiate',
    build() {
      return {
        triggered: false,
        title: 'A little bargaining saves a lot',
        description: "Paying whatever is asked feels easy, but it quietly costs you every week: at the market, the shop, the mechanic, even the rent. Asking for a better price feels awkward at first. Step out of that comfort zone once, and it soon becomes a habit that saves real money.",
        // A price tag with the asked price crossed out and a better one below, then tips.
        visual: {
          type: 'priceTag',
          was: rupees(1200),
          now: rupees(950),
          good: true,
          label: 'The price is rarely final',
          checks: [
            { label: 'Always ask once', detail: '"Is this your best price?" costs nothing and works more often than you think.' },
            { label: 'Know the price elsewhere', detail: 'Check online or at another shop before you start.' },
            { label: 'Start lower than you will pay', detail: 'Offer about a third less, then meet in the middle.' },
            { label: 'Be ready to walk away', detail: 'Often the real price arrives as you turn to leave.' },
            { label: 'Ask for something extra', detail: "If the price won't move, ask for free delivery or an extra piece." },
          ],
        },
        evidence: {},
      }
    },
  },

  // Simple personal finance: few accounts, saving on autopilot, no card, a monthly look.
  {
    id: 'learn_frugal',
    build() {
      return {
        triggered: false,
        title: 'Keep your money simple',
        description: "You don't need five cards, ten apps and a pile of EMIs. Simple money is easier to track, harder to lose, and leaves more to save. A few clear habits do most of the work.",
        // Tangled lines straightening into one, and the habits under the description.
        visual: {
          type: 'untangle',
          label: 'Less tangled, more saved',
          checks: [
            { label: 'One account to spend, one to save', detail: 'Two accounts are enough. More just hides where money goes.' },
            { label: 'Save on salary day, automatically', detail: 'Set it once. What you never see, you never spend.' },
            { label: 'No credit card', detail: 'Pay with money you have. A card makes spending easy and interest expensive.' },
            { label: "Cancel what you don't use", detail: 'Subscriptions and memberships add up quietly.' },
            { label: 'Check in once a month', detail: "Ten minutes to see what came in, what went out, and what's left." },
          ],
        },
        evidence: {},
      }
    },
  },

  // Impulse buying. Fits best when spending has jumped.
  {
    id: 'learn_impulse',
    build(f) {
      const up = !!f.compare && f.compare.prev > 0 && f.compare.cur > f.compare.prev * 1.15
      return {
        triggered: up,
        title: 'Stop Impulsive Buying',
        description: "Willpower runs out by evening; a few simple rules don't. Make buying slower and harder, and most urges fade before you act on them.",
        // Someone pausing to ask "Do I need it?" before the bag, then five rules.
        visual: {
          type: 'needIt',
          label: 'Ask first',
          checks: [
            { label: 'Wait 24 hours', detail: 'If you still want it tomorrow, then think about it.' },
            { label: "Don't browse Instagram, Facebook or Pinterest to shop", detail: 'Feeds are built to make you want things.' },
            { label: "Don't buy on EMI", detail: "If you can't pay for it now, you can't afford it yet." },
            { label: 'Remove saved card details', detail: 'Typing the number gives you a moment to think.' },
            { label: 'Shop with a list', detail: 'If it is not on the list, it waits.' },
          ],
        },
        evidence: {},
      }
    },
  },

  // Starting early, as two friends with the same monthly amount.
  {
    id: 'learn_start_early',
    build(f) {
      const monthly = sampleMonthly(f)
      const rate = 10
      const early = futureValue(monthly, rate, 35)
      const late = futureValue(monthly, rate, 25)
      const lost = Math.round((1 - late / early) * 100)
      // Estimates, so rounded to the nearest ₹1,000.
      const round = (n) => rupees(Math.round(n / 1000) * 1000)
      return {
        triggered: false,
        title: 'Compounding rewards whoever starts first',
        description: `Two friends each save ${rupees(monthly)} a month until 60. One starts at 25, the other at 35. The early starter puts in only a little more, but those first ten years keep growing for decades. The best time to start is now.`,
        // The early starter's full green stack beside the late starter's, and the sum.
        visual: {
          type: 'growStacks',
          put: late,
          final: early,
          putLabel: short(late),
          finalLabel: short(early),
          captions: ['Starts at 25', 'Starts at 35'],
          greenFirst: true,
          sum: [
            { label: 'Each saves a month', value: rupees(monthly) },
            { label: 'Starts at 25, by 60', value: round(early), tone: 'good', rule: true },
            { label: 'Starts at 35, by 60', value: round(late), strong: true },
            { label: 'Cost of waiting 10 years', value: `≈ ${lost}% less`, tone: 'bad', rule: true },
          ],
          note: `Shown at ${rate}% a year. Returns are not guaranteed.`,
        },
        evidence: { monthly },
      }
    },
  },

  // What rising prices do: a biscuit pack that cost ₹5 in 2016 costs ₹10 in 2026, and
  // why money left in a bank loses value. The same for everyone.
  {
    id: 'learn_inflation',
    build() {
      return {
        triggered: false,
        title: 'Inflation quietly shrinks your money',
        description: "Prices rise every year, so the same money buys less. A bank account grows slower than prices, so savings left there lose value. Keep a few months' spending in the bank and invest the rest in assets that grow faster.",
        // Two grey biscuit packs, 2016 beside 2026.
        visual: {
          type: 'packs',
          label: 'Same biscuits, double the price',
          packs: [{ year: '2016', price: '₹5' }, { year: '2026', price: '₹10' }],
        },
        evidence: {},
      }
    },
  },

  // Lifestyle creep: spending that rises with pay. Live plainly, save the difference.
  // Fires best right after income went up.
  {
    id: 'learn_lifestyle_creep',
    build(f) {
      const up = f.incomeLast > 0 && f.incomePrior > 0 && f.incomeLast >= f.incomePrior * 1.1
      return {
        triggered: up,
        title: 'Live a boring life, build wealth',
        description: 'As pay rises, so does spending: a pricier phone, a nicer car. That is lifestyle creep, and it eats every raise. Live a normal, even boring life, save as much as you can, and build wealth.',
        // Two show-off buys on the left, coin stacks saved instead on the right.
        visual: {
          type: 'creepSplit',
          leftLabel: 'Avoid creep',
          rightLabel: 'Saved instead',
          checks: [
            { label: 'Keep your life the same', detail: 'A raise is not a reason to upgrade.' },
            { label: 'Skip brands and show-off buys', detail: 'They cost more and add nothing.' },
            { label: "Don't buy a car or home to show off", detail: 'An EMI makes it look small. It is not.' },
            { label: 'Fix the basics first', detail: 'Sleep, exercise and diet beat skincare.' },
            { label: 'Save and invest the difference', detail: 'Every month.' },
          ],
        },
        evidence: {},
      }
    },
  },

  // The rule of 72: divide 72 by the yearly return to see how long money takes to double.
  {
    id: 'learn_rule_of_72',
    build() {
      const years = (rate) => {
        const y = 72 / rate
        return Number.isInteger(y) ? `${y} years` : `${y.toFixed(1)} years`
      }
      return {
        triggered: false,
        title: 'Calculate how long money takes to double',
        description: "Divide 72 by the yearly return to see how many years it takes your money to double. The higher the return, the sooner it doubles. It's a quick estimate, with no calculator needed.",
        // "72 rule" as text, the worked example once above a flat table of rates.
        visual: {
          type: 'rule72',
          example: { text: '72 ÷ 8 =', result: '9 years' },
          table: {
            head: ['Return a year', 'Years to double'],
            rows: [8, 12, 15, 25].map((r, i) => ({ label: `${r}%`, value: years(r), tone: i === 0 ? 'good' : undefined })),
          },
          note: 'A quick estimate. Returns are not guaranteed.',
        },
        evidence: {},
      }
    },
  },

  // -------------------------------------------------------------------------
  // STORIES. Short, made-up people with real arithmetic. Always say so in the note:
  // a story is an illustration, never a claim that something happened to someone.
  // -------------------------------------------------------------------------

  // A bike bought on a six-month EMI, against saving up and paying cash.
  {
    id: 'story_phone_emi',
    build() {
      const price = 300000
      const salary = 50000
      const rate = 12
      const months = 6
      const { emi, interest } = loanCost(price, rate, months)
      return {
        triggered: false,
        title: 'The cost of buying things on EMI',
        description: `Arjun works ${((emi * months) / salary).toFixed(1)} months completely free to pay for his ${short(price)} bike, because "no-cost EMI" is never no cost. Saved first and paid cash, he'd have the bike and sleep peacefully. Save first, then buy.`,
        // Worry on EMI against peace on cash, a short sum, and a button to start saving.
        visual: {
          type: 'worryPeace',
          label: 'EMI worry vs cash peace',
          // What the bike costs in all on the EMI, against his pay: how many months he
          // works with all of it going to the bike.
          sum: [
            { label: 'Total cost of the bike, on EMI', value: rupees(emi * months) },
            { label: 'His monthly salary', value: rupees(salary) },
            { label: 'Months he works completely free, to pay for it', value: `${((emi * months) / salary).toFixed(1)} months`, tone: 'bad', rule: true },
          ],
          cta: 'Set a saving goal',
        },
        evidence: {},
      }
    },
  },

  // Two people lose their jobs: one with nothing saved, one with six months.
  {
    id: 'story_job_loss',
    build() {
      const spend = 30000
      return {
        triggered: false,
        title: 'Keep your umbrella ready in advance',
        description: 'Two people lost their jobs on the same day. Arjun had saved nothing, so he asked friends and relatives for money to pay his EMIs. When there was none left, he took a personal loan at a high interest. Neha had six months of spending saved, so she took her time and found the right job. Save first. A job loss is not the time to start.',
        // The same rain on both: Arjun with no umbrella, Neha under one.
        visual: {
          type: 'rainUmbrella',
          leftLabel: 'Arjun · saved ₹0',
          rightLabel: 'Neha · saved 6 months',
          sum: [
            { label: 'Both spend', value: `${rupees(spend)} a month` },
            { label: "Arjun's savings", value: '₹0 · no time', tone: 'bad', rule: true },
            { label: "Neha's emergency fund", value: `${rupees(spend * 6)} · 6 months`, tone: 'good' },
          ],
          cta: 'Create emergency fund',
          // What the button fills the new-goal sheet with: the name, and this many months of
          // the user's own spending as the target.
          goal: { name: 'Emergency fund', months: 6 },
        },
        evidence: {},
      }
    },
  },
]
