import { Children, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// A row of full-screen pages of which one shows, and changing `index` slides the
// next one in from the right while the current one slides out to the left — both
// on one clock, so they move as a single sheet. Ease-in-out (slow off the mark,
// slow into place), deliberately not the app's usual settle curve: that one is
// all deceleration, which would make the outgoing page jump away.
export const SLIDE_MS = 520;
export const SLIDE_EASING = Easing.bezier(0.65, 0, 0.35, 1);

// Where a release is headed: the position the pages would coast to if they kept
// the speed of the finger for this long (seconds). A quick flick therefore turns
// the page even when it was not dragged halfway.
const COAST_S = 0.18;
// What lets go of the finger: a spring with the finger's own speed carried in, so
// the pages carry on moving at the pace they were being dragged — they never stop
// and start again. Critically damped, so it settles without overshooting.
const RELEASE_SPRING = { damping: 30, stiffness: 240, mass: 1, overshootClamping: true };

function Layer({ k, pos, width, children }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: (k - pos.value) * width }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}

// `onIndexChange` makes the pages swipeable: they follow the finger, and on
// release settle on whichever page the drag was heading for. Without it they
// only move when `index` is changed from outside.
export default function SlideStack({ index, onIndexChange, children }) {
  const { width } = useWindowDimensions();
  const pos = useSharedValue(index);
  const startPos = useSharedValue(index);
  const count = Children.count(children);
  // The page a swipe has already sent the pages to; the effect below must not
  // start its own slower slide to it.
  const settlingTo = useRef(null);

  useEffect(() => {
    if (settlingTo.current === index) { settlingTo.current = null; return; }
    settlingTo.current = null;
    pos.value = withTiming(index, { duration: SLIDE_MS, easing: SLIDE_EASING });
  }, [index, pos]);

  const commit = useCallback((target) => {
    settlingTo.current = target;
    onIndexChange?.(target);
  }, [onIndexChange]);

  const swipe = Gesture.Pan()
    .enabled(!!onIndexChange)
    // Horizontal only: a vertical drag on a page is left to whatever is under it.
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      // Picks the pages up wherever they are — even partway through settling —
      // and starts from the finger's current point, so nothing jumps.
      cancelAnimation(pos);
      startPos.value = pos.value + e.translationX / width;
    })
    .onUpdate((e) => {
      const next = startPos.value - e.translationX / width;
      // A page past either end gives a little, not freely.
      pos.value = Math.min(count - 1 + 0.15, Math.max(-0.15, next));
    })
    .onEnd((e) => {
      const from = Math.round(startPos.value);
      const projected = pos.value - (e.velocityX / width) * COAST_S;
      // At most one page per swipe, and never past either end.
      const target = Math.min(count - 1, Math.max(0, from - 1, Math.min(from + 1, Math.round(projected))));
      pos.value = withSpring(target, { ...RELEASE_SPRING, velocity: -e.velocityX / width });
      runOnJS(commit)(target);
    });

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View style={StyleSheet.absoluteFill}>
        {Children.toArray(children).map((child, k) => (
          <Layer key={child.key ?? k} k={k} pos={pos} width={width}>
            {child}
          </Layer>
        ))}
      </Animated.View>
    </GestureDetector>
  );
}
