import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, currentMonthYear } from '../utils/format';
import { textColor as textColorTone, EXPENSE } from '../utils/colors';
import { Card, ProgressBar } from './savingsShared';
import { MONTH_NAMES } from '../utils/monthlyRecap';

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
//
// Simple on purpose: a title, a gray card, the headline amount, a plain bar
// (the same one Savings/Debt use), and the two numbers underneath — the
// custom 63-segment candlestick bar this used to draw itself is gone, along
// with the border-bottom-divider dance that only existed to separate it from
// whatever sat below; the card's own edge does that now.
function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup, light = false }) {
  const textColor = light ? '#111111' : '#ffffff';
  const dimColor = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  const dimmerColor = textColorTone(light).tertiary;
  const cappedPercent = hasBudget ? Math.min(percent, 100) : 0;
  const { month } = currentMonthYear();

  if (loading) return null;

  const title = (
    <Text style={{ fontSize: 15, fontWeight: '500', letterSpacing: -0.2, marginBottom: 14, color: dimmerColor }}>
      {MONTH_NAMES[month]} Budget
    </Text>
  );

  if (!hasBudget) {
    return (
      <View>
        {title}
        <Card light={light}>
          <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={{ padding: 16 }}>
            <Text className="text-sm font-semibold" style={{ color: textColor }}>Budget</Text>
            <Text className="text-sm" style={{ color: dimmerColor }}>Set a budget ›</Text>
          </Pressable>
        </Card>
      </View>
    );
  }

  const remaining = amount - spent;
  const isOver = remaining < 0;
  const heroAmount = formatCurrency(Math.abs(remaining));
  const heroSuffix = isOver ? 'over' : 'left';
  const usedLabel = isOver ? `${Math.round(percent - 100)}% over budget` : `${Math.round(percent)}% used`;
  const totalLabel = `${formatCurrency(amount)} total`;

  return (
    <View>
      {title}
      <Card light={light}>
        <View style={{ padding: 16 }}>
          <View className="flex-row items-baseline justify-center mb-4" style={{ gap: 6 }}>
            <Text style={{ color: light ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.80)', fontSize: 32, fontWeight: '600', letterSpacing: -0.5 }}>{heroAmount}</Text>
            <Text style={{ color: dimColor, fontSize: 15 }}>{heroSuffix}</Text>
          </View>

          {/* Red once spend crosses the budget — the same "money leaving" red
              used everywhere else, not a new warning colour of its own. */}
          <ProgressBar percent={cappedPercent} height={8} light={light} color={isOver ? EXPENSE : undefined} />

          <View className="flex-row items-center justify-between mt-2.5">
            <Text className="text-xs" style={{ color: dimmerColor }}>{usedLabel}</Text>
            <Text className="text-xs" style={{ color: dimmerColor }}>{totalLabel}</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

export default memo(BudgetStatusBar);
