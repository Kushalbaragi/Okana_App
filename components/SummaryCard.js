import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import BarChart from './BarChart';
import LineChart from './LineChart';
import { GlassPressable } from './Glass';
import {
  getMonthTotal,
  getMonthlyTotals,
  getDailyTotals,
  getLifetimeYearly,
  getLifetimeMonthly,
  getEarliestDate,
  firstBarWithData,
  currentMonthYear,
} from '../utils/format';
import { textColor } from '../utils/colors';

const LIFETIME_YEARLY_THRESHOLD = 2; // years of history before "All Time" switches from monthly to yearly bars
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { SETTLE_EASING } from '../utils/motion';

const MONTH_LABELS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

// 'ui-rounded', not 'SF Pro Rounded' (that name doesn't resolve — see
// AmountField.js's own ROUNDED_FONT comment) — used for the headline amount
// to match the rounded numeral style elsewhere in the app.
const ROUNDED_FONT = Platform.OS === 'ios' ? 'ui-rounded' : undefined;

// Animates the number as ONE object: the old value fades out and drifts up
// while the new one fades in from just below.
//
// This replaced a per-digit version (each digit staggered in with its own
// blur and spring, the row keyed on the formatted string). The problem was
// structural, not tuning: a new key remounts the whole row, so the old
// row's digits were still fading out — in the same flex-row, at their own
// widths — while the new row's digits faded in behind them. With en-IN
// grouping, "₹45,682" and "₹5,66,581" don't even have their commas in the
// same places, so the two rows never lined up and composited into a single
// unreadable number made of digits from both values, for the ~600ms the
// stagger plus the 340ms per-digit animation took to resolve. That smear
// is what read as the amount "lagging".
//
// Both copies here are absolutely positioned across a full-width box and
// centred by textAlign, so they overlap EXACTLY rather than partially, and
// a length change needs no handling at all — nothing slides, so the ₹ can't
// jump and there's no width to animate.
const HEADLINE_HEIGHT = 52;

// Room above the bar chart (in its own units) so the average line and its label
// aren't cut off when the average is as tall as the tallest bar. Always the same,
// whatever the range, so the chart doesn't change height between them.
const AVG_ROOM = 12;
const HEADLINE_SWAP_RISE = 8;
const HEADLINE_ENTER_DURATION = 220;
// Shorter than the enter on purpose. Both copies are stacked, so a
// symmetric crossfade leaves them equally visible through the middle of the
// swap and two different numbers briefly overlap as a smear. Clearing the
// old one out faster keeps the overlap dim and brief.
const HEADLINE_EXIT_DURATION = 150;

function headlineEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: HEADLINE_SWAP_RISE }] },
    animations: {
      opacity: withTiming(1, { duration: HEADLINE_ENTER_DURATION, easing: SETTLE_EASING }),
      transform: [{ translateY: withTiming(0, { duration: HEADLINE_ENTER_DURATION, easing: SETTLE_EASING }) }],
    },
  };
}

function headlineExiting() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: HEADLINE_EXIT_DURATION, easing: SETTLE_EASING }),
      transform: [{ translateY: withTiming(-HEADLINE_SWAP_RISE, { duration: HEADLINE_EXIT_DURATION, easing: SETTLE_EASING }) }],
    },
  };
}

const HEADLINE_TEXT_STYLE = {
  position: 'absolute',
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 44,
  lineHeight: HEADLINE_HEIGHT,
  fontWeight: '600',
  letterSpacing: -1,
  fontFamily: ROUNDED_FONT,
};

function AnimatedAmount({ value, color }) {
  // False for the very first render only, so the headline doesn't play a
  // swap on mount — the card has its own entrance and a second animation
  // underneath it just muddies that.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const str = fmt.format(value);

  return (
    // alignSelf stretch + a fixed height: the box is the full width of the
    // card and never changes size, so the two stacked copies overlap exactly
    // and nothing below the number can shift during a swap.
    <View style={{ alignSelf: 'stretch', height: HEADLINE_HEIGHT }}>
      <Animated.Text
        // Keyed on the formatted string — that is what makes this a swap at
        // all. A new key mounts a new Text (entering) and unmounts the old
        // one (exiting); an unchanged value keeps the same key and so does
        // not animate, which is the cheap and correct no-op.
        key={str}
        numberOfLines={1}
        entering={mounted ? headlineEntering : undefined}
        exiting={mounted ? headlineExiting : undefined}
        style={[HEADLINE_TEXT_STYLE, { color }]}
      >
        {str}
      </Animated.Text>
    </View>
  );
}

