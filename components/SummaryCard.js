import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { parseISO } from 'date-fns';
import BarChart, { BAR_CHART_ASPECT } from './BarChart';
import LineChart from './LineChart';
import { GlassPressable } from './Glass';
import { ChevronRight } from './icons';
import {
  getMonthTotal,
  getMonthlyTotals,
  getDailyTotals,
  getLifetimeYearly,
  getLifetimeMonthly,
  getEarliestDate,
  firstBarWithData,
  currentMonthYear,
  formatCurrency,
} from '../utils/format';
import { textColor } from '../utils/colors';
import { CAPTION, TABULAR, FONT } from '../utils/type';

const LIFETIME_YEARLY_THRESHOLD = 2; // years of history before "All Time" switches from monthly to yearly bars
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { SETTLE_EASING } from '../utils/motion';

// Temporary — trying the chart with just Month, no Year/All Time picker.
// Hidden, not deleted; see the render's own comment on RangeSelector.
const SHOW_RANGE_SELECTOR = false;

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

// Plain words, no pills. A segmented control announces itself as chrome
// before it says anything about the data; three words with only the live
// one brightened carry the same choice at a fraction of the weight.
function RangeSelector({ value, onChange, light }) {
  return (
    // No top margin of its own any more — it used to sit below the chart
    // and needed the gap itself; now the amount block above it (mb-7)
    // already provides that space.
    <View className="flex-row items-center justify-center" style={{ gap: 22 }}>
      {RANGE_OPTIONS.map(opt => (
        value === opt.id ? (
          <GlassPressable
            key={opt.id}
            variant="field"
            radius={9999}
            onPress={() => onChange(opt.id)}
            className="px-1 py-1"
          >
            <Text className="text-base" style={{ color: light ? '#111111' : '#ffffff' }}>{opt.label}</Text>
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
            className="px-1 py-1"
          >
            <Text className="text-base" style={{ color: textColor(light).disabled }}>{opt.label}</Text>
          </GlassPressable>
        )
      ))}
    </View>
  );
}

// What the headline figure is OF, as one caption under it — just the period
// ("September"). Which of expense/income/overview it's a period OF is
// Header's ModeSwitch job, at the very top of the screen; this caption only
// ever names the period itself.
function PeriodCaption({ periodLabel, light }) {
  return (
    <Text style={[CAPTION, { color: textColor(light).tertiary }]}>{periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1).toLowerCase()}</Text>
  );
}

