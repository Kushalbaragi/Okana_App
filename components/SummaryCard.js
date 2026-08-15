import { memo, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
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
  currentMonthYear,
} from '../utils/format';

const MONTH_LABELS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function AnimatedAmount({ value, color }) {
  const str = fmt.format(value);
  return (
    <View className="flex-row" key={str}>
      {[...str].map((char, i) => (
        <Animated.Text
          key={i}
          entering={FadeInUp.delay(i * 22).duration(400)}
          className="text-4xl font-semibold tracking-tight"
          style={{ color }}
        >
          {char === ' ' ? ' ' : char}
        </Animated.Text>
      ))}
    </View>
  );
}

function AnimatedDelta({ text, style }) {
  return (
    <View className="flex-row" key={text}>
      {[...text].map((char, i) => (
        <Animated.Text
          key={i}
          entering={FadeInUp.delay(i * 20).duration(350)}
          className="text-xs"
          style={style}
        >
          {char === ' ' ? ' ' : char}
        </Animated.Text>
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
            variant="active"
            radius={9999}
            onPress={() => onChange(opt.id)}
            className="px-3 py-1"
          >
            <Text className="text-white text-[11px] font-medium">{opt.label}</Text>
          </GlassPressable>
        ) : (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            className="px-3 py-1 rounded-full"
          >
            <Text className="text-white/30 text-[11px] font-medium">{opt.label}</Text>
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
  selectedYear,
  onYearChange,
  selectedDay,
  onDayChange,
}) {
  const { month: currMonth, year: currYear } = currentMonthYear();

  const chartData = useMemo(() => {
    if (timeRange === 'month') return getDailyTotals(transactions, currMonth, currYear);
    if (timeRange === '5y')    return getLifetimeYearly(transactions);
    const { income, expense } = getMonthlyTotals(transactions, year);
    return { income, expense, labels: MONTH_LABELS_SHORT };
  }, [transactions, timeRange, year, currYear, currMonth]);

  const yearsList = useMemo(() =>
    timeRange === '5y' ? (chartData.years ?? chartData.labels.map(Number)) : []
  , [timeRange, chartData]);

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
    if (timeRange === '5y' && selectedYear != null) {
      const idx = yearsList.indexOf(selectedYear);
      return idx >= 0 ? (inc_ ? chartData.income[idx] : chartData.expense[idx]) : 0;
    }
    const arr = inc_ ? chartData.income : chartData.expense;
    return arr.reduce((a, b) => a + b, 0);
  }, [chartTab, chartData, timeRange, transactions, selectedMonth, year, selectedYear, yearsList]);

  const delta = useMemo(() => {
    if (chartTab === 'overview' || timeRange !== 'year') return null;
    return getDelta(transactions, chartTab, selectedMonth, year);
  }, [chartTab, timeRange, transactions, selectedMonth, year]);

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
    if (selectedYear != null)  return String(selectedYear);
    if (yearsList.length)      return `${yearsList[0]} – ${currYear}`;
    return String(currYear);
  }, [timeRange, selectedMonth, currYear, currMonth, selectedYear, yearsList]);

  const lineChartData = useMemo(() => {
    if (timeRange !== 'year' || year < currYear) return chartData;
    const end = new Date().getMonth() + 1;
    return {
      income:  chartData.income.slice(0, end),
      expense: chartData.expense.slice(0, end),
      labels:  chartData.labels.slice(0, end),
    };
  }, [chartData, timeRange, year, currYear]);

  const animKey   = `${chartTab}-${timeRange}-${year}`;
  const labelStep = timeRange === 'month' ? 4 : 1;

  return (
    <View className="mx-4 mb-2 p-5">
      <Text className="text-white/40 text-sm text-center mb-1">{periodLabel}</Text>

      <View className="items-center justify-center mb-1">
        <AnimatedAmount value={Math.abs(displayAmount)} color={isOverview ? (netPositive ? '#4ade80' : '#f87171') : '#ffffff'} />
      </View>

      <View className="items-center justify-center mb-5" style={{ minHeight: 16 }}>
        {isOverview ? null : deltaText ? (
          <View className="flex-row items-center" style={{ gap: 3 }}>
            <AnimatedDelta text={deltaText} style={{ color: deltaColor }} />
            {arrow && <Text className="text-xs font-medium" style={{ color: deltaColor }}>{arrow}</Text>}
          </View>
        ) : (
          <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</Text>
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
            timeRange === '5y' && selectedYear != null ? yearsList.indexOf(selectedYear) :
            -1
          }
          onBarClick={
            timeRange === 'month' ? (i) => onDayChange(i + 1) :
            timeRange === 'year' ? onMonthChange :
            timeRange === '5y' ? (i) => onYearChange(yearsList[i]) :
            null
          }
          onDeselect={timeRange === 'month' ? () => onDayChange(null) : null}
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
