import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import BarChart from './BarChart';
import LineChart from './LineChart';
import BudgetStatusBar from './BudgetStatusBar';
import { GlassPressable } from './Glass';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { formatCurrency } from '../utils/format';

const SLIDE_MS = 9000;
// Below this, a press+release counts as a tap (navigate) rather than a
// hold (pause-and-resume-in-place) — matches the feel of Instagram/
// WhatsApp status taps, where a normal tap is well under this.
const HOLD_THRESHOLD_MS = 200;

function ProgressSegment({ state, paused }) {
  // state: 'done' | 'active' | 'pending'
  const progress = useSharedValue(state === 'done' ? 1 : 0);
  const prevStateRef = useRef(state);

  useEffect(() => {
    const becameActive = state === 'active' && prevStateRef.current !== 'active';
    prevStateRef.current = state;

    if (state !== 'active') {
      progress.value = state === 'done' ? 1 : 0;
      return;
    }
    if (becameActive) progress.value = 0;

    if (paused) {
      // Freezes the fill exactly where it is — a held segment stays
      // partially filled instead of continuing or resetting.
      cancelAnimation(progress);
    } else {
      // Resumes from wherever it's currently sitting, over only the time
      // that's actually left, rather than replaying the full duration.
      const remaining = (1 - progress.value) * SLIDE_MS;
      progress.value = withTiming(1, { duration: remaining, easing: Easing.linear });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, paused]);

  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View className="flex-1 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.22)' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: 'white', borderRadius: 999 }, style]} />
    </View>
  );
}

// Opening card — sets up what's coming, no numbers yet. Same scale as the
// rest of the app's kicker/headline pairs (e.g. BudgetSetupModal's "Last
// month" label + confirmation text) rather than the reference image's
// larger, bolder, more letter-spaced treatment.
function TitleSlide({ month, year }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-white/40 text-xs font-semibold uppercase tracking-wide text-center mb-2">
        Take a moment to review
      </Text>
      <Text className="text-lg font-semibold text-center" style={{ color: '#4ade80', lineHeight: 26, textTransform: 'uppercase' }}>
        {MONTH_NAMES[month]} {year} spendings
      </Text>
    </View>
  );
}

// Counts down `delayMs` and flips to true once — pausable, so a hold
// mid-countdown freezes it in place and resuming picks up the remaining
// time, same math as the story's own slide-advance timer above.
function usePausableReveal(paused, delayMs) {
  const [revealed, setRevealed] = useState(false);
  const remainingRef = useRef(delayMs);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (revealed) return;
    if (paused) {
      clearTimeout(timerRef.current);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
      return;
    }
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => setRevealed(true), remainingRef.current);
    return () => clearTimeout(timerRef.current);
  }, [paused, revealed]);

  return revealed;
}

function FadeIn({ children, style }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }],
  }));
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

