import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrency } from '../utils/format';
import { textColor as textColorTone, EXPENSE, EXPENSE_HEX } from '../utils/colors';
import { Card, POSITIVE, dim } from './savingsShared';

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

  if (loading) return null;

  if (!hasBudget) {
    return (
      <Card light={light}>
        <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={{ padding: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: textColor }}>Budget</Text>
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
        <View className="flex-row items-baseline justify-between" style={{ marginBottom: 12 }}>
          <View className="flex-row items-baseline" style={{ gap: 6 }}>
            <Text style={{ fontSize: 30, fontWeight: '400', letterSpacing: -1, color: textColor }}>{formatCurrency(spent)}</Text>
            <Text style={{ fontSize: 13, color: dimmerColor }}>of {formatCurrency(amount)} budget</Text>
          </View>
          {/* Solid hex here, not the alpha EXPENSE the bar fill uses below —
              blended over this row's plain card background at 0.92 alpha it
              read as a visibly duller red than the same value filling the
              bar (which sits over the lighter track). The opaque hex reads
              as the one consistent red regardless of what's under it. */}
          <Text className="text-[13px] font-medium" style={{ color: isOver ? EXPENSE_HEX : POSITIVE }}>{Math.round(percent)}%</Text>
        </View>

        {/* Track always shows full width so the line stays visible even at
            0% — the coloured portion inside it is the only variable width.
            Colour alone carries the state now: green under budget, red over. */}
        <View style={{ height: 5, width: '100%', borderRadius: 2.5, overflow: 'hidden', backgroundColor: dim(light, 0.08) }}>
          <View style={{ height: '100%', borderRadius: 2.5, width: `${cappedPercent}%`, backgroundColor: isOver ? EXPENSE : POSITIVE }} />
        </View>
      </View>
    </Card>
  );
}

export default memo(BudgetStatusBar);
