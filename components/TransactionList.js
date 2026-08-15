import { memo, useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
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

const ListHeader = (
  <Text className="text-white/25 text-sm font-medium uppercase tracking-wide mt-4 mb-3 px-1">
    Transactions
  </Text>
);

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

  if (count === 0) {
    return (
      <View className="px-4 pb-28">
        {ListHeader}
        <View className="items-center justify-center py-14 px-4">
          <Text className="text-white/25 text-base text-center">
            No {isOverview ? 'transactions' : `${activeTab}s`} for this period
          </Text>
          <Text className="text-white/15 text-base mt-1">Tap + to add one</Text>
        </View>
      </View>
    );
  }

  // "All Time" / Overview has no date bound — it can be every transaction
  // the user has ever logged. Rendering that with a plain `.map()` inside a
  // ScrollView mounts every item at once, which is exactly what made
  // switching to "All Time" feel slow with real history. FlatList
  // virtualizes instead: grouped view virtualizes per month (so opening a
  // multi-year history only mounts the handful of months on screen),
  // flat view virtualizes per transaction.
  if (shouldGroup) {
    return (
      <FlatList
        data={groups}
        keyExtractor={g => `${g.year}-${g.month}`}
        renderItem={({ item }) => (
          <MonthGroup group={item} isOverview={isOverview} isIncome={isIncome} onEdit={onEdit} />
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      />
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={tx => tx.id}
      renderItem={({ item, index }) => (
        <View
          className="bg-surface px-3"
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: index === 0 ? 12 : 0,
            borderTopRightRadius: index === 0 ? 12 : 0,
            borderBottomLeftRadius: index === filtered.length - 1 ? 12 : 0,
            borderBottomRightRadius: index === filtered.length - 1 ? 12 : 0,
          }}
        >
          <TransactionItem tx={item} isIncome={isIncome} onEdit={onEdit} />
        </View>
      )}
      ListHeaderComponent={ListHeader}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112 }}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    />
  );
}

export default memo(TransactionList);