// Capitalizes each word for display — transaction descriptions are stored
// sentence-case ("Car emi"), which reads oddly for acronyms once it's the
// centerpiece of a callout instead of a small list row.
function titleCaseWords(str) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Reuses the home screen's own daily BarChart. Staged reveal: the callout
// lands above the bar first, then its description line, then the no-spend
// count — each a beat after the last, not all at once.
function DailyChartSlide({ month, year, values, labels, highestIndex, highestAmount, highestDay, highestDescription, noSpendDays, paused }) {
  const hasHighest = highestIndex >= 0;
  const calloutReady = usePausableReveal(paused, 1000);
  const showCallout  = calloutReady && hasHighest;
  const textReady    = usePausableReveal(paused, 1500);
  const showHighestText = textReady && hasHighest;
  const showNoSpend  = usePausableReveal(paused, 3500);

  // Horizontal position (0-1) of the highest bar within the chart's own
  // width, used to place the callout above it — the callout itself lives
  // outside the SVG entirely (a plain overlay), not inside BarChart's own
  // coordinate space, since the tallest bar can reach the very top of the
  // chart and a peak-relative label there has nowhere left to sit.
  const calloutFraction = labels.length > 1 ? highestIndex / (labels.length - 1) : 0.5;

  return (
    <View className="flex-1 px-6">
      {/* Positioned independently of the centered block below — moving the
          title shouldn't shift the chart's own vertical centering. */}
      <View className="items-center absolute" style={{ top: 100, left: 24, right: 24 }}>
        <Text className="text-white/40 text-sm font-semibold uppercase tracking-wide text-center mb-2">
          {MONTH_NAMES[month]} {year}
        </Text>
        <Text className="text-white text-xl font-semibold text-center uppercase">
          Daily spending chart
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View style={{ width: '90%', paddingTop: 22 }}>
          {showCallout && (
            <FadeIn style={{ position: 'absolute', top: 0, left: `${calloutFraction * 100}%`, marginLeft: -30, width: 60 }}>
              <Text className="text-white/85 text-xs font-semibold text-center">
                {formatCurrency(highestAmount)}
              </Text>
            </FadeIn>
          )}
          <BarChart
            values={values}
            labels={labels}
            activeIndex={-1}
            isIncome={false}
            animKey={`recap-daily-${month}-${year}`}
            labelStep={4}
            useSqrtScale
          />
        </View>

        {/* Reserves space for both reveal lines up front so the group
            doesn't jump vertically as they fade in. */}
        <View className="mt-8" style={{ minHeight: 90, width: '100%' }}>
          {showHighestText && (
            <FadeIn>
              <Text className="text-white/60 text-sm text-center" style={{ lineHeight: 20 }}>
                You spent the most on {MONTH_NAMES[month]} {highestDay} — {formatCurrency(highestAmount)} on{' '}
                <Text style={{ fontStyle: 'italic' }}>"{titleCaseWords(highestDescription)}"</Text>
              </Text>
            </FadeIn>
          )}
          {showNoSpend && (
            <FadeIn style={{ marginTop: 12 }}>
              <Text className="text-white/60 text-sm text-center" style={{ lineHeight: 20 }}>
                {noSpendDays > 0
                  ? `You had ${noSpendDays} No-spend day${noSpendDays === 1 ? '' : 's'} this month — Nice.`
                  : 'You spent something every day this month.'}
              </Text>
            </FadeIn>
          )}
        </View>
      </View>
    </View>
  );
}

const MONTH_LABELS_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Year-over-year comparison for one side (expense or income) — a plain
// thin-bordered box, two centered lines, no fill. Same red/green tokens
// the rest of the app already uses. The arrow marks only the current-year
// line — it's the one being compared against, not the baseline.
function YoyBox({ color, lastYearLine, thisYearLine, diff }) {
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : null;
  return (
    <View
      className="rounded-lg px-4 py-2.5 items-center"
      style={{ borderWidth: 1, borderColor: `${color}80` }}
    >
      <Text className="text-xs font-semibold text-center" style={{ color }}>{lastYearLine}</Text>
      <Text className="text-xs font-semibold text-center mt-1" style={{ color }}>
        {thisYearLine}{arrow ? ` ${arrow}` : ''}
      </Text>
    </View>
  );
}

function growthSentence(kind, diff, pct) {
  const dir = diff > 0 ? 'grew' : diff < 0 ? 'dropped' : null;
  if (pct == null) return `No ${kind} data from last year to compare yet.`;
  if (!dir) return `Your ${kind} stayed flat year over year.`;
  return `Your ${kind} ${dir} ${Math.abs(pct)}% year over year.`;
}

function YoySection({ color, kind, diff, pct, month, year, lastYearAmount, thisYearAmount }) {
  return (
    <View className="items-center" style={{ width: '100%' }}>
      <Text className="text-white/60 text-sm text-center mb-2">{growthSentence(kind, diff, pct)}</Text>
      <YoyBox
        color={color}
        lastYearLine={`${MONTH_NAMES[month]} ${year - 1} — ${formatCurrency(lastYearAmount)}`}
        thisYearLine={`${MONTH_NAMES[month]} ${year} — ${formatCurrency(thisYearAmount)}`}
        diff={diff}
      />
    </View>
  );
}

