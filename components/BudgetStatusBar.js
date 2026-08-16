import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, budgetStatusColor } from '../utils/format';

const SEGMENT_COUNT = 24;
const WRAPPER_STYLE = {
  paddingBottom: 14,
  marginBottom: 14,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(255,255,255,0.08)',
};

function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup }) {
  if (loading) return null;

  if (!hasBudget) {
    return (
      <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={WRAPPER_STYLE}>
        <Text className="text-white text-sm font-semibold">Monthly Budget</Text>
        <Text className="text-white/40 text-sm">Set a budget ›</Text>
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
    <View style={WRAPPER_STYLE}>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white text-sm font-semibold">Monthly Budget</Text>
        <Text className="text-white/50 text-sm">{formatCurrency(spent)} / {formatCurrency(amount)}</Text>
      </View>

      <View className="flex-row mb-2" style={{ gap: 2 }}>
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 2,
              backgroundColor: i < filledCount ? fill : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold" style={{ color: text }}>{percent}% spent</Text>
        <Text className="text-white/40 text-sm">
          {isOver ? `${formatCurrency(Math.abs(remaining))} over` : `${formatCurrency(remaining)} left`}
        </Text>
      </View>
    </View>
  );
}

export default memo(BudgetStatusBar);
