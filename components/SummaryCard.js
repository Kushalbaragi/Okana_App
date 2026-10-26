import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import BarChart, { ALL_TIME_BAR_W } from './BarChart';
import {
  getMonthlyTotals,
  getDailyTotals,
  getLifetimeYearly,
  getEarliestDate,
  firstBarWithData,
  currentMonthYear,
} from '../utils/format';
import { textColor } from '../utils/colors';
import { CAPTION, TABULAR, FONT } from '../utils/type';

import { MONTH_NAMES } from '../utils/monthlyRecap';
import { SETTLE_EASING } from '../utils/motion';

const MONTH_LABELS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];


const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

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
  fontSize: FONT.display,
  lineHeight: HEADLINE_HEIGHT,
  // A touch heavier than the original hairline (300) — still not semibold,
  // but the figure was reading as a little thin at this size.
  fontWeight: '400',
  letterSpacing: -1.75,
  ...TABULAR,
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

// The chart's three ranges, in the order they're offered: Month, Year, All Time.
const RANGE_OPTIONS = [
  { id: 'month', label: 'Month' },
  { id: 'year',  label: 'Year' },
  { id: '5y',    label: 'All' },
];

// What the headline figure is OF, as one caption under it — just the period
// ("September"). Which of expense/income it's a period OF is
// Header's ModeSwitch job, at the very top of the screen; this caption only
// ever names the period itself.
function PeriodCaption({ periodLabel, light }) {
  return (
    <Text style={[CAPTION, { color: textColor(light).tertiary }]}>{periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1).toLowerCase()}</Text>
  );
}

