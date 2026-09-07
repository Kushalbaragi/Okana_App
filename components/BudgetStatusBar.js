import { memo, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { formatCurrency } from '../utils/format';

// Always green — the bar previously shifted to yellow/red as spend
// approached or passed the budget, but that's no longer wanted; one
// consistent color throughout. A more saturated green at higher opacity
// than the app's usual soft accent — this bar needs to actually catch the
// eye against the dark track, not blend into it.
const FILL_COLOR = 'rgba(34,197,94,0.9)';

// Same shape as SpendCalendarModal's card-settle animation: reaches near
// the target fast, then eases off gradually instead of cubic's milder,
// more even taper — keeps the initial burst but gives the last stretch a
// longer, more visible slowdown.
const GROW_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup, light = false }) {
  const wrapperStyle = {
    paddingBottom: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
  };
  const textColor = light ? '#111111' : '#ffffff';
  const dimColor = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  const dimmerColor = light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  const trackColor = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  // BudgetStatusBar fully unmounts when SpendCalendarModal closes (it
  // returns null rather than just hiding), so this component genuinely
  // remounts on every open — a mount-time animation is all that's needed
  // to make the bar grow in fresh each time, no "open" prop plumbing.
  const [barWidth, setBarWidth] = useState(0);
  const progress = useSharedValue(0);
  const cappedPercent = hasBudget ? Math.min(percent, 100) : 0;

  useEffect(() => {
    if (!hasBudget || !barWidth) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 2600, easing: GROW_EASING });
  }, [hasBudget, barWidth, cappedPercent]);

  const fillStyle = useAnimatedStyle(() => ({
    width: barWidth * (cappedPercent / 100) * progress.value,
  }));

  if (loading) return null;

  if (!hasBudget) {
    return (
      <Pressable onPress={onSetup} className="flex-row items-center justify-between" style={wrapperStyle}>
        <Text className="text-sm font-semibold" style={{ color: textColor }}>Budget</Text>
        <Text className="text-sm" style={{ color: dimmerColor }}>Set a budget ›</Text>
      </Pressable>
    );
  }

  const remaining = amount - spent;
  const isOver = remaining < 0;
  const heroAmount = formatCurrency(Math.abs(remaining));
  const heroSuffix = isOver ? 'over' : 'left';
  const usedLabel = isOver ? `${Math.round(percent - 100)}% over budget` : `${Math.round(percent)}% of budget used`;

  return (
    <View style={wrapperStyle}>
      <Text className="text-sm font-semibold mb-2.5" style={{ color: textColor }}>Budget</Text>

      <View className="flex-row items-baseline justify-center mb-4" style={{ gap: 6 }}>
        <Text style={{ color: textColor, fontSize: 32, fontWeight: '600', letterSpacing: -0.5 }}>{heroAmount}</Text>
        <Text style={{ color: dimColor, fontSize: 15 }}>{heroSuffix}</Text>
      </View>

      <View
        style={{ height: 6, borderRadius: 3, backgroundColor: trackColor, overflow: 'hidden' }}
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Grows via an animated clip width — a single UI-thread width
            animation stays smooth at 60fps. */}
        <Animated.View
          pointerEvents="none"
          style={[{ height: 6, borderRadius: 3, backgroundColor: FILL_COLOR }, fillStyle]}
        />
      </View>

      <View className="flex-row items-center justify-between mt-2.5">
        <Text className="text-xs" style={{ color: dimmerColor }}>{usedLabel}</Text>
        <Text className="text-xs" style={{ color: dimmerColor }}>{formatCurrency(amount)} total</Text>
      </View>
    </View>
  );
}

export default memo(BudgetStatusBar);
