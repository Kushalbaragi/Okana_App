import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, currentMonthYear } from '../utils/format';
import { textColor as textColorTone, EXPENSE, EXPENSE_HEX } from '../utils/colors';
import { Card, ProgressBar, dim } from './savingsShared';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { TABULAR, FONT } from '../utils/type';

// The budget as a title ("October budget"), one line under it with what is left
// ("₹47,500 left") and the budget itself on the right, and a bar a little taller
// than a Savings or Debt goal card's. Once spent passes the budget the line reads
// what it is over by ("₹2,000 over"), in red.
function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup, light = false }) {
  const dimmerColor = textColorTone(light).tertiary;
  const primaryColor = textColorTone(light).primary;
  const { month: currMonth } = currentMonthYear();
  const monthLabel = `${MONTH_NAMES[currMonth]} budget`;

  if (loading) return null;

  if (!hasBudget) {
    return (
      <Card light={light}>
        <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={{ padding: 20 }}>
          <Text style={{ fontSize: FONT.body, fontWeight: '400', color: dimmerColor }}>{monthLabel}</Text>
          <Text style={{ fontSize: FONT.body, color: dimmerColor }}>Set a budget ›</Text>
        </Pressable>
      </Card>
    );
  }

  const isOver = spent > amount;
  const cappedPercent = Math.min(percent, 100);

  return (
    <View>
      {/* The title sits above the card, in the same small label style as the other
          sections of this page. */}
      <Text style={{ fontSize: FONT.label, fontWeight: '500', letterSpacing: 0.8, textTransform: 'uppercase', color: textColorTone(light).disabled, paddingHorizontal: 16, marginBottom: 8 }}>
        {monthLabel}
      </Text>
    <Card light={light}>
      <View style={{ paddingVertical: 18, paddingHorizontal: 20 }}>
        {/* What is left (or, once spent passes the budget, what it is over by).
            Solid hex for the over-budget red, not the alpha EXPENSE the bar fill
            uses — blended over the card at 0.92 alpha it read as a visibly duller
            red than the same value filling the bar. */}
        <View className="flex-row items-baseline justify-between">
          <Text style={{ fontSize: FONT.body, fontWeight: '400', color: primaryColor, ...TABULAR }}>
            {formatCurrency(Math.abs(amount - spent))}
            <Text style={{ color: isOver ? EXPENSE_HEX : dimmerColor }}>{isOver ? ' over' : ' left'}</Text>
          </Text>
          {/* The budget itself, quietly, on the other side. */}
          <Text style={{ fontSize: FONT.body, fontWeight: '400', color: dimmerColor, ...TABULAR }}>{formatCurrency(amount)}</Text>
        </View>

        <View style={{ marginTop: 12 }}>
          <ProgressBar
            percent={cappedPercent}
            height={7}
            light={light}
            color={isOver ? EXPENSE : '#4ade80'}
            trackColor={isOver ? 'rgba(255,75,75,0.15)' : dim(light, 0.1)}
          />
        </View>
      </View>
    </Card>
    </View>
  );
}

export default memo(BudgetStatusBar);