// Fixed range names rather than the actual current month/year ("September",
// "2026"), so the control reads as a range picker at a glance instead of
// three unrelated proper nouns. Static now, so it lives out here rather
// than being rebuilt every render — and RangeSelector no longer needs the
// current month/year passed in at all. The period being shown is still
// spelled out in full above the amount (see periodLabel).
const RANGE_OPTIONS = [
  { id: 'month', label: 'Month' },
  { id: 'year',  label: 'Year' },
  { id: '5y',    label: 'All' },
];

function RangeSelector({ value, onChange, light }) {
  return (
    <View className="flex-row items-center justify-center mt-6" style={{ gap: 8 }}>
      {RANGE_OPTIONS.map(opt => (
        value === opt.id ? (
          // "glass", not "pillActive", even though this is the selected
          // state of a segmented control. pillActive (#3a3a3a) is tuned for
          // Header's chart tabs, which sit INSIDE a #161616 container and so
          // need to be lighter than it to read as raised. These pills sit
          // directly on the page's pure black, where that same grey is a far
          // bigger jump and reads as glaring. The standard raised-surface
          // colour is the right lift against black, and matches every other
          // card on the screen.
          <GlassPressable
            key={opt.id}
            variant="glass"
            radius={9999}
            onPress={() => onChange(opt.id)}
            className="px-3 py-1"
          >
            <Text className="text-white text-base font-medium">{opt.label}</Text>
          </GlassPressable>
        ) : (
          // variant="field" — transparent background (same look as before),
          // but still gets GlassPressable's animated press-opacity instead
          // of the plain Pressable this used to be, which had no press
          // feedback at all.
          <GlassPressable
            key={opt.id}
            variant="field"
            radius={9999}
            onPress={() => onChange(opt.id)}
            className="px-3 py-1"
          >
            <Text className="text-base font-medium" style={{ color: textColor(light).disabled }}>{opt.label}</Text>
          </GlassPressable>
        )
      ))}
    </View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
function SummaryCard({
  transactions,
  chartTab,
  timeRange,
  onTimeRangeChange,
  selectedMonth,
  year,
  selectedPeriod,
  selectedDay,
  light = false,
}) {
  const { month: currMonth, year: currYear } = currentMonthYear();

  // One shared scan for "earliest transaction" instead of three separate
  // ones — getLifetimeYearly/getLifetimeMonthly used to each independently
  // re-derive this same thing internally, on top of this component's own
  // copy, which made switching to "All Time" noticeably do more work than
  // Month/Year (neither of which needs an account-wide earliest date at
  // all, just a same-year filter). getEarliestDate is the same helper the
  // Calendar page already uses for its own "before earliest activity" cutoff.
  const earliestDateStr = useMemo(() => getEarliestDate(transactions), [transactions]);
  // Earliest transaction year decides "All Time" granularity — under
  // LIFETIME_YEARLY_THRESHOLD years of history, yearly bars would only show
  // a handful of candles, so months are shown instead; getLifetimeYearly
  // takes over once there's enough history for yearly bars to actually be
  // useful.
  const earliestYear = earliestDateStr ? parseISO(earliestDateStr).getFullYear() : currYear;
  const lifetimeGranularity = (currYear - earliestYear + 1) < LIFETIME_YEARLY_THRESHOLD ? 'month' : 'year';

  const chartData = useMemo(() => {
    if (timeRange === 'month') return getDailyTotals(transactions, currMonth, currYear);
    if (timeRange === '5y') {
      return lifetimeGranularity === 'year'
        ? getLifetimeYearly(transactions, earliestDateStr)
        : getLifetimeMonthly(transactions, earliestDateStr);
    }
    const { income, expense } = getMonthlyTotals(transactions, year);
    return { income, expense, labels: MONTH_LABELS_SHORT };
  }, [transactions, timeRange, year, currYear, currMonth, lifetimeGranularity, earliestDateStr]);

  // What each "All Time" bar actually represents, as real calendar periods —
  // {year, month: null} per bar in yearly mode, {year, month} per bar in
  // monthly mode — so a tap can filter/select by real date either way
  // instead of needing two divergent code paths.
  const periodsList = useMemo(() => {
    if (timeRange !== '5y') return [];
    if (lifetimeGranularity === 'year') {
      return (chartData.years ?? chartData.labels.map(Number)).map(y => ({ year: y, month: null }));
    }
    return chartData.months ?? [];
  }, [timeRange, lifetimeGranularity, chartData]);

  const selectedPeriodIndex = useMemo(() => {
    if (!selectedPeriod) return -1;
    return periodsList.findIndex(p => p.year === selectedPeriod.year && p.month === selectedPeriod.month);
  }, [periodsList, selectedPeriod]);

  const barValues = chartTab === 'income' ? chartData.income : chartData.expense;

  const disabledAfterIndex = useMemo(() => {
    if (timeRange === 'month') return new Date().getDate() - 1;
    if (timeRange === 'year') {
      if (year < currYear) return null;
      if (year > currYear) return -1;
      return new Date().getMonth();
    }
    // "All Time" in yearly mode now pads forward to MIN_YEAR_SLOTS (see
    // getLifetimeYearly) so a young account isn't just a couple of bars
    // stranded with huge gaps — the padded years past currYear are the
    // same kind of "hasn't happened yet" as a future month in the Year
    // tab, so they get the same disabled/untappable treatment.
    if (timeRange === '5y' && lifetimeGranularity === 'year') {
      const idx = (chartData.years ?? []).indexOf(currYear);
      return idx === -1 ? null : idx;
    }
    return null;
  }, [timeRange, year, currYear, lifetimeGranularity, chartData]);

  // Mirrors the Calendar page's own "before earliest known activity" cutoff
  // (see spendShadeFor/getEarliestDate in utils/format.js) — a new account
  // that starts partway through the month otherwise has no way to tell "no
  // transactions yet because I didn't exist" apart from "no transactions
  // because nothing was spent," and every day before signup showed a false
  // no-spend dot.
  const disabledBeforeIndex = useMemo(() => {
    if (timeRange !== 'month' && timeRange !== 'year') return null;
    // No transactions at all yet — nothing anchors "no spend before this," so
    // every day through today stays blank rather than dotted, same as the
    // Calendar page treats a brand new account. (Only the month view has dots.)
    if (!earliestDateStr) return timeRange === 'month' ? disabledAfterIndex + 1 : null;
    // Only applies when the first transaction falls within the period being
    // shown; an account with history from before it has nothing to cut off. In
    // the year view this is also what keeps the average from being spread over
    // the months before the first transaction, which had nothing in them.
    return firstBarWithData({ timeRange, earliestDateStr, year, currYear, currMonth });
  }, [timeRange, earliestDateStr, year, currYear, currMonth, disabledAfterIndex]);

  // Overview's income/expense split for whatever period is currently
  // shown — same per-period drill-down as Expense/Income's displayAmount
  // below. Kept separate (rather than only computing the net) so the
  // breakdown line under the amount can show both halves, not just their
  // difference.
  const overviewBreakdown = useMemo(() => {
    if (chartTab !== 'overview') return null;
    if (timeRange === 'month' && selectedDay != null) {
      return { income: chartData.income[selectedDay - 1] ?? 0, expense: chartData.expense[selectedDay - 1] ?? 0 };
    }
    if (timeRange === 'year' && selectedMonth != null) {
      return {
        income: getMonthTotal(transactions, 'income', selectedMonth, year),
        expense: getMonthTotal(transactions, 'expense', selectedMonth, year),
      };
    }
    if (timeRange === '5y' && selectedPeriodIndex >= 0) {
      return { income: chartData.income[selectedPeriodIndex] ?? 0, expense: chartData.expense[selectedPeriodIndex] ?? 0 };
    }
    return {
      income: chartData.income.reduce((a, b) => a + b, 0),
      expense: chartData.expense.reduce((a, b) => a + b, 0),
    };
  }, [chartTab, timeRange, chartData, transactions, selectedMonth, year, selectedPeriodIndex, selectedDay]);

  const displayAmount = useMemo(() => {
    const inc_ = chartTab === 'income';
    if (chartTab === 'overview') return overviewBreakdown.income - overviewBreakdown.expense;
    if (timeRange === 'year' && selectedMonth != null) return getMonthTotal(transactions, chartTab, selectedMonth, year);
    if (timeRange === '5y' && selectedPeriodIndex >= 0) {
      return inc_ ? chartData.income[selectedPeriodIndex] : chartData.expense[selectedPeriodIndex];
    }
    const arr = inc_ ? chartData.income : chartData.expense;
    if (timeRange === 'month' && selectedDay != null) return arr[selectedDay - 1] ?? 0;
    return arr.reduce((a, b) => a + b, 0);
  }, [chartTab, chartData, timeRange, transactions, selectedMonth, year, selectedPeriodIndex, selectedDay, overviewBreakdown]);

  const isIncome    = chartTab === 'income';
  const isOverview  = chartTab === 'overview';
  const netPositive = displayAmount >= 0;

  const periodLabel = useMemo(() => {
    if (timeRange === 'month') {
      return selectedDay != null ? `${MONTH_NAMES[currMonth]} ${selectedDay}` : MONTH_NAMES[currMonth];
    }
    if (timeRange === 'year') {
      return selectedMonth != null ? MONTH_NAMES[selectedMonth] : String(year);
    }
    if (timeRange === '5y') {
      if (selectedPeriod != null) {
        return selectedPeriod.month != null
          ? `${MONTH_NAMES[selectedPeriod.month]} ${selectedPeriod.year}`
          : String(selectedPeriod.year);
      }
      return earliestYear === currYear ? String(currYear) : `${earliestYear} – ${currYear}`;
    }
    return String(currYear);
  }, [timeRange, selectedMonth, currYear, currMonth, selectedPeriod, earliestYear, selectedDay, year]);

  const lineChartData = useMemo(() => {
    let income = chartData.income, expense = chartData.expense, labels = chartData.labels;
    // Daily-within-month view (chartData here is always the current month —
    // see the chartData useMemo above) — truncate to today's day so the
    // line doesn't run flat out to day 31 for days that haven't happened
    // yet, same idea as the other two truncations below.
    if (timeRange === 'month') {
      const end = new Date().getDate();
      income = income.slice(0, end); expense = expense.slice(0, end); labels = labels.slice(0, end);
    } else if (timeRange === 'year' && year >= currYear) {
      const end = new Date().getMonth() + 1;
      income = income.slice(0, end); expense = expense.slice(0, end); labels = labels.slice(0, end);
    } else if (timeRange === '5y' && lifetimeGranularity === 'year') {
      // getLifetimeYearly pads forward to MIN_YEAR_SLOTS with as-yet-empty
      // future years (see its own comment, and BarChart's disabledAfterIndex
      // handling of the same padding) — same truncation idea, cut the line
      // off at the current year instead of trailing flat through them.
      const idx = (chartData.years ?? []).indexOf(currYear);
      if (idx !== -1) {
        income = income.slice(0, idx + 1); expense = expense.slice(0, idx + 1); labels = labels.slice(0, idx + 1);
      }
    }
    return { income, expense, labels };
  }, [chartData, timeRange, year, currYear, lifetimeGranularity]);

  // Includes chartTab — switching Expense<->Income should replay the full
  // collapse-and-regrow reveal too, not just an actual timeRange/year
  // change, so every switch reads as a clean redraw from left to right.
  const animKey   = `${timeRange}-${year}-${chartTab}`;
  const labelStep = timeRange === 'month' ? 4 : (timeRange === '5y' && lifetimeGranularity === 'month' ? 6 : 1);

  // Shared between BarChart (Expense/Income) and LineChart (Overview) — same
  // drill-down selection, just a different chart shape to show it on.
  const chartActiveIndex =
    timeRange === 'month' && selectedDay != null ? selectedDay - 1 :
    timeRange === 'year' ? (selectedMonth ?? -1) :
    timeRange === '5y' ? selectedPeriodIndex :
    -1;

  // Very small, deliberately — a dip-and-recover on the chart's own
  // opacity when switching between the September/2026/All Time pills
  // (timeRange only, not every chartTab/Expense-Income-Overview switch).
  // Never drops fully to 0 — that read as a bigger transition than this
  // is meant to be; a shallow dip is enough to soften the swap without
  // becoming its own moment.
  const prevTimeRangeRef = useRef(timeRange);
  const chartOpacity = useSharedValue(1);
  useEffect(() => {
    if (prevTimeRangeRef.current === timeRange) return;
    prevTimeRangeRef.current = timeRange;
    chartOpacity.value = 0.25;
    chartOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [timeRange, chartOpacity]);
  const chartAnimStyle = useAnimatedStyle(() => ({ opacity: chartOpacity.value }));

  return (
    <View className="mx-4 mb-3 pt-5 pb-5">
      <Animated.View style={chartAnimStyle}>
        <Text className="text-base text-center mb-2" style={{ color: textColor(light).tertiary }}>{periodLabel}</Text>

        <View className="items-center justify-center mb-8">
          <AnimatedAmount value={Math.abs(displayAmount)} color={isOverview ? (netPositive ? '#4ade80' : 'rgba(255,75,75,0.92)') : (light ? '#111111' : '#ffffff')} />
        </View>

        <View className="mt-4">
          {isOverview ? (
            // No `key={animKey}` — that forced a full remount on every
            // period switch, discarding the chart's measured width and
            // remounting the whole SVG. Staying mounted and passing the
            // range as `revealKey` gets the same replayed growing reveal
            // without the remount. It also plays whenever Overview is
            // entered (fresh mount on a tab switch, or the screen
            // regaining focus).
            <LineChart
              incomeData={lineChartData.income}
              expenseData={lineChartData.expense}
              labels={lineChartData.labels}
              light={light}
              activeIndex={chartActiveIndex}
              revealKey={timeRange}
            />
          ) : (
            // No onBarClick/onDeselect: neither chart is a drill-down at any
            // range. Omitting them is what removes the interaction — BarChart
            // renders its per-bar touch-target Rects and the deselect-background
            // Rect only when those props are present.
            <BarChart
              values={barValues}
              labels={chartData.labels}
              activeIndex={chartActiveIndex}
              disabledAfterIndex={disabledAfterIndex}
              disabledBeforeIndex={disabledBeforeIndex}
              hideLabelAfterIndex={timeRange === '5y' && lifetimeGranularity === 'year' ? disabledAfterIndex : null}
              isIncome={isIncome}
              animKey={animKey}
              labelStep={labelStep}
              useSqrtScale={timeRange === 'month'}
              // Not until there's actually data to say it about. On the
              // first render transactions is still [], so every day reads
              // as zero and the whole month fills with "no spend" dots —
              // both a lie (nothing has loaded yet, that isn't the same as
              // nothing was spent) and the source of the Expense-tab-only
              // flicker: when the real values land, every day that turns
              // out to have spending unmounts its dot and mounts a Bar in
              // its place, kicking off a second staggered reveal partway
              // through the first. Income never showed it because its
              // zero-days render an invisible placeholder instead of a dot.
              noSpendDots={timeRange === 'month' && chartTab === 'expense' && transactions.length > 0}
              showAverage={timeRange === 'month' || timeRange === 'year'}
              topPad={AVG_ROOM}
              light={light}
            />
          )}
        </View>
      </Animated.View>

      <RangeSelector value={timeRange} onChange={onTimeRangeChange} light={light} />
    </View>
  );
}

export default memo(SummaryCard);
