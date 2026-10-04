import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, currentMonthYear } from '../utils/format';
import { textColor as textColorTone, EXPENSE, EXPENSE_HEX } from '../utils/colors';
import { Card, ProgressBar, dim } from './savingsShared';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { TABULAR } from '../utils/type';

// Same shape as a Savings/Debt goal card (see GoalCard.js): a name/status
// row, the headline amount below it with its "of X" suffix folded into the
// same line, then a thin bar. Red only once actually over — the line's own
// colour is what says "over", no word spells it out.
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
          <Text style={{ fontSize: 15, fontWeight: '400', color: dimmerColor }}>{monthLabel}</Text>
          <Text style={{ fontSize: 15, color: dimmerColor }}>Set a budget ›</Text>
        </Pressable>
      </Card>
    );
  }

  const isOver = spent > amount;
  const cappedPercent = Math.min(percent, 100);

  return (
    <Card light={light}>
      <View style={{ padding: 20 }}>
        <View className="flex-row items-baseline justify-between">
          <Text style={{ fontSize: 15, fontWeight: '400', color: dimmerColor }}>{monthLabel}</Text>
          {/* Solid hex here, not the alpha EXPENSE the bar fill uses below —
              blended over this row's plain card background at 0.92 alpha it
              read as a visibly duller red than the same value filling the
              bar (which sits over the lighter track). The opaque hex reads
              as the one consistent red regardless of what's under it. */}
          <Text style={{ fontSize: 15, fontWeight: '400', color: isOver ? EXPENSE_HEX : dimmerColor }}>{Math.round(percent)}%</Text>
        </View>

        <Text style={{ fontSize: 24, fontWeight: '600', marginTop: 10, color: primaryColor, ...TABULAR }}>
          {formatCurrency(spent)}
          <Text style={{ fontSize: 15, fontWeight: '400', color: dimmerColor }}> of {formatCurrency(amount)}</Text>
        </Text>

        <View style={{ marginTop: 14 }}>
          <ProgressBar
            percent={cappedPercent}
            height={5}
            light={light}
            color={isOver ? EXPENSE : '#4ade80'}
            trackColor={isOver ? 'rgba(255,75,75,0.15)' : dim(light, 0.1)}
          />
        </View>
      </View>
    </Card>
  );
}

export default memo(BudgetStatusBar);
