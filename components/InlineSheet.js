import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { POPUP_RADIUS, SMOOTH } from './Glass';
import { SETTLE_EASING } from '../utils/motion';

const BACKDROP_MAX_OPACITY = 0.55;
// The grabber block above `children` — its own padding plus the bar itself.
// Part of what a content-sized sheet has to account for, so it's a named
// constant rather than a number buried in the JSX below.
const CHROME_H = 10 + 4 + 16;
// The least space left above a sheet that has been lifted clear of the
// keyboard, so it can never be pushed off the top of the screen.
const MIN_TOP_GAP = 12;
// How much of the screen a content-sized sheet may take before it stops
// growing and simply overflows instead.
const MAX_HEIGHT_RATIO = 0.92;
// Exported so a caller's own content can hold off playing its own layout
// animations until the sheet's own open slide has actually finished (see
// AmountEntrySheet's positionReady) — a content reflow mid-slide reads as
// the sheet stopping partway rather than one continuous motion.
export const OPEN_MS = 340;
const CLOSE_MS = 240;
const DRAG_CLOSE_MS = 400;
const DRAG_CLOSE_EASING = Easing.out(Easing.cubic);
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const HEIGHT_MS = 280;

function dismissKeyboard() {
  Keyboard.dismiss();
}

export function InlineSheet({ open, onClose, onClosed, heightRatio = 0.86, contentHeight = null, light = false, dismissible = true, footer = null, children }) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // The footer is measured rather than assumed, so a caller that hands over
  // `contentHeight` only has to know how tall its OWN content is — the
  // grabber and the footer are this component's business, not its caller's.
  const [footerH, setFooterH] = useState(0);
  const onFooterLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height;
    setFooterH(prev => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);

  // Sized to its content when the caller can say how tall that content is,
  // and to a share of the screen otherwise. The ratio was always a guess —
  // one per caller state, hand-tuned, and admitted as an estimate — and
  // whatever it guessed wrong showed up as dead space inside the sheet, at
  // whichever end the content wasn't anchored to. A measured height has no
  // slack to leave anywhere. The ratio stays as the fallback for the frames
  // before a measurement arrives.
  const fitted = contentHeight != null && contentHeight > 0 && footerH > 0
    ? Math.min(CHROME_H + contentHeight + footerH, windowHeight * MAX_HEIGHT_RATIO)
    : null;
  const targetHeight = fitted ?? windowHeight * heightRatio;
  const sheetH = useSharedValue(targetHeight);
  const hasOpened = useRef(false);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const keyboardLift = useSharedValue(0);

  // Lifted clear of the keyboard, but never further than it has to be.
  //
  // An early version moved by the keyboard's full height and, on a tall
  // sheet, shoved the card off the top of the screen even when the field
  // being typed into was never covered. The cap is what makes this safe:
  // whatever is left between the sheet's own height and the top of the
  // screen is all it will ever travel, so a short sheet clears the keyboard
  // completely and a tall one rises as far as it can and stops. Pair that
  // with a sheet sized to its content (above) rather than to a fixed share
  // of the screen, and the common forms are short enough to clear it
  // outright — which is the whole point, since a field you cannot see is a
  // field you cannot fill in.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const settle = (to, duration) => {
      keyboardLift.value = withTiming(to, { duration: duration || 250, easing: SETTLE_EASING });
    };
    const onShow = (e) => {
      const maxLift = Math.max(0, windowHeight - sheetH.value - insets.top - MIN_TOP_GAP);
      settle(Math.min(e.endCoordinates?.height ?? 0, maxLift), e.duration);
    };
    const onHide = (e) => settle(0, e?.duration);
    const shown = Keyboard.addListener(showEvent, onShow);
    const hidden = Keyboard.addListener(hideEvent, onHide);
    return () => { shown.remove(); hidden.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHeight, insets.top]);

  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      sheetH.value = targetHeight;
      drag.value = 0;
      keyboardLift.value = 0;
      progress.value = withTiming(1, { duration: OPEN_MS, easing: SETTLE_EASING });
    } else if (hasOpened.current) {
      progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, finished => {
        if (!finished) return;
        if (onClosed) runOnJS(onClosed)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!hasOpened.current || !open) return;
    // Mid-open, the height is SNAPPED rather than animated.
    //
    // The slide reads `sheetH` every frame (see sheetStyle: translateY is
    // `(1 - progress) * sheetH`), so animating the height at the same time
    // leaves translateY being driven by two timings at once — it stops
    // tracking the slide's own easing and can even reverse, which is exactly
    // what read as the sheet moving, hesitating, then moving again, with the
    // top and bottom of the card arriving at different moments. It is not a
    // rare case either: a caller that picks its height from its own state
    // (GoalSheet sizes itself to the step it's on) changes `targetHeight` in
    // the very same commit that opens the sheet. Snapping is invisible here
    // precisely because the sheet is still off-screen and moving.
    //
    // Once it has settled, a height change is a real, visible resize — a
    // field expanding, a step changing under the user — and animates.
    if (progress.value < 1) {
      sheetH.value = targetHeight;
      return;
    }
    sheetH.value = withTiming(targetHeight, { duration: HEIGHT_MS, easing: SETTLE_EASING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetHeight]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_MAX_OPACITY * (1 - Math.min(1, drag.value / sheetH.value)),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetH.value,
    transform: [{ translateY: (1 - progress.value) * sheetH.value + drag.value - keyboardLift.value }],
  }));

  const pan = Gesture.Pan()
    .enabled(dismissible)
    .activeOffsetY(12)
    .failOffsetY(-12)
    .failOffsetX([-20, 20])
    .onStart(() => {
      dragStart.value = drag.value;
      runOnJS(dismissKeyboard)();
    })
    .onUpdate(e => {
      drag.value = Math.max(0, dragStart.value + e.translationY);
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        drag.value = withTiming(sheetH.value, { duration: DRAG_CLOSE_MS, easing: DRAG_CLOSE_EASING }, finished => {
          if (!finished) return;
          progress.value = 0;
          drag.value = 0;
          runOnJS(onClose)();
          if (onClosed) runOnJS(onClosed)();
        });
      } else {
        drag.value = withTiming(0, { duration: OPEN_MS, easing: SETTLE_EASING });
      }
    });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: light ? '#FAFAF8' : '#161616',
            borderTopLeftRadius: POPUP_RADIUS, borderTopRightRadius: POPUP_RADIUS, ...SMOOTH,
            overflow: 'hidden',
          },
          sheetStyle,
        ]}
      >
        {/* The footer wins, in paint and in touch.
            Layout is untouched (footer keeps its natural height, children
            take the rest via flex:1) — this is only about who is on top
            where the two overlap, which happens when a row's expanded panel
            runs past the row list's own fixed height. Children used to win
            that, so an expanded section covered the footer and swallowed its
            taps: the primary action sat there looking enabled and did
            nothing until the section was closed again. A caller's CTA has to
            stay reachable at all times, so content that spills goes behind
            it, not over it. */}
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <View style={{ paddingTop: 10, paddingBottom: 16, alignItems: 'center' }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }} />
            </View>
            <View style={{ flex: 1 }}>{children}</View>
          </View>
        </GestureDetector>
        <View style={{ zIndex: 1 }} onLayout={onFooterLayout}>{footer}</View>
      </Animated.View>
    </View>
  );
}
