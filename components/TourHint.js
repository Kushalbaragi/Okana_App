import { useEffect, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { CARD_RADIUS, SMOOTH } from './Glass';
import { SETTLE_EASING } from '../utils/motion';

// Same "settle" ease-out-expo feel used everywhere else in the app.
const TOOLTIP_MARGIN = 14;
const TOOLTIP_WIDTH = 280;
const HOLE_PADDING = 8;
const HOLE_RADIUS = 14;
// Thinner than the original cutout's stroke (was 2) — just enough to read
// as an outline, not a boxed frame. Exported so a caller using `hideRing`
// to draw its own ring (see the prop's comment below) can match this
// component's own look exactly.
export const TOUR_HINT_BORDER_WIDTH = 1.25;
export const TOUR_HINT_BORDER_COLOR = 'rgba(74,222,128,0.85)';
const BORDER_WIDTH = TOUR_HINT_BORDER_WIDTH;
const BORDER_COLOR = TOUR_HINT_BORDER_COLOR;

// A minimal coach-mark: a thin green outline around the real on-screen
// target (measured live via measureInWindow), and a small card with just
// the description text — no title, no step counter, no buttons. Tapping
// anywhere on screen dismisses it. Callers own the "has this been seen"
// state (see useTourStep) and just flip `visible` once that resolves to
// false.
//
// `circular` swaps the fixed HOLE_RADIUS rounded-rect for one that hugs a
// round target instead — a plain rectangle around something like the
// Settings avatar reads as a mis-measured, oversized box rather than
// spotlighting the actual circle. `padding` overrides HOLE_PADDING — a
// round target already reads as having its own breathing room from its own
// curvature, so the default rectangle gap (tuned for square/pill targets)
// leaves a visibly wider ring around a circle than around anything else.
//
// `relativeTo` (a ref to this TourHint's own ancestor) switches measurement
// from measureInWindow to measureLayout, for screens where window-absolute
// coordinates don't line up with the actual render (seen on a pushed
// native-stack screen). `hideRing` skips drawing the highlight cutout
// entirely — for a case still visibly off by a few px even with
// measureLayout (a native-stack quirk deeper than the coordinate space
// alone), the caller draws its own ring as a plain sibling of the real
// target instead, which can't misalign since there's no cross-tree
// measurement involved at all. This component still measures the target
// (via whichever method) to place the tooltip card and the tap-anywhere
// dismiss layer — a card a few px off is imperceptible, unlike a ring
// that needs to trace the target's actual edge.
export function TourHint({ visible, targetRef, description, onNext, circular = false, padding = HOLE_PADDING, relativeTo, hideRing = false }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [rect, setRect] = useState(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible || !targetRef?.current) { setRect(null); return; }
    if (relativeTo?.current) {
      targetRef.current.measureLayout(
        relativeTo.current,
        (x, y, width, height) => setRect({ x, y, width, height }),
        () => {},
      );
    } else {
      targetRef.current.measureInWindow((x, y, width, height) => {
        setRect({ x, y, width, height });
      });
    }
  }, [visible, targetRef, relativeTo]);

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

      {!hideRing && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: rect.x - padding,
            top: rect.y - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
            borderRadius: circular ? (Math.min(rect.width, rect.height) + padding * 2) / 2 : HOLE_RADIUS,
            borderWidth: BORDER_WIDTH,
            borderColor: BORDER_COLOR,
          }}
        />
      )}

      <Animated.View
        style={[
          { position: 'absolute', left: tooltipLeft, width: TOOLTIP_WIDTH, ...tooltipPosition },
          contentStyle,
        ]}
        pointerEvents="box-none"
      >
        <View
          className="p-4"
          style={{
            borderRadius: CARD_RADIUS,
            ...SMOOTH,
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
