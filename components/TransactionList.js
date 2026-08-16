import { memo, useMemo } from 'react';
import { View, Text, SectionList } from 'react-native';
import TransactionItem from './TransactionItem';
import { monthLabel } from '../utils/format';

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

  // Single source of truth for both render paths — SectionList just gets
  // one untitled section when the view isn't grouped, so there's only one
  // rendering strategy (and one set of virtualization knobs) to reason
  // about instead of two diverging FlatList branches.
  const sections = useMemo(() => {
    if (!shouldGroup) {
      return filtered.length ? [{ key: 'all', title: null, data: filtered }] : [];
    }
    const map = {};
    filtered.forEach(tx => {
      const d   = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!map[key]) map[key] = { key, title: monthLabel(d.getMonth(), d.getFullYear()), data: [] };
      map[key].data.push(tx);
    });
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered, shouldGroup]);

  if (filtered.length === 0) {
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
  // the user has ever logged, potentially spanning years with many
  // transactions per month. SectionList virtualizes per row across
  // sections (unlike a hand-rolled "one FlatList item = one month's full
  // unvirtualized sub-list", which still mounts every transaction in
  // whichever months happen to be on screen). Rounded-card look is
  // reproduced per-row via section-relative index instead of a shared
  // non-virtualized wrapper.
  return (
    <SectionList
      sections={sections}
      keyExtractor={tx => tx.id}
      renderItem={({ item, index, section }) => (
        <View
          className="bg-surface px-3"
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: index === 0 ? 12 : 0,
            borderTopRightRadius: index === 0 ? 12 : 0,
            borderBottomLeftRadius: index === section.data.length - 1 ? 12 : 0,
            borderBottomRightRadius: index === section.data.length - 1 ? 12 : 0,
          }}
        >
          <TransactionItem
            tx={item}
            isIncome={isOverview ? item.type === 'income' : isIncome}
            onEdit={onEdit}
          />
        </View>
      )}
      renderSectionHeader={({ section }) =>
        section.title ? (
          <View className="flex-row items-center justify-between mb-2 mt-6 bg-bg">
            <Text className="text-white/35 text-sm font-medium uppercase tracking-wider">
              {section.title}
            </Text>
          </View>
        ) : null
      }
      ListHeaderComponent={ListHeader}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112 }}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

export default memo(TransactionList);
