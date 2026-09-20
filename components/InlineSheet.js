import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { SETTLE_EASING } from './AmountField';

// Backdrop opacity while open — the same soft tint AddModal uses.
const BACKDROP_MAX_OPACITY = 0.55;
const OPEN_MS = 340;
const CLOSE_MS = 240;

// A bottom sheet that lives INSIDE its parent screen instead of in its own
// native <Modal>. The calendar/savings page is already a native Modal, and
// mounting a second one on top of it is broken on Android (see the notes in
// SpendCalendarModal and app/(app)/index.js) — so the sheets opened from
// that page can't be Modals. This fills its parent absolutely and slides up
// over everything in it, header included; render it as the parent's last
// child.
//
// Stays mounted through the close animation (`visible`), and unmounts its
// whole tree once closed so the sheet's content isn't re-rendering while
// nothing is showing.
export function InlineSheet({ open, onClose, onClosed, heightRatio = 0.86, light = false, children }) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = windowHeight * heightRatio;
  const [visible, setVisible] = useState(open);
  const progress = useSharedValue(0); // 0 closed -> 1 open

  useEffect(() => {
    if (open) {
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

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * BACKDROP_MAX_OPACITY }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * sheetHeight }] }));

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
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            overflow: 'hidden',
          },
          sheetStyle,
        ]}
      >
        <View style={{ paddingTop: 10, paddingBottom: 16, alignItems: 'center' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }} />
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </View>
  );
}