// One line under the headline amount — "avg daily spend – ₹450" and its
// kind. Dimmer than the period caption above the amount (disabled, not
// tertiary): this is a secondary reference figure, not something read on
// every glance the way the period or the amount itself are. fontSize 12,
// under CAPTION's 13, keeps it reading as the smallest thing on the card.
function AverageCaption({ info, light }) {
  // Always takes its line: Overview has no average, and without a stand-in the
  // chart below slid up by that much every time the tab changed.
  return (
    <Text style={{ fontSize: FONT.caption, fontWeight: '400', marginTop: 4, color: textColor(light).disabled }}>
      {info ? `${info.label} – ${formatCurrency(info.value)}` : '\u00A0'}
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
  selectedMonth,
  year,
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


  // What the chart plots depends on ModeSwitch above: Expense/Income show
  // that one series' own magnitude (always >= 0, so BarChart's per-bar sign
  // check never fires and every bar comes out one flat colour); Overview is
  // the net, income minus expense, which BarChart colours per bar by its
  // own sign (see toneFor in BarChart.js) — a period that came out ahead
  // reads green, one that didn't reads red, in the same chart.
  const barValues = useMemo(() => {
    if (mode === 'expense') return chartData.expense;
    if (mode === 'income') return chartData.income;
    return chartData.income.map((inc, i) => inc - (chartData.expense[i] ?? 0));
  }, [chartData, mode]);

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

  // The small "avg X spend/income – ₹Y" line under the headline amount —
  // daily in Month, monthly in Year, yearly in All Time. Skipped in
  // Overview: an average of income-minus-expense per period isn't a
  // figure anyone reads at a glance the way "avg daily spend" is, and
  // Overview already has no single series to average in the first place.
  //
  // Averaged over the same real (non-future, non-before-signup) range as
  // disabledBeforeIndex/disabledAfterIndex above. All Time always
  // averages true calendar years via a fresh getLifetimeYearly call, even
  // when the chart itself is showing monthly bars (a young account, see
  // lifetimeGranularity) — the bars being monthly there is a display
  // choice for readability, not what "average yearly spending" should mean.
  const averageInfo = useMemo(() => {
    if (mode === 'overview') return null;
    const noun = mode === 'income' ? 'income' : 'spend';

    if (timeRange === 'month' || timeRange === 'year') {
      const series = mode === 'income' ? chartData.income : chartData.expense;
      const startIdx = disabledBeforeIndex ?? 0;
      const endIdx = disabledAfterIndex ?? (series.length - 1);
      if (endIdx < startIdx) return null;
      const real = series.slice(startIdx, endIdx + 1);
      // Same "nothing to average" guard as BarChart's own hidden average
      // line: a single real period, or a period with nothing recorded in
      // it at all, isn't a reference figure worth showing.
      if (real.length < 2) return null;
      const total = real.reduce((a, b) => a + b, 0);
      if (total <= 0) return null;
      return {
        label: timeRange === 'month' ? `Avg daily ${noun}` : `Avg monthly ${noun}`,
        value: total / real.length,
      };
    }

    if (timeRange === '5y') {
      const yearly = getLifetimeYearly(transactions, earliestDateStr);
      const series = mode === 'income' ? yearly.income : yearly.expense;
      const currIdx = yearly.years.indexOf(currYear);
      const endIdx = currIdx === -1 ? series.length - 1 : currIdx;
      const real = series.slice(0, endIdx + 1);
      if (real.length < 2) return null;
      const total = real.reduce((a, b) => a + b, 0);
      if (total <= 0) return null;
      return { label: `Avg yearly ${noun}`, value: total / real.length };
    }

    return null;
  }, [mode, timeRange, chartData, disabledBeforeIndex, disabledAfterIndex, transactions, earliestDateStr, currYear]);

  // The income/expense split for whatever period is currently shown —
  // displayAmount below is just their difference.
  const overviewBreakdown = useMemo(() => {
    if (timeRange === 'month' && selectedDay != null) {
      return { income: chartData.income[selectedDay - 1] ?? 0, expense: chartData.expense[selectedDay - 1] ?? 0 };
    }
    if (timeRange === 'year' && selectedMonth != null) {
      return {
        income: getMonthTotal(transactions, 'income', selectedMonth, year),
        expense: getMonthTotal(transactions, 'expense', selectedMonth, year),
      };
    }
    return {
      income: chartData.income.reduce((a, b) => a + b, 0),
      expense: chartData.expense.reduce((a, b) => a + b, 0),
    };
  }, [timeRange, chartData, transactions, selectedMonth, year, selectedDay]);

  const displayAmount = overviewBreakdown.income - overviewBreakdown.expense;

  // The headline is just whichever of the three figures the header's
  // slider is currently pointed at. Always white now, same for all three
  // tabs — red/green stay on the slider label and the chart itself, which
  // is where "this is expense vs income" is actually being said; the
  // amount doesn't need to repeat it.
  const headlineValue =
    mode === 'expense' ? overviewBreakdown.expense :
    mode === 'income' ? overviewBreakdown.income :
    displayAmount;
  const headlineColor = textColor(light).primary;

  const periodLabel = useMemo(() => {
    if (timeRange === 'month') {
      return selectedDay != null ? `${MONTH_NAMES[currMonth]} ${selectedDay}` : MONTH_NAMES[currMonth];
    }
    if (timeRange === 'year') {
      return selectedMonth != null ? MONTH_NAMES[selectedMonth] : String(year);
    }
    if (timeRange === '5y') {
      return earliestYear === currYear ? String(currYear) : `${earliestYear} – ${currYear}`;
    }
    return String(currYear);
  }, [timeRange, selectedMonth, currYear, currMonth, earliestYear, selectedDay, year]);


  const animKey   = `${timeRange}-${year}-${mode}`;

  // Only a genuine mode switch gets the full grow-from-zero reveal — a
  // Month/Year/All swipe is frequent and minor (same chart type, just
  // paging), and replaying a staggered regrow on every single swipe added
  // real perceived lag to that; it now just snaps in under the slide
  // transition that already carries the swap (see chartTranslateX below),
  // which reads as instant rather than laggy. A mode switch is the bigger
  // context change (Overview can even swap chart types entirely, bars to a
  // line) and keeps the full reveal.
  //
  // The very first paint DOES get the grow-from-zero reveal, same as a mode
  // switch — this used to snap straight to full height instead, back when
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
  // that moment specifically, in addition to a real mode switch — without
  // it, `mode` hadn't changed between the empty and the loaded render, so
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
  const growFromZero = prevModeForRevealRef.current !== mode || (hasAnyData && !hadDataRef.current);
  prevModeForRevealRef.current = mode;
  if (hasAnyData) hadDataRef.current = true;
  const chartInstant = !growFromZero;
  const labelStep = timeRange === 'month' ? 4 : (timeRange === '5y' && lifetimeGranularity === 'month' ? 6 : 1);

  // No per-bar selection in 5y — see the BarChart/LineChart call sites'
  // own comment on why "All Time" isn't a drill-down at any range.
  const chartActiveIndex =
    timeRange === 'month' && selectedDay != null ? selectedDay - 1 :
    timeRange === 'year' ? (selectedMonth ?? -1) :
    -1;

  // A directional slide on just the chart itself (not the headline amount,
  // period caption or the page dots below — those live outside this
  // Animated.View, see the JSX below) when swiping between the Month/Year/
  // All Time pills, or between Expense/Income/Overview: the chart slides
  // fully off screen in the swipe direction; once it's off, the data swaps
  // (chartInstant snaps every bar straight to its new height — no
  // stagger); the chart then slides in from the opposite side. No fade —
  // tried a plain opacity dip (read as a light switching on/off) and a
  // dissolve+scale (softer, but ended up not liked either) before settling
  // back on this.
  //
  // pendingSlideDirRef carries the swipe's direction from the gesture
  // handler (UI thread) to changeRangeBy (JS thread, via runOnJS) to this
  // effect (fires after the next commit) — a plain ref write on the JS
  // side of runOnJS, not a worklet mutation, so it's safely visible by
  // the time this effect reads it. 0 means "not a swipe" (a mode switch,
  // which has no gesture direction to key off) — that path plays no slide
  // of its own; growFromZero's own stagger already gives a mode switch
  // its own visual continuity.
  const SLIDE_DISTANCE = 36;
  const SLIDE_OUT_MS = 160;
  const SLIDE_IN_MS = 320;

  const prevSwapKeyRef = useRef(animKey);
  const pendingSlideDirRef = useRef(0);
  const chartTranslateX = useSharedValue(0);
  useEffect(() => {
    if (prevSwapKeyRef.current === animKey) return;
    prevSwapKeyRef.current = animKey;
    const dir = pendingSlideDirRef.current;
    pendingSlideDirRef.current = 0;
    if (dir === 0) return;
    // Park the new (already-swapped-in) block on the far side, in the
    // same direction the old one just exited, then release it.
    chartTranslateX.value = dir * SLIDE_DISTANCE;
    chartTranslateX.value = withTiming(0, { duration: SLIDE_IN_MS, easing: SETTLE_EASING });
  }, [animKey, chartTranslateX]);
  const chartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chartTranslateX.value }],
  }));

  // Swipe the chart itself to change Month/Year/All — this is what actually
  // replaced the pill row (SHOW_RANGE_SELECTOR above): the three states
  // didn't go away, they just don't need a permanent row of chrome to
  // reach. Left = forward through the list (Month → Year → All, the same
  // order RANGE_OPTIONS already defines), right = back; stops at either
  // end rather than wrapping, since this is a zoom level, not a cycle.
  // activeOffsetX/failOffsetY mirror AddModal's own Pan gesture — a real
  // horizontal drag has to clear 15px before this claims the touch at all,
  // so a plain tap on a bar underneath is never contested.
  //
  // Split from the actual swap (changeRangeBy below) so the gesture handler
  // can check reachability BEFORE dimming the chart — a blocked swipe (e.g.
  // Income/Overview already on Year, swiping toward the Month it can't
  // reach) has to do nothing at all, not dip-and-never-recover, which is
  // what happened when changeRangeBy bailed out silently after the dip had
  // already started.
  const resolveNextRange = useCallback((delta) => {
    const idx = RANGE_OPTIONS.findIndex(o => o.id === timeRange);
    let nextIdx = idx + delta;
    // Income/Overview skip straight over Month — a day-by-day income figure
    // is mostly zeros with one payday spike, not a real trend, so those two
    // modes only ever land on Year/All; Month stays Expense-only.
    if (RANGE_OPTIONS[nextIdx]?.id === 'month' && mode !== 'expense') nextIdx += delta;
    if (nextIdx < 0 || nextIdx >= RANGE_OPTIONS.length) return null;
    return RANGE_OPTIONS[nextIdx].id;
  }, [timeRange, mode]);

  const changeRangeBy = useCallback((delta) => {
    const next = resolveNextRange(delta);
    if (next) {
      // Runs on the JS thread (changeRangeBy is only ever invoked via
      // runOnJS from the gesture worklet below) — a plain ref write here
      // is safely visible to the slide-in effect above once this commit
      // lands, unlike mutating a ref from inside the worklet itself.
      pendingSlideDirRef.current = delta;
      onTimeRangeChange(next);
    }
  }, [resolveNextRange, onTimeRangeChange]);

  // Which edge chevrons show, in lockstep with what a swipe can actually
  // do: Month is the first stop (only a "forward" arrow, on the right —
  // swiping left is what moves forward), Year sits in the middle (both
  // directions live), All is the last stop (only "back", on the left).
  // Income/Overview never reach Month (see changeRangeBy above), so on
  // Year, in those two modes, there's nowhere left to swipe back to.
  const rangeIndex = RANGE_OPTIONS.findIndex(o => o.id === timeRange);
  const showLeftChevron = rangeIndex > 0 && !(mode !== 'expense' && rangeIndex === 1);
  const showRightChevron = rangeIndex < RANGE_OPTIONS.length - 1;

  // The page-indicator dots below mirror only the stops a swipe can
  // actually reach — Income/Overview never touch Month (see
  // resolveNextRange above), so they get two dots (Year/All), not three
  // with an unreachable one baked in.
  const visibleRangeOptions = mode === 'expense' ? RANGE_OPTIONS : RANGE_OPTIONS.filter(o => o.id !== 'month');
  const dotIndex = visibleRangeOptions.findIndex(o => o.id === timeRange);

  const chartSwipe = useMemo(() => Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      const pastThreshold = Math.abs(e.translationX) > 50 || Math.abs(e.velocityX) > 500;
      if (!pastThreshold) return;
      const delta = e.translationX < 0 ? 1 : -1;
      // Same reachability check as resolveNextRange above, inlined rather
      // than called — this handler runs as a worklet on the UI thread, and
      // calling back into a plain JS closure from there needs runOnJS,
      // which can't hand back a return value to decide whether to slide.
      // Checking first (instead of letting changeRangeBy silently bail
      // after the slide-out had already started) is what actually matters
      // here: a blocked swipe used to dim the chart and then never
      // recover, since nothing changed to trigger the recovery effect —
      // same failure mode would apply to a slide left stranded off-screen.
      const idx = RANGE_OPTIONS.findIndex(o => o.id === timeRange);
      let nextIdx = idx + delta;
      if (RANGE_OPTIONS[nextIdx] && RANGE_OPTIONS[nextIdx].id === 'month' && mode !== 'expense') nextIdx += delta;
      if (nextIdx < 0 || nextIdx >= RANGE_OPTIONS.length) return;
      // Slides out first, and only calls into JS (which is what actually
      // swaps the data) once that's finished — see the comment above.
      // delta=1 is a forward swipe (finger moving left), so the block
      // exits to the left (-SLIDE_DISTANCE); delta=-1 exits right.
      chartTranslateX.value = withTiming(-delta * SLIDE_DISTANCE, { duration: SLIDE_OUT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(changeRangeBy)(delta);
      });
    }), [changeRangeBy, chartTranslateX, timeRange, mode]);

  return (
    // mx-5 (20), not mx-4 (16) — matches the Header's own px-5 and the
    // transaction list's gutter, so the amount, the header icons and the
    // row text all sit on one shared left edge instead of two. pb-8 (32),
    // not pb-5 (20): the list right below is a different group (this
    // card's month/range vs. that period's actual transactions), and wants
    // the larger between-groups gap rather than the tighter within-card one.
    <View className="mx-5 mb-1 pt-5 pb-8">
        <View className="items-center justify-center mb-7">
          {/* Above the figure now, not below it — the period reads as a
              heading for the number underneath rather than a caption
              trailing it. */}
          <PeriodCaption periodLabel={periodLabel} light={light} />

          <AnimatedAmount value={Math.abs(headlineValue)} color={headlineColor} />

          {/* Outside the chart's own sliding Animated.View (see
              chartAnimStyle below) — this is anchored to the amount, not
              the chart, so a Month/Year/All swipe doesn't drag it along;
              it just updates in place, same as AnimatedAmount above it. */}
          <AverageCaption info={averageInfo} light={light} />
        </View>

        {/* Hidden, not removed — Month/Year/All is off for now, so the chart
            just always shows Month (timeRange's own default in index.js).
            The selector, its handler and timeRange itself are all still
            wired up underneath; flip SHOW_RANGE_SELECTOR back on to bring
            the row back exactly as it was. */}
        {SHOW_RANGE_SELECTOR && (
          <RangeSelector value={timeRange} onChange={onTimeRangeChange} light={light} />
        )}

        {/* position:'relative' scopes the chevrons below to just this
            chart's own box, not the whole card — otherwise they'd center
            across the amount block above too. */}
        <View style={{ position: 'relative' }}>
          <GestureDetector gesture={chartSwipe}>
            <Animated.View className="mt-4" style={chartAnimStyle}>
              {mode === 'overview' ? (
                // Overview means "both together" — this is the same
                // income/expense pair barValues derives its net from, just
                // plotted as two lines instead of collapsed into one signed
                // bar per period. LineChart doesn't know about
                // disabledAfterIndex (a future day/month that hasn't
                // happened yet still plots as a real 0), unlike BarChart —
                // it never needed that for its one existing caller
                // (MonthlyRecapModal, always a completed past period) — now
                // that Overview reaches Year/All too, disabledAfterIndex is
                // passed through same as BarChart gets it: the x-axis still
                // spans the full 12 months (or padded year slots), but the
                // lines themselves stop at the last real point instead of
                // dropping to zero and running flat through the future.
                // Sits at the bottom of the same box the bar chart fills, so
                // its axis labels land where the bars' do and nothing below it
                // moves when the tab changes; any spare room is above it.
                <View style={{ width: '100%', aspectRatio: BAR_CHART_ASPECT, justifyContent: 'flex-end' }}>
                <LineChart
                  incomeData={chartData.income}
                  expenseData={chartData.expense}
                  labels={chartData.labels}
                  activeIndex={chartActiveIndex}
                  disabledAfterIndex={disabledAfterIndex}
                  // Year's labels are single letters (J/F/M/…), not "MMM
                  // YY" like All-time's — all 12 fit without crowding, so
                  // it gets every month's initial instead of the default
                  // 6-label cap meant for wider strings.
                  maxLabels={timeRange === 'year' ? 12 : 6}
                  revealKey={animKey}
                  instant={chartInstant}
                  light={light}
                />
                </View>
              ) : (
                // No onBarClick/onDeselect: this chart isn't a drill-down at
                // any range. Omitting them is what removes the interaction —
                // BarChart renders its per-bar touch-target Rects and the
                // deselect-background Rect only when those props are present.
                <BarChart
                  values={barValues}
                  labels={chartData.labels}
                  activeIndex={chartActiveIndex}
                  // Nothing tapped yet still gets one bar at full strength: the
                  // most recent real period (today, this month, this year — the
                  // same index the disabled-after cutoff is measured from), so
                  // the chart opens pointing at where you actually are.
                  accentIndex={chartActiveIndex >= 0 ? chartActiveIndex : disabledAfterIndex}
                  disabledAfterIndex={disabledAfterIndex}
                  disabledBeforeIndex={disabledBeforeIndex}
                  hideLabelAfterIndex={timeRange === '5y' && lifetimeGranularity === 'year' ? disabledAfterIndex : null}
                  // Expense mode's values are all >= 0 magnitudes with
                  // isIncome false, so toneFor's sign check never fires and
                  // every bar comes out flat red; Income mode mirrors that
                  // for green. (Overview no longer reaches this branch.)
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
                  light={light}
                />
              )}
            </Animated.View>
          </GestureDetector>

          {/* Pure hint, not a second tap target — pointerEvents="none" so
              these never compete with the swipe/tap gesture underneath,
              which already covers the whole chart. bottom:36 (more than the
              axis labels alone need) shifts the centring region up a bit,
              closer to the bars' own visual centre rather than the chart's
              full height including its labels. Which side(s) show is just
              rangeIndex's position in RANGE_OPTIONS (see above). */}
          {showLeftChevron && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 36, justifyContent: 'center' }}>
              <View style={{ transform: [{ rotate: '180deg' }] }}>
                <ChevronRight color={textColor(light).disabled} />
              </View>
            </View>
          )}
          {showRightChevron && (
            <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 36, justifyContent: 'center' }}>
              <ChevronRight color={textColor(light).disabled} />
            </View>
          )}
        </View>

        {/* A plain page-indicator, not colored — Month/Year/All aren't a
            money direction, so red/green stay reserved for the chart
            itself. Says "this is a slider, and you're on the Nth stop" at a
            glance; no animation of its own, deliberately — it just snaps
            with everything else now that a range swipe is instant (see
            chartInstant above), rather than adding its own separate motion. */}
        <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {visibleRangeOptions.map((opt, i) => (
            <View
              key={opt.id}
              style={{
                width: i === dotIndex ? 6 : 5,
                height: i === dotIndex ? 6 : 5,
                borderRadius: 3,
                backgroundColor: i === dotIndex ? textColor(light).primary : textColor(light).disabled,
              }}
            />
          ))}
        </View>
    </View>
  );
}

export default memo(SummaryCard);
