import { memo, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';
import BarChart from './BarChart';
import LineChart from './LineChart';
import { GlassPressable } from './Glass';
import {
  formatCurrency,
  getDelta,
  getMonthTotal,
  getMonthlyTotals,
  getDailyTotals,
  getLifetimeYearly,
  getLifetimeMonthly,
  currentMonthYear,
} from '../utils/format';

const LIFETIME_YEARLY_THRESHOLD = 5; // years of history before "All Time" switches from monthly to yearly bars
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

function RangeSelector({ value, onChange, currentYear, currentMonth }) {
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
            <Text className="text-white/30 text-base font-medium">{opt.label}</Text>
          </Pressable>
        )
      ))}
    </View>
  );
}

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
}) {
  const { month: currMonth, year: currYear } = currentMonthYear();

  // Earliest transaction year decides "All Time" granularity — under 5
  // years of history, yearly bars would only show a handful of candles, so
  // months are shown instead; getLifetimeYearly takes over once there's
  // enough history for yearly bars to actually be useful.
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

  const displayAmount = useMemo(() => {
    const inc_ = chartTab === 'income';
    if (chartTab === 'overview') {
      const inc = chartData.income.reduce((a, b) => a + b, 0);
      const exp = chartData.expense.reduce((a, b) => a + b, 0);
      return inc - exp;
    }
    if (timeRange === 'year') return getMonthTotal(transactions, chartTab, selectedMonth, year);
    if (timeRange === '5y' && selectedPeriodIndex >= 0) {
      return inc_ ? chartData.income[selectedPeriodIndex] : chartData.expense[selectedPeriodIndex];
    }
    const arr = inc_ ? chartData.income : chartData.expense;
    return arr.reduce((a, b) => a + b, 0);
  }, [chartTab, chartData, timeRange, transactions, selectedMonth, year, selectedPeriodIndex]);

  const delta = useMemo(() => {
    if (chartTab === 'overview') return null;
    if (timeRange === 'year')  return getDelta(transactions, chartTab, selectedMonth, year);
    if (timeRange === 'month') return getDelta(transactions, chartTab, currMonth, currYear);
    return null;
  }, [chartTab, timeRange, transactions, selectedMonth, year, currMonth, currYear]);

  const isIncome    = chartTab === 'income';
  const isOverview  = chartTab === 'overview';
  const netPositive = displayAmount >= 0;

  const deltaPositive = delta && delta.diff >= 0;
  const deltaGood     = isIncome ? deltaPositive : !deltaPositive;
  const arrow          = delta && delta.diff !== 0 ? (deltaPositive ? '↑' : '↓') : null;
  const deltaText       = delta && delta.diff !== 0 ? formatCurrency(Math.abs(delta.diff)) : null;
  const deltaColor      = deltaGood ? 'rgba(74,222,128,0.9)' : 'rgba(248,113,113,0.9)';

  const periodLabel = useMemo(() => {
    if (timeRange === 'month') return MONTH_NAMES[currMonth];
    if (timeRange === 'year')  return MONTH_NAMES[selectedMonth];
    if (timeRange === '5y') {
      if (selectedPeriod != null) {
        return selectedPeriod.month != null ? `${MONTH_NAMES[selectedPeriod.month]} ${selectedPeriod.year}` : String(selectedPeriod.year);
      }
      return earliestYear === currYear ? String(currYear) : `${earliestYear} – ${currYear}`;
    }
    return String(currYear);
  }, [timeRange, selectedMonth, currYear, currMonth, selectedPeriod, earliestYear]);

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

  return (
    <View className="mx-4 mb-3 p-5">
      <Text className="text-white/40 text-base text-center mb-1">{periodLabel}</Text>

      <View className="items-center justify-center mb-2">
        <AnimatedAmount value={Math.abs(displayAmount)} color={isOverview ? (netPositive ? '#4ade80' : '#f87171') : '#ffffff'} />
      </View>

      <View className="items-center justify-center mb-5" style={{ minHeight: 16 }}>
        {isOverview ? null : deltaText ? (
          <View className="flex-row items-center" style={{ gap: 3 }}>
            <AnimatedDelta text={deltaText} style={{ color: deltaColor }} />
            {arrow && <Text className="text-base font-medium" style={{ color: deltaColor }}>{arrow}</Text>}
          </View>
        ) : (
          <Text className="text-base" style={{ color: 'rgba(255,255,255,0.2)' }}>—</Text>
        )}
      </View>

      {isOverview ? (
        <LineChart
          key={animKey}
          incomeData={lineChartData.income}
          expenseData={lineChartData.expense}
          labels={lineChartData.labels}
          animKey={animKey}
        />
      ) : (
        <BarChart
          values={barValues}
          labels={chartData.labels}
          activeIndex={
            timeRange === 'month' && selectedDay != null ? selectedDay - 1 :
            timeRange === 'year' ? selectedMonth :
            timeRange === '5y' ? selectedPeriodIndex :
            -1
          }
          onBarClick={onBarClick}
          onDeselect={onDeselect}
          disabledAfterIndex={disabledAfterIndex}
          isIncome={isIncome}
          animKey={animKey}
          labelStep={labelStep}
          useSqrtScale={timeRange === 'month'}
        />
      )}

      <RangeSelector value={timeRange} onChange={onTimeRangeChange} currentYear={currYear} currentMonth={currMonth} />
    </View>
  );
}

export default memo(SummaryCard);