// One line under the headline amount: how the amount moved against the one before it
// ("↑ 12% vs March"). On Year/All that is the picked bar against the bar before it; on
// Month it is this month so far against last month up to the same day. Nothing when
// there is nothing earlier to compare with or it was zero, since a percentage of zero
// means nothing. It always takes its line so the chart doesn't shift when it appears.
function ChangeLine({ change, light }) {
  if (!change) return <Text style={{ fontSize: FONT.caption, marginTop: 6 }}>{'\u00A0'}</Text>;
  return (
    <Text style={{ fontSize: FONT.caption, fontWeight: '400', marginTop: 6, color: textColor(light).tertiary, letterSpacing: -0.3, ...TABULAR }}>
      {`${change.pct >= 0 ? '↑' : '↓'} ${Math.abs(change.pct)}% vs ${change.label}`}
    </Text>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
function SummaryCard({
  transactions,
  timeRange,
  onTimeRangeChange,
  mode,
  year,
  light = false,
}) {
  const { month: currMonth, year: currYear } = currentMonthYear();

  // One shared scan for "earliest transaction" instead of three separate
  // ones — getLifetimeYearly used to independently
  // re-derive this same thing internally, on top of this component's own
  // copy, which made switching to "All Time" noticeably do more work than
  // Month/Year (neither of which needs an account-wide earliest date at
  // all, just a same-year filter). getEarliestDate is the same helper the
  // Calendar page already uses for its own "before earliest activity" cutoff.
  const earliestDateStr = useMemo(() => getEarliestDate(transactions), [transactions]);
  // All Time is always yearly bars, even for a brand new account: one bar for
  // this year at the left, with the years after it as empty slots (see
  // getLifetimeYearly).
  const earliestYear = earliestDateStr ? parseISO(earliestDateStr).getFullYear() : currYear;

  const chartData = useMemo(() => {
    if (timeRange === 'month') return getDailyTotals(transactions, currMonth, currYear);
    if (timeRange === '5y') return getLifetimeYearly(transactions, earliestDateStr);
    const { income, expense } = getMonthlyTotals(transactions, year);
    return { income, expense, labels: MONTH_LABELS_SHORT };
  }, [transactions, timeRange, year, currYear, currMonth, earliestDateStr]);


  // What the chart plots follows the Expense/Income switch in the header: that one
  // series' own magnitude (always >= 0, so every bar comes out one flat colour).
  const barValues = mode === 'income' ? chartData.income : chartData.expense;

  const disabledAfterIndex = useMemo(() => {
    if (timeRange === 'month') return new Date().getDate() - 1;
    if (timeRange === 'year') {
      if (year < currYear) return null;
      if (year > currYear) return -1;
      return new Date().getMonth();
    }
    return null;
  }, [timeRange, year, currYear]);

  // Which bar is the current day / month / year, so its label can stand out.
  const currentIndex = useMemo(() => {
    if (timeRange === 'month') return new Date().getDate() - 1;
    if (timeRange === 'year') return year === currYear ? new Date().getMonth() : null;
    const i = chartData.labels.indexOf(String(currYear));
    return i >= 0 ? i : null;
  }, [timeRange, year, currYear, chartData]);

  // A "before earliest known activity" cutoff (see getEarliestDate in
  // utils/format.js) — a new account
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
    // the year view the months before the first transaction, which had nothing
    // in them, are left out too.
    return firstBarWithData({ timeRange, earliestDateStr, year, currYear, currMonth });
  }, [timeRange, earliestDateStr, year, currYear, currMonth, disabledAfterIndex]);

  // The income and expense totals for whatever period is currently shown; the
  // headline is whichever of the two the header's switch is on.
  // The bar the user tapped, by its position in the chart (day, month or year
  // depending on the range). It is stored together with the chart it was made on
  // and only counts while that is still the chart on screen: an index means
  // nothing in another chart (day 20 is not a month), and clearing it in an effect
  // would leave one render of the new chart reading the old index.
  const animKey = `${timeRange}-${year}-${mode}`;
  const [pick, setPick] = useState(null);
  const picked = pick && pick.key === animKey ? pick.index : null;
  const pickBar = useCallback(i => setPick(p => (p && p.key === animKey && p.index === i ? null : { key: animKey, index: i })), [animKey]);
  const clearPick = useCallback(() => setPick(null), []);
  // A pick belongs to the chart it was made on. Without this it only went dormant on
  // a range switch and came back when returning to that chart; drop it for good.
  if (pick && pick.key !== animKey) setPick(null);

  const periodTotals = useMemo(() => {
    if (picked != null) {
      return { income: chartData.income[picked] ?? 0, expense: chartData.expense[picked] ?? 0 };
    }
    return {
      income: chartData.income.reduce((a, b) => a + b, 0),
      expense: chartData.expense.reduce((a, b) => a + b, 0),
    };
  }, [chartData, picked]);

  // Always white, for both tabs — red/green stay on the chart itself, which is
  // where "this is expense vs income" is actually being said; the amount doesn't
  // need to repeat it.
  const headlineValue = mode === 'income' ? periodTotals.income : periodTotals.expense;
  const headlineColor = textColor(light).primary;

  const periodLabel = useMemo(() => {
    if (picked != null) {
      if (timeRange === 'month') return `${MONTH_NAMES[currMonth]} ${picked + 1}`;
      if (timeRange === 'year') return MONTH_NAMES[picked] ?? String(year);
      return String(chartData.labels[picked] ?? currYear);
    }
    if (timeRange === 'month') return MONTH_NAMES[currMonth];
    if (timeRange === 'year') return String(year);
    return earliestYear === currYear ? String(currYear) : `${earliestYear} – ${currYear}`;
  }, [timeRange, picked, chartData, currYear, currMonth, earliestYear, year]);

  // Year and All only: the picked bar against the one before it. In the year chart
  // January's earlier bar is last year's December, which isn't in the chart, so it
  // is looked up on its own.
  const change = useMemo(() => {
    if (timeRange === 'month') {
      // Only the whole month, on Expense (Income has no month view): this month's total against all of
      // last month's.
      if (picked != null || mode !== 'expense') return null;
      const prevMonth = (currMonth + 11) % 12;
      const prevYear = currMonth === 0 ? currYear - 1 : currYear;
      const sum = arr => arr.reduce((a, b) => a + b, 0);
      const cur = sum(chartData.expense);
      const prev = sum(getDailyTotals(transactions, prevMonth, prevYear).expense);
      if (!prev) return null;
      return { pct: Math.round(((cur - prev) / prev) * 100), label: MONTH_NAMES[prevMonth] };
    }
    if (picked == null) return null;
    const cur = barValues[picked];
    if (cur == null) return null;
    let prev;
    let label;
    if (picked >= 1) {
      prev = barValues[picked - 1];
      label = timeRange === 'year' ? MONTH_NAMES[picked - 1] : String(chartData.labels[picked - 1]);
    } else if (timeRange === 'year') {
      const last = getMonthlyTotals(transactions, year - 1);
      prev = (mode === 'income' ? last.income : last.expense)[11];
      label = MONTH_NAMES[11];
    }
    if (!prev) return null;
    return { pct: Math.round(((cur - prev) / prev) * 100), label };
  }, [picked, timeRange, barValues, chartData, transactions, year, mode, currMonth, currYear]);

  // The bars grow up from the baseline, one after another, whenever the chart
  // becomes a different chart: a mode switch (Expense/Income) or a range change
  // (Month/Year/All). Anything else that re-renders it — a transaction added, the
  // period caption changing — leaves the bars where they are.
  //
  // The very first paint gets the same reveal — this used to snap straight to full height instead, back when
  // the whole home screen's fade-in waited on the network round trip (see
  // Dashboard's entranceProgress/txInitialLoading); a staggered bar reveal
  // underneath that slow fade read as the chart loading in a second,
  // separate wave after the header. Now that the fade starts as soon as
  // the (near-instant) cache is checked, the bars growing in happens as
  // part of that same first paint instead of trailing it.
  //
  // "First paint" isn't just "first render", though: on a cold launch this
  // component renders once with `transactions` still empty (before the
  // cache/network fetch resolves), and every bar is a zero-height `Rect`
  // placeholder, not a `Bar` (see BarChart's hasData check) — nothing to
  // reveal yet. The *next* render, once real data lands, is what actually
  // flips those placeholders into real `Bar`s for the first time — a
  // different element type at the same Fragment key, so React mounts a
  // genuinely fresh Bar instance right then. `hadDataRef` is what catches
  // that moment specifically, in addition to a real mode or range switch —
  // without it, neither had changed between the empty and the loaded render, so
  // the reveal looked already "used up" by the earlier, data-less paint,
  // and this fresh Bar mounted straight at `instant=true`, silently
  // skipping the grow-in on exactly the render that needed it.
  //
  // Writing to a ref during render like this — not in an effect — is what
  // lets `chartInstant` reflect *this* render's change rather than
  // lagging a render behind; see React's own "adjusting state as you
  // render" pattern for why that's safe here (no setState involved).
  const prevModeForRevealRef = useRef(null);
  const hadDataRef = useRef(false);
  const hasAnyData = transactions.length > 0;
  const revealKey = `${mode}-${timeRange}`;
  const growFromZero = prevModeForRevealRef.current !== revealKey || (hasAnyData && !hadDataRef.current);
  prevModeForRevealRef.current = revealKey;
  if (hasAnyData) hadDataRef.current = true;
  const chartInstant = !growFromZero;
  const labelStep = timeRange === 'month' ? 4 : 1;

  // Income never shows Month — a day-by-day income figure is mostly zeros with one
  // payday spike, not a real trend — so it gets two choices (Year/All), not three
  // with a dead one among them.
  const visibleRangeOptions = mode === 'expense' ? RANGE_OPTIONS : RANGE_OPTIONS.filter(o => o.id !== 'month');
  // Short range labels: 1M (this month), 1Y (this year), All.
  const rangeLabel = id => (id === 'month' ? '1M' : id === 'year' ? '1Y' : 'All');

  return (
    // mx-5 (20), not mx-4 (16) — matches the Header's own px-5 and the
    // transaction list's gutter, so the amount, the header icons and the
    // row text all sit on one shared left edge instead of two. pb-5 (20): the
    // list right below is a different group, but the gap was trimmed from pb-8
    // (32) to keep the chart and the transactions feeling like one screen.
    <View className="mx-5 mb-1 pt-10 pb-5">
        <View className="items-center justify-center mb-7">
          {/* Above the figure now, not below it — the period reads as a
              heading for the number underneath rather than a caption
              trailing it. */}
          <PeriodCaption periodLabel={periodLabel} light={light} />

          <AnimatedAmount value={Math.abs(headlineValue)} color={headlineColor} />

          <ChangeLine change={change} light={light} />
        </View>

        <View style={{ position: 'relative' }}>
          <View className="mt-4">
                <BarChart
                  values={barValues}
                  labels={chartData.labels}
                  // Every bar is the same neutral strength until one is tapped; that
                  // one comes up to full colour and the headline above shows it.
                  activeIndex={picked ?? -1}
                  currentIndex={currentIndex}
                  onBarPress={pickBar}
                  onDeselect={clearPick}
                  disabledAfterIndex={disabledAfterIndex}
                  disabledBeforeIndex={disabledBeforeIndex}
                  // Expense mode's values are all >= 0 magnitudes with
                  // isIncome false, so toneFor's sign check never fires and
                  // every bar comes out flat red; Income mode mirrors that
                  // for green.
                  isIncome={mode !== 'expense'}
                  animKey={animKey}
                  labelStep={labelStep}
                  useSqrtScale={timeRange === 'month'}
                  // Only in Expense + Month: that's the one combination
                  // where a bar reading exactly 0 is unambiguously "spent
                  // nothing that day" — Income's 0 isn't a "no spend" day,
                  // and Year/All's bars are monthly totals, not single days.
                  noSpendDots={mode === 'expense' && timeRange === 'month'}
                  instant={chartInstant}
                  // All Time has few bars, which would otherwise come out wide:
                  // they get a width of their own, a little wider than the Year tab's.
                  barWidth={timeRange === '5y' ? ALL_TIME_BAR_W : undefined}
                  light={light}
                />
          </View>
        </View>

        {/* The chart's range, as three words to tap. Not coloured — Month/Year/All
            aren't a money direction, so red/green stay reserved for the chart
            itself; the one that's on sits in a quiet pill and the others are
            plain text. */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 14 }}>
          {visibleRangeOptions.map(opt => {
            const on = opt.id === timeRange;
            return (
              <Pressable
                key={opt.id}
                onPress={() => { if (!on) onTimeRangeChange(opt.id); }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={opt.id === '5y' ? 'All time' : opt.id === 'month' ? 'This month' : 'This year'}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: on ? (light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)') : 'transparent',
                }}
              >
                <Text style={[CAPTION, { color: on ? textColor(light).primary : textColor(light).tertiary }]}>{rangeLabel(opt.id)}</Text>
              </Pressable>
            );
          })}
        </View>
    </View>
  );
}

export default memo(SummaryCard);
