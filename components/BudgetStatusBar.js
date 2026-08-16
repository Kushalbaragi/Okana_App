import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, budgetStatusColor } from '../utils/format';

const SEGMENT_COUNT = 24;

function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup }) {
  if (loading) return null;

  if (!hasBudget) {
    return (
      <Pressable
        onPress={onSetup}
        className="flex-row items-center justify-between rounded-2xl px-4 py-3 mb-4"
        style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <Text className="text-white/40 text-sm font-medium uppercase tracking-wider">Monthly Budget</Text>
        <Text className="text-white/40 text-base">Set a budget ›</Text>
      </Pressable>
    );
  }

  // Fill from the CAPPED percent, never the raw one — this is what keeps
  // the bar from ever exceeding its container even at 150%+. The percent
  // text above it still shows the true, uncapped number.
  const cappedPercent = Math.min(percent, 100);
  const filledCount = Math.round((cappedPercent / 100) * SEGMENT_COUNT);
  const { fill, text } = budgetStatusColor(percent);

  return (
    <View
      className="rounded-2xl px-4 py-3 mb-4"
      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <Text className="text-white/40 text-sm font-medium uppercase tracking-wider mb-2">Monthly Budget</Text>

      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base font-semibold" style={{ color: text }}>{percent}%</Text>
        <Text className="text-white/50 text-base">{formatCurrency(spent)} / {formatCurrency(amount)}</Text>
      </View>

      <View className="flex-row" style={{ gap: 2 }}>
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 10,
              borderRadius: 2,
              backgroundColor: i < filledCount ? fill : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </View>
    </View>
  );
}

export default memo(BudgetStatusBar);
