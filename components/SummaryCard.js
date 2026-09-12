import { memo, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';
import BarChart from './BarChart';
import LineChart from './LineChart';
import { GlassPressable } from './Glass';
import {
  formatCurrency,
  getDelta,
  getDayDelta,
  getMonthTotal,
  getMonthlyTotals,
  getDailyTotals,
  getLifetimeYearly,
  getLifetimeMonthly,
  getEarliestDate,
  currentMonthYear,
  toDateStr,
} from '../utils/format';

const LIFETIME_YEARLY_THRESHOLD = 2; // years of history before "All Time" switches from monthly to yearly bars
import { MONTH_NAMES } from '../utils/monthlyRecap';

const MONTH_LABELS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

// Matches web's `.digit-up` keyframe exactly (translateY 18%→0, 500ms,
// cubic-bezier(0.16,1,0.3,1) — an ease-out-expo "settle" feel) rather than
// Reanimated's generic FadeInUp preset, which uses a different curve/travel
// distance and reads as a slightly different, less "settled" motion.
const DIGIT_EASING = Easing.bezier(0.16, 1, 0.3, 1);

function Digit({ char, delay, distance, style, className }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 500, easing: DIGIT_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return (
    <Animated.Text className={className} style={[style, animStyle]}>
      {char === ' ' ? ' ' : char}
    </Animated.Text>
  );
}

function AnimatedAmount({ value, color }) {
  const str = fmt.format(value);
  return (
    <View className="flex-row" key={str}>
      {[...str].map((char, i) => (
        <Digit
          key={i}
          char={char}
          delay={i * 22}
          distance={7}
          className="font-bold tracking-tight"
          style={{ color, fontSize: 38 }}
        />
      ))}
    </View>
  );
}

function AnimatedDelta({ text, style }) {
  return (
    <View className="flex-row" key={text}>
      {[...text].map((char, i) => (
        <Digit key={i} char={char} delay={i * 20} distance={4} className="text-base" style={style} />
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
    <View className="flex-row items-center justify-center mt-4" style={{ gap: 8 }}>
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

  // Earliest transaction year decides "All Time" granularity — under
  // LIFETIME_YEARLY_THRESHOLD years of history, yearly bars would only show
  // a handful of candles, so months are shown instead; getLifetimeYearly
  // takes over once there's enough history for yearly bars to actually be
  // useful.
  const earliestYear = useMemo(() => {
    if (!transactions.length) return currYear;
    return transactions.reduce((min, tx) => {
      const y = new Date(tx.date).getFullYear(); return y < min ? y : min;
    }, currYear);
  }, [transactions, currYear]);
  const lifetimeGranularity = (currYear - earliestYear + 1) < LIFETIME_YEARLY_THRESHOLD ? 'month' : 'year';

  const chartData = useMemo(() => {
    if (timeRange === 'month') return getDailyTotals(transactions, currMonth, currYear);
    if (timeRange === '5y') {
      return lifetimeGranularity === 'year' ? getLifetimeYearly(transactions) : getLifetimeMonthly(transactions);
    }
    const { income, expense } = getMonthlyTotals(transactions, year);
    return { income, expense, labels: MONTH_LABELS_SHORT };
  }, [transactions, timeRange, year, currYear, currMonth, lifetimeGranularity]);

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
    if (timeRange !== 'year') return null;
    if (year < currYear) return null;
    if (year > currYear) return -1;
    return new Date().getMonth();
  }, [timeRange, year, currYear]);

  // Mirrors the Calendar page's own "before earliest known activity" cutoff
  // (see spendShadeFor/getEarliestDate in utils/format.js) — a new account
  // that starts partway through the month otherwise has no way to tell "no
  // transactions yet because I didn't exist" apart from "no transactions
  // because nothing was spent," and every day before signup showed a false
  // no-spend dot.
  const disabledBeforeIndex = useMemo(() => {
    if (timeRange !== 'month') return null;
    const earliest = getEarliestDate(transactions);
    // No transactions at all yet — nothing anchors "no spend before this,"
    // so every day through today stays blank rather than dotted, same as
    // the Calendar page treats a brand new account.
    if (!earliest) return disabledAfterIndex + 1;
    const d = new Date(earliest);
    // Only applies when the earliest transaction actually falls within the
    // month being shown; an account with history from an earlier month has
    // nothing to cut off this month.
    if (d.getFullYear() !== currYear || d.getMonth() !== currMonth) return null;
    return d.getDate() - 1;
  }, [timeRange, transactions, currYear, currMonth, disabledAfterIndex]);

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

  const delta = useMemo(() => {
    if (chartTab === 'overview') return null;
    if (timeRange === 'year' && selectedMonth != null) return getDelta(transactions, chartTab, selectedMonth, year);
    // A specific day selected compares against the day before instead of
    // the month-over-month comparison below — that one has nothing to do
    // with the single day's amount now showing above it.
    if (timeRange === 'month' && selectedDay != null) {
      return getDayDelta(transactions, chartTab, toDateStr(new Date(currYear, currMonth, selectedDay)));
    }
    if (timeRange === 'month') return getDelta(transactions, chartTab, currMonth, currYear);
    return null;
  }, [chartTab, timeRange, transactions, selectedMonth, year, currMonth, currYear, selectedDay]);

  // "₹27,612 ↓" alone doesn't say what it's being compared against — this
  // mirrors delta's own branches (previous month, or the day before for a
  // selected day) into the readable "vs X" that goes with it.
  const deltaVsLabel = useMemo(() => {
    if (!delta) return null;
    if (timeRange === 'year' && selectedMonth != null) {
      return `vs ${MONTH_NAMES[selectedMonth === 0 ? 11 : selectedMonth - 1]}`;
    }
    if (timeRange === 'month' && selectedDay != null) {
      const prev = new Date(currYear, currMonth, selectedDay - 1);
      return `vs ${MONTH_NAMES[prev.getMonth()]} ${prev.getDate()}`;
    }
    if (timeRange === 'month') {
      return `vs ${MONTH_NAMES[currMonth === 0 ? 11 : currMonth - 1]}`;
    }
    return null;
  }, [delta, timeRange, selectedMonth, selectedDay, currMonth, currYear]);

  const isIncome    = chartTab === 'income';
  const isOverview  = chartTab === 'overview';
  const netPositive = displayAmount >= 0;

  const deltaPositive = delta && delta.diff >= 0;
  const deltaGood     = isIncome ? deltaPositive : !deltaPositive;
  const arrow          = delta && delta.diff !== 0 ? (deltaPositive ? '↑' : '↓') : null;
  const deltaText       = delta && delta.diff !== 0 ? formatCurrency(Math.abs(delta.diff)) : null;
  const deltaColor      = deltaGood ? 'rgba(74,222,128,0.9)' : 'rgba(248,113,113,0.9)';

  // A bare period ("2026", "September 11") makes the big number below it
  // ambiguous on first glance — a new user has to cross-reference the
  // Expense/Income/Overview tab above to know what it even means. Reads
  // as "{period} {noun}" (e.g. "September Earnings") rather than a
  // second line or a repeat of the tab name above the card.
  const periodNoun = chartTab === 'income' ? 'Earnings' : chartTab === 'overview' ? 'Net saved' : 'Spending';

  const periodLabel = useMemo(() => {
    if (timeRange === 'month') {
      const period = selectedDay != null ? `${MONTH_NAMES[currMonth]} ${selectedDay}` : MONTH_NAMES[currMonth];
      return `${period} ${periodNoun}`;
    }
    if (timeRange === 'year') {
      const period = selectedMonth != null ? MONTH_NAMES[selectedMonth] : String(year);
      return `${period} ${periodNoun}`;
    }
    if (timeRange === '5y') {
      if (selectedPeriod != null) {
        const period = selectedPeriod.month != null
          ? `${MONTH_NAMES[selectedPeriod.month]} ${selectedPeriod.year}`
          : String(selectedPeriod.year);
        return `${period} ${periodNoun}`;
      }
      const range = earliestYear === currYear ? String(currYear) : `${earliestYear} – ${currYear}`;
      return `${range} ${periodNoun}`;
    }
    return `${currYear} ${periodNoun}`;
  }, [timeRange, selectedMonth, currYear, currMonth, selectedPeriod, earliestYear, selectedDay, year, periodNoun]);

  const lineChartData = useMemo(() => {
    // Daily-within-month view (chartData here is always the current month —
    // see the chartData useMemo above) — truncate to today's day so the
    // line doesn't run flat out to day 31 for days that haven't happened
    // yet, same idea as the year-view truncation below.
    if (timeRange === 'month') {
      const end = new Date().getDate();
      return {
        income:  chartData.income.slice(0, end),
        expense: chartData.expense.slice(0, end),
        labels:  chartData.labels.slice(0, end),
      };
    }
    if (timeRange !== 'year' || year < currYear) return chartData;
    const end = new Date().getMonth() + 1;
    return {
      income:  chartData.income.slice(0, end),
      expense: chartData.expense.slice(0, end),
      labels:  chartData.labels.slice(0, end),
    };
  }, [chartData, timeRange, year, currYear]);

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

  return (
    <View className="mx-4 mb-3 p-5">
      <Text className="text-base text-center mb-1" style={{ color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.40)' }}>{periodLabel}</Text>

      <View className="items-center justify-center mb-2">
        <AnimatedAmount value={Math.abs(displayAmount)} color={isOverview ? (netPositive ? '#4ade80' : '#f87171') : (light ? '#111111' : '#ffffff')} />
      </View>

      <View className="items-center justify-center mb-5" style={{ minHeight: 16 }}>
        {isOverview ? (
          // Overview's number alone is a net figure — this breaks it back
          // into its two halves so the full picture ("earned X, spent Y")
          // is visible without switching tabs.
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <Text className="text-sm" style={{ color: 'rgba(74,222,128,0.9)' }}>
              <Text className="font-semibold">{formatCurrency(overviewBreakdown.income)}</Text> income
            </Text>
            <Text className="text-sm" style={{ color: light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)' }}>·</Text>
            <Text className="text-sm" style={{ color: 'rgba(248,113,113,0.9)' }}>
              <Text className="font-semibold">{formatCurrency(overviewBreakdown.expense)}</Text> spent
            </Text>
          </View>
        ) : deltaText ? (
          <View className="flex-row items-center" style={{ gap: 3 }}>
            <AnimatedDelta text={deltaText} style={{ color: deltaColor }} />
            {arrow && <Text className="text-base font-medium" style={{ color: deltaColor }}>{arrow}</Text>}
            {deltaVsLabel && (
              <Text className="text-sm ml-0.5" style={{ color: light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}>
                {deltaVsLabel}
              </Text>
            )}
          </View>
        ) : (
          <Text className="text-base" style={{ color: light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)' }}>—</Text>
        )}
      </View>

      {isOverview ? (
        <LineChart
          key={animKey}
          incomeData={lineChartData.income}
          expenseData={lineChartData.expense}
          labels={lineChartData.labels}
          animKey={animKey}
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
          isIncome={isIncome}
          animKey={animKey}
          labelStep={labelStep}
          useSqrtScale={timeRange === 'month'}
          noSpendDots={timeRange === 'month' && chartTab === 'expense'}
          light={light}
        />
      )}

      <RangeSelector value={timeRange} onChange={onTimeRangeChange} currentYear={currYear} currentMonth={currMonth} light={light} />
    </View>
  );
}

export default memo(SummaryCard);
