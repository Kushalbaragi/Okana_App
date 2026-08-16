import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, budgetStatusColor } from '../utils/format';

const SEGMENT_COUNT = 24;

function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup }) {
  if (loading) return null;

  if (!hasBudget) {
    return (
      <Pressable onPress={onSetup} className="flex-row items-center justify-between mb-5">
        <Text className="text-white text-base font-semibold">Monthly Budget</Text>
        <Text className="text-white/40 text-base">Set a budget ›</Text>
      </Pressable>
    );
  }

  // Fill from the CAPPED percent, never the raw one — this is what keeps
  // the bar from ever exceeding its container even at 150%+. The percent
  // text below it still shows the true, uncapped number.
  const cappedPercent = Math.min(percent, 100);
  const filledCount = Math.round((cappedPercent / 100) * SEGMENT_COUNT);
  const { fill, text } = budgetStatusColor(percent);
  const remaining = amount - spent;
  const isOver = percent >= 100;

  return (
    <View className="mb-5">
      <View className="flex-row items-center justify-between mb-2.5">
        <Text className="text-white text-base font-semibold">Monthly Budget</Text>
        <Text className="text-white/50 text-base">{formatCurrency(spent)} / {formatCurrency(amount)}</Text>
      </View>

      <View className="flex-row mb-2.5" style={{ gap: 3 }}>
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 20,
              borderRadius: 4,
              backgroundColor: i < filledCount ? fill : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold" style={{ color: text }}>{percent}% used</Text>
        <Text className="text-white/40 text-base">
          {isOver ? `${formatCurrency(Math.abs(remaining))} over` : `${formatCurrency(remaining)} left`}
        </Text>
      </View>
    </View>
  );
}

export default memo(BudgetStatusBar);
