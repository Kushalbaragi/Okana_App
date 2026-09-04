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

// flex:1 segments auto-size to whatever width the calendar card ends up at
// (capped at maxWidth:340 in SpendCalendarModal, narrower on small screens)
// — that's what keeps the bar fitting any device width without horizontal
// scroll, rather than computing a device-specific segment count.
const SEGMENT_COUNT = 63;
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

  const statusLabel = `${Math.round(percent)}% used`;

  return (
    <View style={wrapperStyle}>
      <View className="flex-row items-center justify-between mb-2.5">
        <Text className="text-sm font-semibold" style={{ color: textColor }}>Budget</Text>
        <Text className="text-sm" style={{ color: dimColor }}>{formatCurrency(spent)} / {formatCurrency(amount)}</Text>
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
              <View key={i} style={{ flex: 1, height: 18,backgroundColor: FILL_COLOR }} />
            ))}
          </View>
        </Animated.View>
      </View>

      <Text className="text-sm text-right mt-1.5" style={{ color: dimmerColor }}>{statusLabel}</Text>
    </View>
  );
}

export default memo(BudgetStatusBar);
