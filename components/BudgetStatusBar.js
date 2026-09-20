import { memo, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { formatCurrency } from '../utils/format';
import { SETTLE_EASING } from '../utils/motion';

// Always green — the bar previously shifted to yellow/red as spend
// approached or passed the budget, but that's no longer wanted; one
// consistent color throughout. A more saturated green at higher opacity
// than the app's usual soft accent — this bar needs to actually catch the
// eye against the dark track, not blend into it.
const FILL_COLOR = 'rgba(34,197,94,0.9)';

// flex:1 segments auto-size to whatever width the card ends up at, so the
// candlestick bar fits any device width without horizontal scroll.
const SEGMENT_COUNT = 63;

// Same shape as SpendCalendarModal's card-settle animation: reaches near
// the target fast, then eases off gradually instead of cubic's milder,
// more even taper — keeps the initial burst but gives the last stretch a
// longer, more visible slowdown.

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
// `hideDivider` drops the bottom border-line — SpendCalendarModal sits this
// right above its own calendar grid with a wider blank gap instead, so the
// line there just reads as clutter; MonthlyRecapModal's slide keeps it.
function BudgetStatusBar({ loading, hasBudget, amount, spent, percent, onSetup, light = false, hideDivider = false }) {
  const wrapperStyle = {
    paddingBottom: 10,
    marginBottom: 16,
    ...(hideDivider ? null : {
      borderBottomWidth: 1,
      borderBottomColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
    }),
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
    progress.value = withTiming(1, { duration: 2600, easing: SETTLE_EASING });
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
  const usedLabel = isOver ? `${Math.round(percent - 100)}% over budget` : `${Math.round(percent)}% used`;
  const totalLabel = `${formatCurrency(amount)} total`;

  return (
    <View style={wrapperStyle}>
      <View className="flex-row items-baseline justify-center mb-4" style={{ gap: 6 }}>
        <Text style={{ color: light ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.80)', fontSize: 32, fontWeight: '600', letterSpacing: -0.5 }}>{heroAmount}</Text>
        <Text style={{ color: dimColor, fontSize: 15 }}>{heroSuffix}</Text>
      </View>

      <View style={{ height: 18 }}>
        <View
          className="flex-row"
          style={{ gap: 2.5, height: 18 }}
          onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        >
          {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 18, backgroundColor: trackColor }} />
          ))}
        </View>

        {/* Grows via an animated clip width rather than flipping segment
            colors — a single UI-thread width animation stays smooth at 60fps
            without re-rendering every segment every frame. */}
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0, height: 18, overflow: 'hidden' }, fillStyle]}
        >
          <View className="flex-row" style={{ gap: 2.5, height: 18, width: barWidth }}>
            {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
              <View key={i} style={{ flex: 1, height: 18, backgroundColor: FILL_COLOR }} />
            ))}
          </View>
        </Animated.View>
      </View>

      <View className="flex-row items-center justify-between mt-2.5">
        <Text className="text-xs" style={{ color: dimmerColor }}>{usedLabel}</Text>
        <Text className="text-xs" style={{ color: dimmerColor }}>{totalLabel}</Text>
      </View>
    </View>
  );
}

export default memo(BudgetStatusBar);
