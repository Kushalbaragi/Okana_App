import { useEffect, useState } from 'react';
import { Modal, View, Pressable, StyleSheet, useWindowDimensions, Platform, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';

// Shared fade-backdrop + slide/scale-content shell, extracted from AddModal's
// pattern. RN's built-in Modal animationType only animates the whole modal
// as one transform (backdrop slides with the content, which looks wrong for
// a backdrop) — this drives backdrop opacity and content transform
// independently with Reanimated instead, and keeps the Modal mounted
// through the close animation so it can actually play.
export function AnimatedModal({ open, onClose, onClosed, variant = 'bottom', dim = 1, children }) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [visible, setVisible] = useState(open);
  const backdropOpacity = useSharedValue(0);
  const progress = useSharedValue(0); // 0 closed → 1 open

  // Tracked manually (not via KeyboardAvoidingView) — React state naturally
  // ignores a setState call with the same value, which is exactly the
  // protection needed here: moving focus between two TextInputs fires a
  // fresh keyboardWillShow even though the keyboard's height hasn't
  // actually changed, and KeyboardAvoidingView's own internal animation was
  // visibly re-triggering on every one of those, producing a jump each time
  // focus moved. Same pattern already used in AddModal.js.
  //
  // The plain state value alone isn't enough though — mixed straight into an
  // animated style array, a change to it applies instantly on React's next
  // render instead of interpolating, so the content would still visibly
  // snap the moment the keyboard height genuinely changes (open vs close).
  // Animating a shared value toward it gets both: deduped triggers AND a
  // smooth transition.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOffset = useSharedValue(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  useEffect(() => {
    keyboardOffset.value = withTiming(keyboardHeight, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [keyboardHeight, keyboardOffset]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      backdropOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      progress.value = withTiming(1, { duration: 380, easing: Easing.bezier(0.16, 1, 0.3, 1) });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) });
      progress.value = withTiming(
        0,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        finished => {
          if (!finished) return;
          runOnJS(setVisible)(false);
          // Fires only once the native <Modal> is actually gone — callers
          // that need to present a different Modal right after this one
          // closes should wait for this instead of guessing a delay. Two
          // native Modals mounted at once is broken on Android.
          if (onClosed) runOnJS(onClosed)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const contentStyle = useAnimatedStyle(() => {
    if (variant === 'bottom') {
      // Folds the open/close slide and the keyboard-follow offset into one
      // transform — when open (progress=1) this is just -keyboardOffset;
      // while closed it's still safely off-screen regardless of keyboard state.
      return { transform: [{ translateY: (1 - progress.value) * windowHeight - keyboardOffset.value }] };
    }
    // Scale + a settle-in translateY (instead of scale alone) — matches the
    // "digit-up"/ease-out-expo reveal feel used elsewhere in the web app
    // (cubic-bezier(0.16,1,0.3,1)) rather than a flat cross-fade.
    return {
      opacity: progress.value,
      transform: [
        { translateY: (1 - progress.value) * 14 },
        { scale: 0.94 + progress.value * 0.06 },
      ],
    };
  });
  const centerAreaStyle = useAnimatedStyle(() => ({ paddingBottom: keyboardOffset.value }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} />
          </Animated.View>
        </Pressable>

        {variant === 'center' ? (
          // Animated paddingBottom shrinks the area this centers within once
          // the keyboard is up, so a focused TextInput inside `children`
          // doesn't end up covered by it — interpolated via keyboardOffset
          // rather than snapping straight to the raw keyboard height.
          <Animated.View
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }, centerAreaStyle]}
            pointerEvents="box-none"
          >
            <Animated.View style={contentStyle} pointerEvents="auto">
              {/* Plain (non-animated) wrapper with a concrete pixel width —
                  Animated.View above has no definite width of its own here
                  (alignItems:center on the ancestor leaves it shrink-wrapped),
                  so any `w-full` a child asks for can't resolve against it
                  reliably on native Yoga. Putting the width fix on a plain
                  View instead of the Animated.View itself sidesteps a
                  react-native-web + Reanimated quirk where a static style
                  merged into an animated style array doesn't apply. */}
              <View style={{ width: windowWidth - 48, alignItems: 'center' }}>
                {children}
              </View>
            </Animated.View>
          </Animated.View>
        ) : (
          // The keyboard-follow offset is folded into contentStyle's own
          // transform above — this stays pinned to the true bottom edge.
          <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0 }, contentStyle]}>
            {children}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
