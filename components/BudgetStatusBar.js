import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency, currentMonthYear } from '../utils/format';
import { textColor as textColorTone, EXPENSE, EXPENSE_HEX } from '../utils/colors';
import { Card, ProgressBar } from './savingsShared';
import { MONTH_NAMES } from '../utils/monthlyRecap';

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
//
// No month label, no separate caption — one line ("spent of budget") and a
// slim progress bar (same 5px pill as GoalCard's own, on Savings/Debt),
// red only once actually over. The line's own colour is what says "over";
// no word spells it out any more.
function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup, light = false }) {
  const textColor = light ? '#111111' : '#ffffff';
  const dimmerColor = textColorTone(light).tertiary;
  const { month: currMonth } = currentMonthYear();
  const monthLabel = `${MONTH_NAMES[currMonth]} budget`;

  if (loading) return null;

  if (!hasBudget) {
    return (
      <Card light={light}>
        <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={{ padding: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: textColor }}>{monthLabel}</Text>
          <Text style={{ fontSize: 13, color: dimmerColor }}>Set a budget ›</Text>
        </Pressable>
      </Card>
    );
  }

  const isOver = spent > amount;
  const cappedPercent = Math.min(percent, 100);

  return (
    <Card light={light}>
      <View style={{ padding: 20 }}>
        <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: '400', color: textColor }}>{monthLabel}</Text>
          {/* Solid hex here, not the alpha EXPENSE the bar fill uses below —
              blended over this row's plain card background at 0.92 alpha it
              read as a visibly duller red than the same value filling the
              bar (which sits over the lighter track). The opaque hex reads
              as the one consistent red regardless of what's under it. Stays
              red once over budget — that's a state worth flagging — but
              otherwise sits at the same neutral tone as a goal card's own
              percent, rather than a green that means nothing extra here. */}
          <Text className="text-[13px] font-medium" style={{ color: isOver ? EXPENSE_HEX : dimmerColor }}>{Math.round(percent)}%</Text>
        </View>

        {/* Same shape as GoalCard's own bar: track tinted a faint version of
            the fill colour instead of plain gray, red only once over budget. */}
        <ProgressBar
          percent={cappedPercent}
          height={8}
          light={light}
          color={isOver ? EXPENSE : '#4ade80'}
          trackColor={isOver ? 'rgba(255,75,75,0.12)' : 'rgba(74,222,128,0.12)'}
        />

        <View className="flex-row items-baseline" style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ fontSize: 13, color: dimmerColor }}>{formatCurrency(spent)}</Text>
          <Text style={{ fontSize: 13, color: dimmerColor }}>of {formatCurrency(amount)} budget</Text>
        </View>
      </View>
    </Card>
  );
}

export default memo(BudgetStatusBar);
