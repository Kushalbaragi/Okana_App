import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatNumber, budgetStatusColor } from '../utils/format';

// flex:1 segments auto-size to whatever width the calendar card ends up at
// (capped at maxWidth:340 in SpendCalendarModal, narrower on small screens)
// — that's what keeps the bar fitting any device width without horizontal
// scroll, rather than computing a device-specific segment count.
const SEGMENT_COUNT = 84;
const WRAPPER_STYLE = {
  paddingBottom: 10,
  marginBottom: 10,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(255,255,255,0.08)',
};

function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup }) {
  if (loading) return null;

  if (!hasBudget) {
    return (
      <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={WRAPPER_STYLE}>
        <Text className="text-white text-sm font-semibold">Budget</Text>
        <Text className="text-white/40 text-sm">Set a budget ›</Text>
      </Pressable>
    );
  }

  // Fill from the CAPPED percent, never the raw one — this is what keeps
  // the bar from ever exceeding its container even at 150%+.
  const cappedPercent = Math.min(percent, 100);
  const filledCount = Math.round((cappedPercent / 100) * SEGMENT_COUNT);
  const { fill } = budgetStatusColor(percent);

  return (
    <View style={WRAPPER_STYLE}>
      <View className="flex-row items-center justify-between mb-2.5">
        <Text className="text-white text-sm font-semibold">Budget</Text>
        <Text className="text-white/50 text-sm">{formatNumber(spent)} / {formatNumber(amount)}</Text>
      </View>

      <View className="flex-row" style={{ gap: 1 }}>
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 18,
              borderRadius: 3,
              backgroundColor: i < filledCount ? fill : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </View>

      <Text className="text-white/40 text-sm text-right mt-1.5">{percent}%</Text>
    </View>
  );
}

export default memo(BudgetStatusBar);