function DiffSummaryLine({ diff, base, compareLabel }) {
  if (base <= 0) {
    return <Text className="text-white/50 text-sm text-center mb-6">No {compareLabel} data to compare yet.</Text>;
  }
  if (diff === 0) {
    return <Text className="text-white/50 text-sm text-center mb-6">Same as {compareLabel}.</Text>;
  }
  const more = diff > 0;
  return (
    <Text className="text-white/60 text-sm text-center mb-6">
      You spent{' '}
      <Text style={{ color: more ? '#f87171' : '#4ade80', fontWeight: '700' }}>
        {formatCurrency(Math.abs(diff))}
      </Text>
      {' '}{more ? 'more' : 'less'} than {compareLabel}.
    </Text>
  );
}

// Same title position/scale as the daily chart slide, just different text —
// then a compact period + amount header, the reused monthly BarChart, and
// the two YoY comparisons revealing a beat apart.
function MonthlyChartSlide({
  month, year, expenseValues, currentExpense, currentIncome,
  lastYearExpense, lastYearIncome, expenseDiff, incomeDiff, expensePct, incomePct,
  prevMonth, prevYear, prevMonthExpense, prevMonthDiff, paused,
}) {
  const showExpenseBox = usePausableReveal(paused, 1000);
  const showIncomeBox  = usePausableReveal(paused, 2200);

  return (
    <View className="flex-1 px-6">
      {/* Positioned independently of the centered block below — moving the
          title shouldn't shift the chart's own vertical centering. */}
      <View className="items-center absolute" style={{ top: 100, left: 24, right: 24 }}>
        <Text className="text-white/40 text-sm font-semibold uppercase tracking-wide text-center mb-2">
          {year}
        </Text>
        <Text className="text-white text-xl font-semibold text-center uppercase">
          Monthly chart
        </Text>
      </View>

      <View className="flex-1 items-center justify-center" style={{ paddingTop: 60 }}>
        <View className="items-center mb-1">
          <Text className="text-white font-bold text-center" style={{ fontSize: 30 }}>
            {formatCurrency(currentExpense)}
          </Text>
        </View>
        <DiffSummaryLine
          diff={prevMonthDiff}
          base={prevMonthExpense}
          compareLabel={`${MONTH_NAMES[prevMonth]} ${prevYear}`}
        />

        <View style={{ width: '90%' }}>
          <BarChart
            values={expenseValues}
            labels={MONTH_LABELS_SHORT}
            activeIndex={month}
            isIncome={false}
            animKey={`recap-monthly-${year}`}
            labelStep={1}
          />
        </View>

        {/* Reserves space for both sections up front so the chart above
            (and the whole centered group) doesn't shift as they fade in. */}
        <View className="mt-6" style={{ gap: 18, width: '100%', minHeight: 220 }}>
          {showExpenseBox && (
            <FadeIn>
              <YoySection
                color="#f87171"
                kind="expenses"
                diff={expenseDiff}
                pct={expensePct}
                month={month}
                year={year}
                lastYearAmount={lastYearExpense}
                thisYearAmount={currentExpense}
              />
            </FadeIn>
          )}
          {showIncomeBox && (
            <FadeIn>
              <YoySection
                color="#4ade80"
                kind="income"
                diff={incomeDiff}
                pct={incomePct}
                month={month}
                year={year}
                lastYearAmount={lastYearIncome}
                thisYearAmount={currentIncome}
              />
            </FadeIn>
          )}
        </View>
      </View>
    </View>
  );
}

// Whether this month came out ahead or behind, in plain language — same
// red/green tokens as the rest of the recap.
function overviewCopy(savings) {
  if (savings > 0) {
    return {
      headline: `You saved ${formatCurrency(savings)} this month`,
      message: "Nice — you're spending less than you earn. Keep it up.",
      color: '#4ade80',
    };
  }
  if (savings < 0) {
    return {
      headline: null,
      message: 'Your expenses crossed your income — keep your expenses below your income to avoid debt.',
      color: '#f87171',
    };
  }
  return {
    headline: 'You broke even this month',
    message: 'Income matched expenses exactly.',
    color: 'rgba(255,255,255,0.6)',
  };
}

