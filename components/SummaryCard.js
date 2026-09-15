import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring, withTiming, Easing } from 'react-native-reanimated';
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
  currentMonthYear,
} from '../utils/format';

const LIFETIME_YEARLY_THRESHOLD = 2; // years of history before "All Time" switches from monthly to yearly bars
import { MONTH_NAMES } from '../utils/monthlyRecap';

const MONTH_LABELS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

// 'ui-rounded', not 'SF Pro Rounded' (that name doesn't resolve — see
// AmountField.js's own ROUNDED_FONT comment) — used for the headline amount
// to match the rounded numeral style elsewhere in the app.
const ROUNDED_FONT = Platform.OS === 'ios' ? 'ui-rounded' : undefined;

// Own local digit, not AmountField's shared AmountDigit — that one scales
// in from its own center with a blur; this headline instead drops each
// digit in from above into its resting spot. Kept separate so tuning this
// doesn't also change the Add Transaction field's own already-tuned
// animation.
//
// Fade/blur and fall are driven by two separate values, not one — opacity
// riding directly on the same spring as the bounce read as rough/uneven
// (a spring's value isn't a smooth monotonic ramp, it overshoots and
// wobbles, which is exactly what you want for a *position* bounce but not
// for a fade). fadeProgress is a plain eased withTiming, so the fade/blur
// resolve smoothly on their own; fallProgress is the spring, only ever
// driving translateY, so its overshoot reads as a bounce in position, not
// a flicker in opacity.
const HEADLINE_FALL_DISTANCE = 4;
const HEADLINE_BLUR_MAX = 14; // same soft-halo cap as AmountField's own tuning
const HEADLINE_FADE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const HEADLINE_EXIT_DURATION = 220;

// A digit's own remount (key={str} on the row below unmounts every old
// digit at once) used to just vanish outright — no exiting prop meant an
// instant cut, at odds with how gently the entrance fades in. A plain
// opacity fade-out here is what makes the old value read as dissolving
// into/behind the new one rather than being yanked away.
function headlineDigitExiting() {
  'worklet';
  return {
    initialValues: { opacity: 1 },
    animations: {
      opacity: withTiming(0, { duration: HEADLINE_EXIT_DURATION, easing: Easing.out(Easing.cubic) }),
    },
  };
}

