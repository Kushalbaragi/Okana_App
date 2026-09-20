import { useEffect, useState } from 'react';
import { Keyboard, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { SETTLE_EASING } from './AmountField';
import { POPUP_RADIUS, SMOOTH } from './Glass';

// Backdrop opacity while open — the same soft tint AddModal uses.
const BACKDROP_MAX_OPACITY = 0.55;
const OPEN_MS = 340;
const CLOSE_MS = 240;
// A drag-dismiss carries on from where the finger left off, so it eases out
// (fastest at the start) rather than in, and takes a little longer than a
// tapped close, which starts from rest. Same reasoning as AddModal's.
const DRAG_CLOSE_MS = 400;
const DRAG_CLOSE_EASING = Easing.out(Easing.cubic);
// How far (px) or how fast (px/s) a downward drag has to go to count as
// dismissing the sheet rather than letting it spring back — the same as AddModal.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

// Named, plain functions for runOnJS: they run on the UI thread's behalf, so
// what a gesture callback hands to runOnJS has to be an ordinary function, not
// a method on an object it would have to copy across.
function dismissKeyboard() {
  Keyboard.dismiss();
}

// A bottom sheet that lives INSIDE its parent screen instead of in its own
// native <Modal>. The calendar/savings page is already a native Modal, and
// mounting a second one on top of it is broken on Android (see the notes in
// SpendCalendarModal and app/(app)/index.js) — so the sheets opened from
// that page can't be Modals. This fills its parent absolutely and slides up
// over everything in it, header included; render it as the parent's last
// child.
//
// Drag down to dismiss, from the grabber or anywhere on `children`, the way
// AddModal does. `footer` is drawn below and is NOT part of that: a plain
// button or key that a drag happens to start on contests the touch with the
// gesture right as it activates (the "freezes partway" glitch AddModal's own
// comments describe), so the action row and keypad live there. A drag has to
// start downward, and gives way if it goes sideways first, so the sheet's
// horizontal scrollers (the amount ruler, the suggestion chips) keep working.
// `dismissible` false (a save is in flight, say) switches the drag off, so it
// can't slide the sheet away when `onClose` is going to refuse.
//
// Stays mounted through the close animation (`visible`), and unmounts its
// whole tree once closed so the sheet's content isn't re-rendering while
// nothing is showing.
export function InlineSheet({ open, onClose, onClosed, heightRatio = 0.86, light = false, dismissible = true, footer = null, children }) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = windowHeight * heightRatio;
  const [visible, setVisible] = useState(open);
  const progress = useSharedValue(0); // 0 closed -> 1 open
  const drag = useSharedValue(0); // px the sheet has been pulled down, on top of that
  const dragStart = useSharedValue(0);

  useEffect(() => {
    if (open) {
      drag.value = 0;
      setVisible(true);
      progress.value = withTiming(1, { duration: OPEN_MS, easing: SETTLE_EASING });
    } else {
      progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, finished => {
        if (!finished) return;
        runOnJS(setVisible)(false);
        if (onClosed) runOnJS(onClosed)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fades with the same distance the sheet has travelled, whether it is closing
  // on its own or being dragged.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_MAX_OPACITY * (1 - Math.min(1, drag.value / sheetHeight)),
  }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * sheetHeight + drag.value }] }));

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
        // Carries on from where the finger left it. The parent is told only once
        // the sheet is off the bottom — telling it first would have its re-render
        // land on the UI thread a frame or two into the slide and stutter it. The
        // resting state is set to match (nothing moves) before it is told, so
        // what it does next starts from a closed sheet.
        drag.value = withTiming(sheetHeight, { duration: DRAG_CLOSE_MS, easing: DRAG_CLOSE_EASING }, finished => {
          if (!finished) return;
          progress.value = 0;
          drag.value = 0;
          runOnJS(onClose)();
          runOnJS(setVisible)(false);
          if (onClosed) runOnJS(onClosed)();
        });
      } else {
        drag.value = withTiming(0, { duration: OPEN_MS, easing: SETTLE_EASING });
      }
    });

  if (!visible) return null;

  return (
    // `open`, not `visible`, decides whether this takes touches — visible
    // stays true for the whole close animation, during which the page
    // underneath should already be usable again.
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute', left: 0, right: 0, bottom: 0, height: sheetHeight,
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