// Same title position/scale as the other chart slides — reuses the home
// screen's own Overview LineChart for the year's income/expense trend,
// then a single savings insight for the current month below it.
function OverviewSlide({ month, year, incomeValues, expenseValues, monthSavings, paused }) {
  const showMessage = usePausableReveal(paused, 800);
  const { headline, message, color } = overviewCopy(monthSavings);

  // Same truncation the home screen's own Overview tab uses — only the
  // months up through the one being reviewed, not months that haven't
  // happened yet within the same calendar year.
  const upToMonth = month + 1;

  return (
    <View className="flex-1 px-6">
      <View className="items-center absolute" style={{ top: 100, left: 24, right: 24 }}>
        <Text className="text-white/40 text-sm font-semibold uppercase tracking-wide text-center mb-2">
          {year}
        </Text>
        <Text className="text-white text-xl font-semibold text-center uppercase">
          Expense vs income
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View style={{ width: '90%' }}>
          <LineChart
            incomeData={incomeValues.slice(0, upToMonth)}
            expenseData={expenseValues.slice(0, upToMonth)}
            labels={MONTH_LABELS_SHORT.slice(0, upToMonth)}
            animKey={`recap-overview-${year}`}
          />
        </View>

        {/* Reserves space for the message up front so the chart above
            doesn't shift as it fades in. */}
        <View className="mt-8" style={{ minHeight: 80, width: '100%' }}>
          {showMessage && (
            <FadeIn>
              {headline && (
                <Text className="font-semibold text-center mb-2" style={{ color, fontSize: 18 }}>
                  {headline}
                </Text>
              )}
              <Text className="text-white/60 text-sm text-center" style={{ lineHeight: 20 }}>
                {message}
              </Text>
            </FadeIn>
          )}
        </View>
      </View>
    </View>
  );
}

function budgetCopy(percent, diff) {
  if (percent > 100) {
    return {
      headline: `You went ${formatCurrency(diff)} over budget`,
      message: 'Try to stick closer to your budget next month to stay on track.',
      color: '#f87171',
    };
  }
  if (percent < 100) {
    return {
      headline: `You stayed ${formatCurrency(diff)} under budget`,
      message: 'Great budgeting — keep sticking to it next month too.',
      color: '#4ade80',
    };
  }
  return {
    headline: 'You spent exactly your budget',
    message: 'Right on target — keep sticking to this budget.',
    color: 'rgba(255,255,255,0.6)',
  };
}

// Same title position/scale as the other slides — a compact budget card
// (spent / budget, a fill bar, percent used) then the scenario message
// below it, revealing a beat after the card itself.
function BudgetSlide({ month, year, budgetAmount, budgetSpent, percent, paused }) {
  const showMessage = usePausableReveal(paused, 1000);
  const { headline, message, color } = budgetCopy(percent, Math.abs(budgetSpent - budgetAmount));

  return (
    <View className="flex-1 px-6">
      <View className="items-center absolute" style={{ top: 100, left: 24, right: 24 }}>
        <Text className="text-white/40 text-sm font-semibold uppercase tracking-wide text-center mb-2">
          {MONTH_NAMES[month]} {year}
        </Text>
        <Text className="text-white text-xl font-semibold text-center uppercase">
          Budget
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View style={{ width: '90%' }}>
          <BudgetStatusBar hasBudget amount={budgetAmount} spent={budgetSpent} percent={percent} />
        </View>

        {/* Reserves space for the message up front so the bar above
            doesn't shift as it fades in. */}
        <View className="mt-8" style={{ minHeight: 80, width: '100%' }}>
          {showMessage && (
            <FadeIn>
              <Text className="font-semibold text-center mb-2" style={{ color, fontSize: 18 }}>
                {headline}
              </Text>
              <Text className="text-white/60 text-sm text-center" style={{ lineHeight: 20 }}>
                {message}
              </Text>
            </FadeIn>
          )}
        </View>
      </View>
    </View>
  );
}