function HeadlineDigit({ char, delay, color, fontSize, lineHeight, fontWeight, letterSpacing }) {
  const fadeProgress = useSharedValue(0);
  const fallProgress = useSharedValue(0);

  useEffect(() => {
    fadeProgress.value = 0;
    fallProgress.value = 0;
    fadeProgress.value = withDelay(delay, withTiming(1, { duration: 340, easing: HEADLINE_FADE_EASING }));
    // Underdamped on purpose — this is what makes it overshoot slightly
    // past its resting position and settle back, the "subtle bounce" at
    // the end of the fall, instead of arriving and stopping dead. Lower
    // stiffness + a touch more damping than before — a snappier spring
    // here made the overshoot feel like a sharp flick rather than a
    // smooth settle.
    fallProgress.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 110, mass: 0.6 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const style = useAnimatedStyle(() => {
    const linearBlurT = Math.min(fadeProgress.value / 0.75, 1);
    const blurT = linearBlurT * linearBlurT * (3 - 2 * linearBlurT);
    // The spring driving the fall already overshoots past 1 before
    // settling — reusing that same overshoot for a tiny scale pop (only
    // once fallProgress passes 1) makes the bounce read clearly as a
    // bounce instead of being a barely-visible few pixels of vertical
    // motion on its own. Squared, not a plain linear clamp — a bare
    // Math.max(0, x) has a sharp slope change right at the crossover
    // (flat, then instantly ramping), which is exactly what read as a
    // snap instead of a smooth pop. Squaring tapers the onset in gently.
    const overshoot = Math.max(0, fallProgress.value - 1);
    const scaleBounce = 1 + overshoot * overshoot * 2.2;
    return {
      opacity: fadeProgress.value,
      transform: [
        { translateY: (1 - fallProgress.value) * -HEADLINE_FALL_DISTANCE },
        { scale: scaleBounce },
      ],
      textShadowRadius: Math.max(0, (1 - blurT) * HEADLINE_BLUR_MAX),
    };
  });

  return (
    <Animated.Text
      exiting={headlineDigitExiting}
      style={[
        {
          fontSize, lineHeight, fontWeight, color, letterSpacing, fontFamily: ROUNDED_FONT,
          textShadowColor: color, textShadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

const HEADLINE_STAGGER_STEP_MS = 36;
const HEADLINE_STAGGER_CAP_MS = 300;

function AnimatedAmount({ value, color }) {
  const str = fmt.format(value);
  return (
    <View className="flex-row" key={str}>
      {[...str].map((char, i) => (
        <HeadlineDigit
          key={i}
          char={char}
          delay={Math.min(i * HEADLINE_STAGGER_STEP_MS, HEADLINE_STAGGER_CAP_MS)}
          fontSize={44}
          lineHeight={52}
          fontWeight="600"
          letterSpacing={-1}
          color={color}
        />
      ))}
    </View>
  );
}

function RangeSelector({ value, onChange, currentYear, currentMonth, light }) {
  const options = [
    { id: 'month', label: MONTH_NAMES[currentMonth] },
    { id: 'year',  label: String(currentYear) },
    { id: '5y',    label: 'All Time' },
  ];
  return (
    <View className="flex-row items-center justify-center mt-6" style={{ gap: 8 }}>
      {options.map(opt => (
        value === opt.id ? (
          <GlassPressable
            key={opt.id}
            variant="pillActive"
            radius={9999}
            onPress={() => onChange(opt.id)}
            className="px-3 py-1"
          >
            <Text className="text-white text-base font-medium">{opt.label}</Text>
          </GlassPressable>
        ) : (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            className="px-3 py-1 rounded-full"
          >
            <Text className="text-base font-medium" style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }}>{opt.label}</Text>
          </Pressable>
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
  onMonthChange,
  selectedPeriod,
  onPeriodChange,
  selectedDay,
  onDayChange,
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
    if (timeRange !== 'month') return null;
    // No transactions at all yet — nothing anchors "no spend before this,"
    // so every day through today stays blank rather than dotted, same as
    // the Calendar page treats a brand new account.
    if (!earliestDateStr) return disabledAfterIndex + 1;
    const d = parseISO(earliestDateStr);
    // Only applies when the earliest transaction actually falls within the
    // month being shown; an account with history from an earlier month has
    // nothing to cut off this month.
    if (d.getFullYear() !== currYear || d.getMonth() !== currMonth) return null;
    return d.getDate() - 1;
  }, [timeRange, earliestDateStr, currYear, currMonth, disabledAfterIndex]);

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

  // BarChart is memo()-wrapped — inline arrows here would hand it a new
  // onBarClick/onDeselect identity every render (this card re-renders on
  // every transaction add/edit/delete) and defeat that memo entirely.
  // Precomputed per-mode so each stays stable across renders that don't
  // actually change its inputs, instead of just once per timeRange switch.
  const onBarClickMonth  = useCallback((i) => onDayChange(i + 1), [onDayChange]);
  const onBarClickPeriod = useCallback((i) => onPeriodChange(periodsList[i]), [onPeriodChange, periodsList]);
  const onDeselectMonth  = useCallback(() => onDayChange(null), [onDayChange]);
  const onBarClick =
    timeRange === 'month' ? onBarClickMonth :
    timeRange === 'year' ? onMonthChange :
    timeRange === '5y' ? onBarClickPeriod :
    null;
  const onDeselect = timeRange === 'month' ? onDeselectMonth : null;

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
    <View className="mx-4 mb-3 p-5">
      <Animated.View style={chartAnimStyle}>
        <Text className="text-base text-center mb-2" style={{ color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.40)' }}>{periodLabel}</Text>

        <View className="items-center justify-center mb-8">
          <AnimatedAmount value={Math.abs(displayAmount)} color={isOverview ? (netPositive ? '#4ade80' : 'rgba(239,68,68,0.92)') : (light ? '#111111' : '#ffffff')} />
        </View>

        <View className="mt-4">
          {isOverview ? (
            // No `key={animKey}` — this used to force a full remount on
            // every period switch (replaying LineChart's own one-time
            // width reveal every time, see its own comment). Staying
            // mounted across a switch is what lets that reveal genuinely
            // only play once, while still updating the curve's actual
            // shape/points instantly.
            <LineChart
              incomeData={lineChartData.income}
              expenseData={lineChartData.expense}
              labels={lineChartData.labels}
              light={light}
              activeIndex={chartActiveIndex}
              onPointClick={onBarClick}
              onDeselect={onDeselect}
            />
          ) : (
            <BarChart
              values={barValues}
              labels={chartData.labels}
              activeIndex={chartActiveIndex}
              onBarClick={onBarClick}
              onDeselect={onDeselect}
              disabledAfterIndex={disabledAfterIndex}
              disabledBeforeIndex={disabledBeforeIndex}
              hideLabelAfterIndex={timeRange === '5y' && lifetimeGranularity === 'year' ? disabledAfterIndex : null}
              isIncome={isIncome}
              animKey={animKey}
              labelStep={labelStep}
              useSqrtScale={timeRange === 'month'}
              noSpendDots={timeRange === 'month' && chartTab === 'expense'}
              showAverage={timeRange === 'month' || timeRange === 'year'}
              light={light}
            />
          )}
        </View>
      </Animated.View>

      <RangeSelector value={timeRange} onChange={onTimeRangeChange} currentYear={currYear} currentMonth={currMonth} light={light} />
    </View>
  );
}

export default memo(SummaryCard);
