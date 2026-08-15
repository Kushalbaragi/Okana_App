import { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import TransactionItem from './TransactionItem';
import { monthLabel } from '../utils/format';

function MonthGroup({ group, isOverview, isIncome, onEdit }) {
  return (
    <View>
      <View className="flex-row items-center justify-between mb-2 mt-6">
        <Text className="text-white/35 text-sm font-medium uppercase tracking-wider">
          {monthLabel(group.month, group.year)}
        </Text>
      </View>

      <View className="bg-surface rounded-xl overflow-hidden px-3">
        {group.txs.map(tx => (
          <TransactionItem
            key={tx.id}
            tx={tx}
            isIncome={isOverview ? tx.type === 'income' : isIncome}
            onEdit={onEdit}
          />
        ))}
      </View>
    </View>
  );
}

function TransactionList({
  transactions,
  activeTab,
  chartTab   = 'expense',
  selectedMonth,
  year,
  timeRange  = 'year',
  selectedYear,
  selectedDay,
  onEdit,
}) {
  const isOverview = chartTab === 'overview';
  const isIncome   = activeTab === 'income';

  const shouldGroup = isOverview || timeRange === '5y';

  const filtered = useMemo(() => {
    return transactions
      .filter(tx => {
        const d = new Date(tx.date);

        if (timeRange === 'month' && selectedDay != null) {
          if (d.getDate() !== selectedDay || d.getMonth() !== selectedMonth || d.getFullYear() !== year) return false;
          if (!isOverview && tx.type !== activeTab) return false;
          return true;
        }

        if (!isOverview && tx.type !== activeTab) return false;

        if (timeRange === '5y') {
          if (selectedYear != null) return d.getFullYear() === selectedYear;
          return true;
        }
        return d.getMonth() === selectedMonth && d.getFullYear() === year;
      })
      .sort(
        (a, b) =>
          new Date(b.date) - new Date(a.date) ||
          new Date(b.createdAt) - new Date(a.createdAt),
      );
  }, [transactions, activeTab, isOverview, selectedMonth, year, timeRange, selectedYear, selectedDay]);

  const groups = useMemo(() => {
    if (!shouldGroup) return null;
    const map = {};
    filtered.forEach(tx => {
      const d   = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!map[key]) map[key] = { year: d.getFullYear(), month: d.getMonth(), txs: [] };
      map[key].txs.push(tx);
    });
    return Object.values(map).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month,
    );
  }, [filtered, shouldGroup]);

  const count = filtered.length;

  return (
    <View className="px-4 pb-28">
      <Text className="text-white/25 text-sm font-medium uppercase tracking-wide mt-4 mb-3 px-1">
        Transactions
      </Text>

      {count === 0 ? (
        <View className="items-center justify-center py-14 px-4">
          <Text className="text-white/25 text-base text-center">
            No {isOverview ? 'transactions' : `${activeTab}s`} for this period
          </Text>
          <Text className="text-white/15 text-sm mt-1">Tap + to add one</Text>
        </View>
      ) : shouldGroup ? (
        <View>
          {groups.map(group => (
            <MonthGroup
              key={`${group.year}-${group.month}`}
              group={group}
              isOverview={isOverview}
              isIncome={isIncome}
              onEdit={onEdit}
            />
          ))}
        </View>
      ) : (
        <View className="bg-surface rounded-xl overflow-hidden px-3">
          {filtered.map(tx => (
            <TransactionItem key={tx.id} tx={tx} isIncome={isIncome} onEdit={onEdit} />
          ))}
        </View>
      )}
    </View>
  );
}

export default memo(TransactionList);