const CAL_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Static (non-interactive) read-only month grid — same per-day spend-shade
// coloring and legend as SpendCalendarModal's calendar, minus navigation
// and day-tap selection, since this is a fixed snapshot of one past month.
function CalendarGrid({ firstDay, days }) {
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  days.forEach(d => cells.push(d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View className="rounded-2xl p-4" style={{ width: '100%' }}>
      <View className="flex-row mb-1.5">
        {CAL_DAYS.map((d, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Text className="text-center text-white/25 text-[11px] font-medium">{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row" style={{ gap: 5, marginBottom: 5 }}>
          {week.map((d, i) => (
            <View
              key={i}
              className="aspect-square items-center justify-center rounded-md"
              style={{ flex: 1, backgroundColor: d ? d.bg : 'transparent' }}
            >
              {d && <Text style={{ color: d.color, fontSize: 12, fontWeight: '500' }}>{d.day}</Text>}
            </View>
          ))}
        </View>
      ))}

      <View className="flex-row items-center justify-center mt-3" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(34,197,94,0.5)' }} />
          <Text className="text-white/30" style={{ fontSize: 10 }}>No spend</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(239,68,68,0.5)' }} />
          <Text className="text-white/30" style={{ fontSize: 10 }}>Spent</Text>
        </View>
      </View>
    </View>
  );
}

function noSpendPhrase(count) {
  return `${count} No-spend day${count === 1 ? '' : 's'}`;
}

// Same title position/scale as the other slides — the reused-style calendar
// grid first, then two staged lines: the plain spend/no-spend tally, then
// how that compares to last month.
function CalendarSlide({ month, year, firstDay, days, daysInMonth, spentDays, noSpendDays, prevMonth, prevYear, prevNoSpendDays, paused }) {
  const showTally = usePausableReveal(paused, 600);
  const showCompare = usePausableReveal(paused, 1800);
  const prevLabel = `${MONTH_NAMES[prevMonth]} ${prevYear}`;

  return (
    <View className="flex-1 px-6">
      <View className="items-center absolute" style={{ top: 100, left: 24, right: 24 }}>
        <Text className="text-white/40 text-sm font-semibold uppercase tracking-wide text-center mb-2">
          {MONTH_NAMES[month]} {year}
        </Text>
        <Text className="text-white text-xl font-semibold text-center uppercase">
          Calendar
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View style={{ width: '90%' }}>
          <CalendarGrid firstDay={firstDay} days={days} />
        </View>

        {/* Reserves space for both lines up front so the grid above
            doesn't shift as they fade in. */}
        <View className="mt-6" style={{ minHeight: 70, width: '100%' }}>
          {showTally && (
            <FadeIn>
              <Text className="text-white/60 text-sm text-center" style={{ lineHeight: 20 }}>
                You spent on {spentDays} of {daysInMonth} days —{' '}
                <Text style={{ color: '#4ade80', fontWeight: '700' }}>{noSpendPhrase(noSpendDays)}</Text>.
              </Text>
            </FadeIn>
          )}
          {showCompare && (
            <FadeIn style={{ marginTop: 8 }}>
              <Text className="text-sm text-center" style={{ lineHeight: 20, color: 'rgba(255,255,255,0.5)' }}>
                {prevLabel} —{' '}
                <Text style={{ color: '#4ade80', fontWeight: '700' }}>{noSpendPhrase(prevNoSpendDays)}</Text>
              </Text>
            </FadeIn>
          )}
        </View>
      </View>
    </View>
  );
}

// Closing card — same simple centered treatment as the opening TitleSlide
// (no pinned-top header, since there's no chart/grid to anchor), ending on
// encouragement rather than another number, plus a CTA straight into
// setting up next month's budget.
function ClosingSlide({ onOpenBudgetSetup, hasBudgetThisMonth }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-white/40 text-xs font-semibold text-center mb-2">
        Before you go Remember
      </Text>
      <Text className="text-lg font-semibold text-center mb-3" style={{ color: '#4ade80', lineHeight: 26 }}>
        Savings is the real Earnings
      </Text>
      <Text className="text-white/60 text-sm text-center" style={{ lineHeight: 20, maxWidth: 280, marginBottom: hasBudgetThisMonth ? 0 : 32 }}>
        Each Rupee you save now — will save you in the Future
      </Text>

      {!hasBudgetThisMonth && (
        <GlassPressable variant="active" radius={16} onPress={onOpenBudgetSetup} className="px-6 py-[14px]">
          <Text className="text-black text-base font-semibold">Set This Month's Budget</Text>
        </GlassPressable>
      )}
    </View>
  );
}

function Slide({ slide, paused, onOpenBudgetSetup }) {
  switch (slide.type) {
    case 'title': return <TitleSlide month={slide.month} year={slide.year} />;
    case 'daily-chart': return <DailyChartSlide {...slide} paused={paused} />;
    case 'monthly-chart': return <MonthlyChartSlide {...slide} paused={paused} />;
    case 'overview': return <OverviewSlide {...slide} paused={paused} />;
    case 'budget': return <BudgetSlide {...slide} paused={paused} />;
    case 'calendar': return <CalendarSlide {...slide} paused={paused} />;
    case 'closing': return <ClosingSlide {...slide} onOpenBudgetSetup={onOpenBudgetSetup} />;
    default: return null;
  }
}

function MonthlyRecapModal({ open, slides, onClose, onOpenBudgetSetup }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  // How much of this slide's SLIDE_MS budget is left, and when the
  // currently-running countdown last (re)started — together these let a
  // pause/resume cycle pick up from exactly where it left off instead of
  // either losing the elapsed time or replaying the full duration.
  const remainingRef = useRef(SLIDE_MS);
  const startedAtRef = useRef(0);
  const timedIndexRef = useRef(-1);
  const pressRef = useRef({ time: 0, x: 0 });

  useEffect(() => {
    if (open) { setIndex(0); setPaused(false); }
  }, [open]);

  useEffect(() => {
    if (!open || !slides.length) return;
    if (timedIndexRef.current !== index) {
      remainingRef.current = SLIDE_MS;
      timedIndexRef.current = index;
    }
    if (paused) { clearTimeout(timerRef.current); return; }
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      if (index >= slides.length - 1) onClose();
      else setIndex(index + 1);
    }, remainingRef.current);
    return () => clearTimeout(timerRef.current);
  }, [open, index, slides.length, onClose, paused]);

  if (!open || !slides.length) return null;

  const slide = slides[index];

  function goTo(i) {
    if (i < 0 || i >= slides.length) { onClose(); return; }
    setIndex(i);
  }

  function handlePressIn(e) {
    pressRef.current = { time: Date.now(), x: e.nativeEvent.locationX };
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    setPaused(true);
  }

  function handlePressOut() {
    const heldMs = Date.now() - pressRef.current.time;
    setPaused(false);
    // A real hold just resumes in place — only a quick tap navigates.
    if (heldMs < HOLD_THRESHOLD_MS) {
      if (pressRef.current.x < width / 2) goTo(index - 1);
      else goTo(index + 1);
    }
  }

  return (
    <View className="absolute inset-0" style={{ backgroundColor: '#050505', zIndex: 70 }}>
      <View className="flex-row px-3 pt-14" style={{ gap: 6 }}>
        {slides.map((s, i) => (
          <ProgressSegment key={i} state={i < index ? 'done' : i === index ? 'active' : 'pending'} paused={paused} />
        ))}
      </View>

      {/* A separate row below the progress bar, Instagram-style, rather
          than sharing its row — sits outside the full-screen tap area
          below (a sibling, not an overlay), so it's always reachable
          regardless of hold/tap state. */}
      <View className="flex-row justify-end px-3" style={{ paddingTop: 10 }}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 24 }}>✕</Text>
        </Pressable>
      </View>

      <Pressable className="flex-1" onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Slide slide={slide} paused={paused} onOpenBudgetSetup={onOpenBudgetSetup} />
      </Pressable>
    </View>
  );
}

export default memo(MonthlyRecapModal);
