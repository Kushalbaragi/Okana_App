import { useEffect, useRef } from 'react';
import { Keyboard, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { POPUP_RADIUS, SMOOTH } from './Glass';
import { SETTLE_EASING } from '../utils/motion';

const BACKDROP_MAX_OPACITY = 0.55;
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

export function InlineSheet({ open, onClose, onClosed, heightRatio = 0.86, light = false, dismissible = true, footer = null, children }) {
  const { height: windowHeight } = useWindowDimensions();
  const targetHeight = windowHeight * heightRatio;
  const sheetH = useSharedValue(targetHeight);
  const hasOpened = useRef(false);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      sheetH.value = targetHeight;
      drag.value = 0;
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
    sheetH.value = withTiming(targetHeight, { duration: HEIGHT_MS, easing: SETTLE_EASING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetHeight]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_MAX_OPACITY * (1 - Math.min(1, drag.value / sheetH.value)),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetH.value,
    transform: [{ translateY: (1 - progress.value) * sheetH.value + drag.value }],
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
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <View style={{ paddingTop: 10, paddingBottom: 16, alignItems: 'center' }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }} />
            </View>
            <View style={{ flex: 1 }}>{children}</View>
          </View>
        </GestureDetector>
        {footer}
      </Animated.View>
    </View>
  );
}
