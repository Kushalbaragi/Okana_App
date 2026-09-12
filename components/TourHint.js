import { useEffect, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

// Same "settle" ease-out-expo feel used everywhere else in the app.
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const TOOLTIP_MARGIN = 14;
const TOOLTIP_WIDTH = 280;
const HOLE_PADDING = 8;
const HOLE_RADIUS = 14;
// Thinner than the original cutout's stroke (was 2) — just enough to read
// as an outline, not a boxed frame.
const BORDER_WIDTH = 1.25;
const BORDER_COLOR = 'rgba(74,222,128,0.85)';

// A minimal coach-mark: a thin green outline around the real on-screen
// target (measured live via measureInWindow), and a small card with just
// the description text — no title, no step counter, no buttons. Tapping
// anywhere on screen dismisses it. Callers own the "has this been seen"
// state (see useTourStep) and just flip `visible` once that resolves to
// false.
export function TourHint({ visible, targetRef, description, onNext }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [rect, setRect] = useState(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible || !targetRef?.current) { setRect(null); return; }
    targetRef.current.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
    });
  }, [visible, targetRef]);

  useEffect(() => {
    if (visible && rect) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: 260, easing: SETTLE_EASING });
    }
  }, [visible, rect, progress]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  if (!visible || !rect) return null;

  // Prefers sitting below the target; flips above it if there isn't
  // enough room left at the bottom of the screen. Anchored by `bottom`
  // (not `top`) in the above-placement case — the tooltip's height
  // depends on its text, which isn't known ahead of a render, so
  // anchoring from the edge nearest the target avoids needing to measure
  // it first.
  const spaceBelow = winH - (rect.y + rect.height);
  const placeAbove = spaceBelow < 160 && rect.y > 160;
  const tooltipLeft = Math.min(
    Math.max(rect.x + rect.width / 2 - TOOLTIP_WIDTH / 2, 16),
    winW - TOOLTIP_WIDTH - 16,
  );
  const tooltipPosition = placeAbove
    ? { bottom: winH - rect.y + TOOLTIP_MARGIN }
    : { top: rect.y + rect.height + TOOLTIP_MARGIN };

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 }}
      pointerEvents="box-none"
    >
      {/* Full-screen, invisible — a tap anywhere dismisses the step, not
          just the Next button. Rendered first so the tooltip's own Skip/
          Next buttons below (drawn on top) still get first claim on taps
          over themselves. */}
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={onNext}
      />

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: rect.x - HOLE_PADDING,
          top: rect.y - HOLE_PADDING,
          width: rect.width + HOLE_PADDING * 2,
          height: rect.height + HOLE_PADDING * 2,
          borderRadius: HOLE_RADIUS,
          borderWidth: BORDER_WIDTH,
          borderColor: BORDER_COLOR,
        }}
      />

      <Animated.View
        style={[
          { position: 'absolute', left: tooltipLeft, width: TOOLTIP_WIDTH, ...tooltipPosition },
          contentStyle,
        ]}
        pointerEvents="box-none"
      >
        <View
          className="rounded-2xl p-4"
          style={{
            backgroundColor: 'rgba(20,20,20,0.98)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.10)',
          }}
        >
          <Text className="text-white/80 text-sm" style={{ lineHeight: 19 }}>{description}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
